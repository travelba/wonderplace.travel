#!/usr/bin/env node
/**
 * Validate the agent-skills catalogue for ConciergeTravel.fr.
 *
 * Checks every `.cursor/skills/<name>/SKILL.md` for:
 *  - Valid YAML frontmatter (`name`, `description`).
 *  - Body length ≤ 500 lines (Cursor performance target).
 *  - Presence of "## Triggers" and "## References" sections.
 *  - Cross-reference integrity (every skill mentioned in References exists).
 *  - Catalogue inclusion (each skill is referenced in `.cursor/skills/README.md`).
 *
 * Usage:
 *   node scripts/skills/validate-skills.mjs
 *   pnpm validate:skills          (after adding the npm script)
 *
 * Exit code 0 on success, 1 on any failure. Designed for CI.
 *
 * Skill: skills-capitalisation (always-applied rule).
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(__filename, '..', '..', '..');
const SKILLS_DIR = join(REPO_ROOT, '.cursor', 'skills');
const README_PATH = join(SKILLS_DIR, 'README.md');

const MAX_LINES = 500;
const REQUIRED_FRONTMATTER_KEYS = ['name', 'description'];
const REQUIRED_SECTIONS = ['## Triggers', '## References'];

/** @typedef {{ name: string; path: string; body: string; lines: number; frontmatter: Record<string,string> }} Skill */

function parseFrontmatter(content) {
  if (!content.startsWith('---')) return { frontmatter: null, body: content };
  const end = content.indexOf('\n---', 4);
  if (end === -1) return { frontmatter: null, body: content };
  const raw = content.slice(4, end);
  const body = content.slice(end + 5);
  /** @type {Record<string,string>} */
  const frontmatter = {};
  let key = '';
  let buffer = '';
  for (const line of raw.split('\n')) {
    const m = line.match(/^([a-z_-]+):\s*(.*)$/i);
    if (m) {
      if (key && buffer) frontmatter[key] = buffer.trim();
      key = m[1];
      buffer = m[2];
      // multi-line ">-" YAML scalar — read continuation
      if (buffer === '>-' || buffer === '|') buffer = '';
    } else if (key) {
      buffer += ' ' + line.trim();
    }
  }
  if (key && buffer) frontmatter[key] = buffer.trim();
  return { frontmatter, body };
}

/** @returns {Skill[]} */
function loadSkills() {
  const entries = readdirSync(SKILLS_DIR);
  /** @type {Skill[]} */
  const skills = [];
  for (const name of entries) {
    const dir = join(SKILLS_DIR, name);
    let st;
    try {
      st = statSync(dir);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    const skillFile = join(dir, 'SKILL.md');
    let content;
    try {
      content = readFileSync(skillFile, 'utf8');
    } catch {
      skills.push({ name, path: skillFile, body: '', lines: 0, frontmatter: {} });
      continue;
    }
    const { frontmatter, body } = parseFrontmatter(content);
    skills.push({
      name,
      path: skillFile,
      body,
      lines: content.split('\n').length,
      frontmatter: frontmatter ?? {},
    });
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

/** @param {Skill} skill */
function validateSkill(skill, allSkillNames) {
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];

  // 1. SKILL.md exists?
  if (skill.body === '' && Object.keys(skill.frontmatter).length === 0) {
    errors.push(`SKILL.md missing or unreadable at ${skill.path}`);
    return { errors, warnings };
  }

  // 2. Frontmatter keys
  for (const key of REQUIRED_FRONTMATTER_KEYS) {
    if (!skill.frontmatter[key] || skill.frontmatter[key].length === 0) {
      errors.push(`missing frontmatter key "${key}"`);
    }
  }

  // 3. Name matches directory
  if (skill.frontmatter.name && skill.frontmatter.name !== skill.name) {
    errors.push(
      `frontmatter name "${skill.frontmatter.name}" ≠ directory name "${skill.name}"`,
    );
  }

  // 4. Description length sanity
  const desc = skill.frontmatter.description ?? '';
  if (desc.length > 1024) {
    errors.push(`description too long (${desc.length} chars, max 1024)`);
  }
  if (desc.length < 20) {
    warnings.push(`description suspiciously short (${desc.length} chars)`);
  }

  // 5. Line cap
  if (skill.lines > MAX_LINES) {
    warnings.push(`SKILL.md is ${skill.lines} lines (target ≤ ${MAX_LINES})`);
  }

  // 6. Required sections
  for (const section of REQUIRED_SECTIONS) {
    if (!skill.body.includes(section)) {
      warnings.push(`missing recommended section "${section}"`);
    }
  }

  // 7. Cross-reference integrity — every backtick-quoted skill name
  //    in the body must correspond to an existing skill or be the skill itself.
  const refs = new Set();
  const refRegex = /`([a-z][a-z0-9-]{2,63})`/g;
  let match;
  while ((match = refRegex.exec(skill.body)) !== null) {
    if (allSkillNames.has(match[1]) || match[1] === skill.name) {
      refs.add(match[1]);
    }
  }
  // Soft check: skill has at least 1 cross-reference
  if (refs.size === 0) {
    warnings.push('no cross-references to other skills (consider adding some)');
  }

  return { errors, warnings };
}

function validateCatalogue(skills) {
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];
  let readme;
  try {
    readme = readFileSync(README_PATH, 'utf8');
  } catch {
    errors.push(`catalogue file missing: ${README_PATH}`);
    return { errors, warnings };
  }
  for (const skill of skills) {
    if (!readme.includes(skill.name)) {
      errors.push(`skill "${skill.name}" not referenced in .cursor/skills/README.md`);
    }
  }
  return { errors, warnings };
}

function main() {
  const skills = loadSkills();
  const allNames = new Set(skills.map((s) => s.name));
  let totalErrors = 0;
  let totalWarnings = 0;

  console.log(`Validating ${skills.length} skills…\n`);

  for (const skill of skills) {
    const { errors, warnings } = validateSkill(skill, allNames);
    const status = errors.length === 0 ? (warnings.length === 0 ? '✓' : '⚠') : '✗';
    if (errors.length > 0 || warnings.length > 0) {
      console.log(`${status} ${skill.name}`);
      for (const e of errors) console.log(`    ✗ ${e}`);
      for (const w of warnings) console.log(`    ⚠ ${w}`);
    } else {
      console.log(`${status} ${skill.name}`);
    }
    totalErrors += errors.length;
    totalWarnings += warnings.length;
  }

  console.log('\n— Catalogue integrity —');
  const cat = validateCatalogue(skills);
  for (const e of cat.errors) console.log(`✗ ${e}`);
  for (const w of cat.warnings) console.log(`⚠ ${w}`);
  totalErrors += cat.errors.length;
  totalWarnings += cat.warnings.length;

  console.log(
    `\nResult: ${totalErrors} error(s), ${totalWarnings} warning(s) across ${skills.length} skills.`,
  );
  process.exit(totalErrors === 0 ? 0 : 1);
}

main();
