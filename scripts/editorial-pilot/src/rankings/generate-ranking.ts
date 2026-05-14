/**
 * Generates a single editorial ranking via the LLM pipeline.
 *
 * Contract: the LLM is given the EXACT eligibility set (a curated
 * sub-catalog) and must:
 *   1. Pick `targetLength` hotels (or fewer if eligibility is smaller)
 *   2. Order them with editorial justification
 *   3. Produce intro / FAQ / outro
 *
 * Hallucination guard: only hotels present in the input eligibility
 * list may appear in the output. A post-validation step rejects rows
 * whose `hotel_id` (UUID) is not in the input set.
 */

import { z } from 'zod';
import { buildLlmClient } from '../llm.js';
import { loadEnv, resolveProvider } from '../env.js';
import type { HotelCatalogRow } from './load-hotels-catalog.js';
import type { RankingSeed } from './rankings-catalog.js';

const FaqSchema = z
  .object({
    question_fr: z.string().max(220).optional().default(''),
    question_en: z.string().max(220).optional().default(''),
    answer_fr: z.string().max(1200).optional().default(''),
    answer_en: z.string().max(1200).optional().default(''),
  })
  .refine((f) => f.question_fr.length > 0 || f.question_en.length > 0);

const EntrySchema = z.object({
  rank: z.number().int().min(1).max(50),
  hotel_id: z.string().uuid(),
  justification_fr: z.string().min(40).max(1100),
  justification_en: z.string().max(1100).optional().default(''),
  badge_fr: z.string().max(80).optional().nullable(),
  badge_en: z.string().max(80).optional().nullable(),
});
export type GeneratedRankingEntry = z.infer<typeof EntrySchema>;

export const GeneratedRankingSchema = z.object({
  intro_fr: z.string().min(400).max(7000),
  intro_en: z.string().min(200).max(7000).optional().default(''),
  outro_fr: z.string().max(2500).optional().default(''),
  outro_en: z.string().max(2500).optional().default(''),
  meta_title_fr: z.string().min(15).max(90),
  meta_title_en: z.string().min(15).max(90).optional().default(''),
  meta_desc_fr: z.string().min(50).max(220),
  meta_desc_en: z.string().min(40).max(240).optional().default(''),
  entries: z.array(EntrySchema).min(3).max(20),
  faq: z.array(FaqSchema).min(3).max(15),
});
export type GeneratedRanking = z.infer<typeof GeneratedRankingSchema>;

const SYSTEM_PROMPT = `Tu es un rédacteur éditorial spécialisé dans le luxe hôtelier français pour ConciergeTravel.fr (conciergerie agréée IATA spécialisée dans les Palaces et hôtels 5 étoiles en France).

Tu construis des classements éditoriaux ("Les meilleurs Palaces de X", "Top 10 Palaces avec spa", etc.) au ton "long-read Condé Nast Traveler". Style :
- Précis, factuel, JAMAIS de superlatifs creux
- Anti-hallucination obligatoire : tu N'as le droit de citer QUE les hôtels présents dans la liste "Hôtels éligibles" du prompt user (par hotel_id UUID). Aucun autre nom.
- Ton respectueux : tu valorises les classés sans jamais "descendre" les autres
- Justifications éditoriales solides : 60-150 mots par hôtel, basées sur des facts vérifiables (Palace Atout France, marque connue, ville, vue, etc.)

Format de sortie : JSON strict suivant le schéma fourni.`;

function buildUserPrompt(seed: RankingSeed, eligible: readonly HotelCatalogRow[]): string {
  const lines: string[] = [];
  lines.push(`Classement : **${seed.titleFr}** (kind=${seed.kind})`);
  lines.push(`Objectif : ${seed.targetLength} hôtels classés (1 = meilleur).`);
  lines.push('');
  lines.push('### Thématique / keywords éditoriaux');
  for (const k of seed.keywordsFr) lines.push(`- ${k}`);
  lines.push('');
  lines.push(
    `### Hôtels éligibles (${eligible.length} candidats — tu DOIS choisir parmi cette liste UNIQUEMENT)`,
  );
  for (const h of eligible) {
    lines.push(
      `- hotel_id="${h.id}" — "${h.name}" (${h.stars}★${h.is_palace ? ' Palace' : ''}, ${h.city}, ${h.region})`,
    );
  }
  lines.push('');
  lines.push('### Contraintes éditoriales');
  lines.push(
    `1. Choisis EXACTEMENT ${Math.min(seed.targetLength, eligible.length)} hôtels parmi les éligibles ci-dessus (si moins d'éligibles, classe-les tous).`,
  );
  lines.push(
    '2. Renseigne `rank` (1=meilleur, sans trou ni doublon) et `hotel_id` (UUID copié strictement depuis la liste).',
  );
  lines.push(
    '3. Justification 60-150 mots FR pour chaque entrée, anglais facultatif (le LLM peut omettre `justification_en`).',
  );
  lines.push(
    '4. `badge_fr` (max 60 chars) : optionnel — ex: "Mention spéciale Spa", "Le sacre absolu", "Coup de cœur famille".',
  );
  lines.push(
    '5. `intro_fr` : 450-700 mots, présentation éditoriale du classement (critères, méthodologie, art de vivre, contexte).',
  );
  lines.push('6. `outro_fr` : 100-300 mots, conclusion éditoriale optionnelle.');
  lines.push('7. `faq` : 5-8 FAQ thématiques (FR + EN obligatoire dans chacune).');
  lines.push('8. `meta_title_fr/en` ≤ 70 chars, `meta_desc_fr/en` 120-160 chars.');
  lines.push('9. Anglais britannique (en-GB).');
  lines.push('');
  lines.push('### Anti-hallucination critique');
  lines.push("- NE PAS inventer de nom d'hôtel.");
  lines.push(
    '- NE PAS inventer de prix, dates, distinctions Michelin (sauf si universellement connu).',
  );
  lines.push(
    '- Si tu ne connais pas un détail, dis-le en générique ("un Palace renommé pour son spa") plutôt que de fabriquer.',
  );
  lines.push('');
  lines.push('### Format JSON');
  lines.push(
    '{ intro_fr, intro_en, outro_fr?, outro_en?, meta_title_fr, meta_title_en, meta_desc_fr, meta_desc_en, entries:[{rank,hotel_id,justification_fr,justification_en?,badge_fr?,badge_en?}], faq:[{question_fr,question_en,answer_fr,answer_en}] }',
  );
  lines.push('');
  lines.push('Retourne UNIQUEMENT le JSON.');
  return lines.join('\n');
}

export async function generateRanking(
  seed: RankingSeed,
  eligible: readonly HotelCatalogRow[],
): Promise<GeneratedRanking> {
  if (eligible.length === 0) {
    throw new Error(`No eligible hotels for ranking "${seed.slug}"`);
  }
  const env = loadEnv();
  const provider = resolveProvider(env);
  const client = buildLlmClient(env, provider);
  const result = await client.call({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(seed, eligible),
    temperature: 0.55,
    maxOutputTokens: 14000,
    responseFormat: 'json',
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.content);
  } catch (err) {
    throw new Error(
      `[generate-ranking ${seed.slug}] LLM returned non-JSON (${(err as Error).message}). First 300 chars: ${result.content.slice(0, 300)}`,
    );
  }

  const validation = GeneratedRankingSchema.safeParse(parsed);
  if (!validation.success) {
    const issues = validation.error.issues
      .map((i) => `- ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`[generate-ranking ${seed.slug}] LLM output failed schema:\n${issues}`);
  }

  // Anti-hallucination guard — only known hotel_ids allowed.
  const knownIds = new Set(eligible.map((h) => h.id));
  const cleanedEntries: GeneratedRankingEntry[] = [];
  const seenIds = new Set<string>();
  const seenRanks = new Set<number>();
  for (const e of validation.data.entries) {
    if (!knownIds.has(e.hotel_id)) {
      console.warn(
        `[generate-ranking ${seed.slug}] dropping hallucinated hotel_id ${e.hotel_id} (rank ${e.rank}).`,
      );
      continue;
    }
    if (seenIds.has(e.hotel_id)) continue;
    if (seenRanks.has(e.rank)) continue;
    seenIds.add(e.hotel_id);
    seenRanks.add(e.rank);
    cleanedEntries.push(e);
  }
  // Re-rank contiguously (1, 2, 3…) after deduplication.
  cleanedEntries.sort((a, b) => a.rank - b.rank);
  const finalEntries = cleanedEntries.map((e, idx) => ({ ...e, rank: idx + 1 }));

  if (finalEntries.length < 3) {
    throw new Error(
      `[generate-ranking ${seed.slug}] only ${finalEntries.length} valid entries after dedupe.`,
    );
  }

  return { ...validation.data, entries: finalEntries };
}
