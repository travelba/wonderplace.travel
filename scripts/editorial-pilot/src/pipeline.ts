import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { LlmClient } from './llm.js';
import { lintReport, type LinterReport } from './linter.js';
import { BriefSchema, FactCheckReportSchema, type Brief, type FactCheckReport } from './schemas.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PILOT_ROOT = resolve(__dirname, '..');
const PROMPTS_DIR = resolve(PILOT_ROOT, 'prompts');
const BRIEFS_DIR = resolve(PILOT_ROOT, 'briefs');
const OUTPUT_DIR = resolve(PILOT_ROOT, 'output');
const DOCS_PILOT_DIR = resolve(PILOT_ROOT, '../../docs/editorial/pilots');

interface PassResult {
  readonly passId: string;
  readonly passName: string;
  readonly content: string;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly durationMs: number;
}

export interface PipelineResult {
  readonly slug: string;
  readonly draft: PassResult;
  readonly variation: PassResult;
  readonly humanisation: PassResult;
  readonly factCheck: PassResult;
  readonly factCheckReport: FactCheckReport;
  readonly correction: PassResult | null;
  readonly linterFixerIterations: readonly PassResult[];
  readonly initialLintReport: LinterReport;
  readonly finalLintReport: LinterReport;
  readonly final: string;
  readonly totalTokens: { input: number; output: number };
}

const MAX_LINTER_FIXER_ITERATIONS = 3;

async function loadBrief(slug: string): Promise<Brief> {
  const path = resolve(BRIEFS_DIR, `${slug}.json`);
  const raw = await readFile(path, 'utf-8');
  const parsed = BriefSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`[brief:${slug}] schema validation failed:\n${issues}`);
  }
  return parsed.data;
}

async function loadPrompt(filename: string): Promise<string> {
  return readFile(resolve(PROMPTS_DIR, filename), 'utf-8');
}

async function runPass(
  llm: LlmClient,
  passId: string,
  passName: string,
  systemPrompt: string,
  userPrompt: string,
  options: { temperature: number; maxTokens: number; jsonMode?: boolean },
): Promise<PassResult> {
  const start = Date.now();
  console.log(`  → ${passId} (${passName}) — calling ${llm.provider}/${llm.model}...`);
  const result = await llm.call({
    systemPrompt,
    userPrompt,
    temperature: options.temperature,
    maxOutputTokens: options.maxTokens,
    responseFormat: options.jsonMode === true ? 'json' : 'text',
  });
  const durationMs = Date.now() - start;
  console.log(
    `    ✓ ${passId} done in ${durationMs}ms — ${result.usage.inputTokens} in / ${result.usage.outputTokens} out`,
  );
  return {
    passId,
    passName,
    content: result.content,
    model: result.model,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    durationMs,
  };
}

function stripCodeFence(content: string): string {
  const trimmed = content.trim();
  const fenceMatch = trimmed.match(/^```(?:markdown|md|json)?\s*\n([\s\S]*?)\n```\s*$/);
  return fenceMatch?.[1]?.trim() ?? trimmed;
}

function extractJson(content: string): unknown {
  const cleaned = stripCodeFence(content);
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    }
    throw new Error(`Failed to parse JSON from fact-check response: ${(e as Error).message}`);
  }
}

export async function runPipelineForHotel(slug: string, llm: LlmClient): Promise<PipelineResult> {
  console.log(`\n━━━ ${slug} ━━━`);

  const brief = await loadBrief(slug);
  const [prompt1, prompt2, prompt3, prompt4, prompt5, prompt6] = await Promise.all([
    loadPrompt('01-draft-factuel.md'),
    loadPrompt('02-variation-syntaxique.md'),
    loadPrompt('03-humanisation-magazine.md'),
    loadPrompt('04-fact-check.md'),
    loadPrompt('05-correctrice-post-fact-check.md'),
    loadPrompt('06-linter-fixer.md'),
  ]);

  const outputDir = resolve(OUTPUT_DIR, slug);
  await mkdir(outputDir, { recursive: true });

  const draft = await runPass(
    llm,
    'pass-1',
    'draft factuel',
    prompt1,
    `=== BRIEF JSON ===\n${JSON.stringify(brief, null, 2)}`,
    { temperature: 0.3, maxTokens: 4000 },
  );
  const draftMd = stripCodeFence(draft.content);
  await writeFile(resolve(outputDir, '01-draft.md'), draftMd, 'utf-8');

  const variation = await runPass(
    llm,
    'pass-2',
    'variation syntaxique',
    prompt2,
    `Voici le draft factuel produit par le Pass 1. Applique la variation syntaxique anti-IA en suivant strictement le system prompt.\n\n=== DRAFT PASS 1 ===\n${draftMd}`,
    { temperature: 0.85, maxTokens: 4500 },
  );
  const variationMd = stripCodeFence(variation.content);
  await writeFile(resolve(outputDir, '02-variation.md'), variationMd, 'utf-8');

  const humanisation = await runPass(
    llm,
    'pass-3',
    'humanisation magazine',
    prompt3,
    `Voici le texte produit par les Pass 1 et 2 (draft factuel + variation syntaxique). Applique la transformation magazine premium signée IATA en suivant strictement le system prompt, en t'appuyant aussi sur le brief JSON pour les détails sensoriels plausibles et le verbatim conseiller.\n\n=== BRIEF JSON ===\n${JSON.stringify(brief, null, 2)}\n\n=== TEXTE PASS 2 ===\n${variationMd}`,
    { temperature: 0.9, maxTokens: 5500 },
  );
  const humanisationMd = stripCodeFence(humanisation.content);
  await writeFile(resolve(outputDir, '03-humanisation.md'), humanisationMd, 'utf-8');

  const factCheck = await runPass(
    llm,
    'pass-4',
    'fact-check',
    prompt4,
    `=== BRIEF JSON ===\n${JSON.stringify(brief, null, 2)}\n\n=== TEXTE PASS 3 ===\n${humanisationMd}`,
    { temperature: 0.1, maxTokens: 4000, jsonMode: llm.provider === 'openai' },
  );
  const rawFactCheck = extractJson(factCheck.content);
  const factCheckParsed = FactCheckReportSchema.safeParse(rawFactCheck);
  if (!factCheckParsed.success) {
    const issues = factCheckParsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    console.warn(
      `[fact-check:${slug}] schema validation issues (continuing with raw report):\n${issues}`,
    );
  }
  const factCheckReport: FactCheckReport = factCheckParsed.success
    ? factCheckParsed.data
    : ({
        hotel_slug: slug,
        summary: {
          facts_ok: 0,
          warn_medium: 0,
          warn_low: 0,
          hallucinations: 0,
          tbd_leftover: 0,
          divergent_numbers: 0,
          cultural_to_verify: 0,
        },
        findings: [],
        final_recommendation: 'MANUAL_REVIEW_REQUIRED',
        blockers_for_publication: ['Fact-check report schema validation failed — see raw report'],
      } as FactCheckReport);
  await writeFile(
    resolve(outputDir, '04-fact-check.json'),
    JSON.stringify(factCheckReport, null, 2),
    'utf-8',
  );

  let correction: PassResult | null = null;
  let final = humanisationMd;

  const needsCorrection =
    factCheckReport.final_recommendation === 'NEEDS_PASS_2BIS' ||
    factCheckReport.summary.hallucinations > 0 ||
    factCheckReport.summary.divergent_numbers > 0;

  if (needsCorrection) {
    correction = await runPass(
      llm,
      'pass-5',
      'correctrice post-fact-check',
      prompt5,
      `=== BRIEF JSON ===\n${JSON.stringify(brief, null, 2)}\n\n=== TEXTE PASS 3 ===\n${humanisationMd}\n\n=== FACT-CHECK REPORT (Pass 4) ===\n${JSON.stringify(factCheckReport, null, 2)}`,
      { temperature: 0.4, maxTokens: 5500 },
    );
    final = stripCodeFence(correction.content);
    await writeFile(resolve(outputDir, '05-correction.md'), final, 'utf-8');
  } else {
    console.log(`  → Pass 4 verdict READY_TO_PUBLISH — skipping Pass 5 correction`);
  }

  const initialLintReport = lintReport(final);
  await writeFile(
    resolve(outputDir, '06-linter-initial.json'),
    JSON.stringify(initialLintReport, null, 2),
    'utf-8',
  );
  console.log(
    `  → Initial linter: ${initialLintReport.counts.total} violations (blocker=${initialLintReport.counts.blocker}, high=${initialLintReport.counts.high}, medium=${initialLintReport.counts.medium}, low=${initialLintReport.counts.low})`,
  );

  const linterFixerIterations: PassResult[] = [];
  let currentLintReport = initialLintReport;

  for (let iter = 1; iter <= MAX_LINTER_FIXER_ITERATIONS; iter++) {
    if (currentLintReport.clean) {
      console.log(`  → Linter clean (no blocker/high) — skipping Pass 6 iteration ${iter}`);
      break;
    }
    if (currentLintReport.violations.length === 0) break;

    const violationsToShow = currentLintReport.violations.filter(
      (v) => v.severity === 'blocker' || v.severity === 'high' || v.severity === 'medium',
    );

    const linterFixer = await runPass(
      llm,
      `pass-6.${iter}`,
      `linter-fixer iter ${iter}`,
      prompt6,
      `=== TEXTE PASS 5 ===\n${final}\n\n=== RAPPORT DU LINTER ===\n${JSON.stringify({ violations: violationsToShow }, null, 2)}`,
      { temperature: 0.3, maxTokens: 5500 },
    );
    linterFixerIterations.push(linterFixer);
    final = stripCodeFence(linterFixer.content);
    await writeFile(resolve(outputDir, `06-linter-fixer-iter${iter}.md`), final, 'utf-8');
    currentLintReport = lintReport(final);
    await writeFile(
      resolve(outputDir, `06-linter-after-iter${iter}.json`),
      JSON.stringify(currentLintReport, null, 2),
      'utf-8',
    );
    console.log(
      `  → After Pass 6 iter ${iter}: ${currentLintReport.counts.total} violations (blocker=${currentLintReport.counts.blocker}, high=${currentLintReport.counts.high}, medium=${currentLintReport.counts.medium})`,
    );
  }

  await writeFile(resolve(outputDir, 'final.md'), final, 'utf-8');

  await mkdir(DOCS_PILOT_DIR, { recursive: true });
  await writeFile(resolve(DOCS_PILOT_DIR, `${slug}.md`), final, 'utf-8');

  const linterFixerTokens = linterFixerIterations.reduce(
    (acc, p) => ({ input: acc.input + p.inputTokens, output: acc.output + p.outputTokens }),
    { input: 0, output: 0 },
  );

  const totals = {
    input:
      draft.inputTokens +
      variation.inputTokens +
      humanisation.inputTokens +
      factCheck.inputTokens +
      (correction?.inputTokens ?? 0) +
      linterFixerTokens.input,
    output:
      draft.outputTokens +
      variation.outputTokens +
      humanisation.outputTokens +
      factCheck.outputTokens +
      (correction?.outputTokens ?? 0) +
      linterFixerTokens.output,
  };

  const summary = {
    slug,
    provider: llm.provider,
    model: llm.model,
    totals_tokens: totals,
    pass_durations_ms: {
      draft: draft.durationMs,
      variation: variation.durationMs,
      humanisation: humanisation.durationMs,
      fact_check: factCheck.durationMs,
      ...(correction ? { correction: correction.durationMs } : {}),
      linter_fixer_iterations_ms: linterFixerIterations.map((p) => p.durationMs),
    },
    fact_check_recommendation: factCheckReport.final_recommendation,
    fact_check_summary: factCheckReport.summary,
    blockers: factCheckReport.blockers_for_publication,
    pass_5_applied: correction !== null,
    linter: {
      initial: initialLintReport.counts,
      final: currentLintReport.counts,
      iterations: linterFixerIterations.length,
      clean: currentLintReport.clean,
    },
  };
  await writeFile(resolve(outputDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf-8');
  console.log(`  → Final markdown written: ${resolve(DOCS_PILOT_DIR, `${slug}.md`)}`);
  console.log(`  → Fact-check verdict: ${factCheckReport.final_recommendation}`);
  if (correction) {
    console.log(`  → Pass 5 correction applied`);
  }
  console.log(
    `  → Linter final: ${currentLintReport.counts.total} (${currentLintReport.clean ? 'CLEAN' : 'STILL HAS BLOCKER/HIGH'}), iterations: ${linterFixerIterations.length}`,
  );

  return {
    slug,
    draft,
    variation,
    humanisation,
    factCheck,
    factCheckReport,
    correction,
    linterFixerIterations,
    initialLintReport,
    finalLintReport: currentLintReport,
    final,
    totalTokens: totals,
  };
}

export async function listAvailableBriefs(): Promise<string[]> {
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(BRIEFS_DIR);
  return entries
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();
}
