/**
 * Builds a single idempotent `seed-palaces.sql` from every brief
 * in `briefs-auto/*.json` + corresponding editorial markdown in
 * `docs/editorial/pilots-auto/*.md`.
 *
 * Output: `scripts/editorial-pilot/out/seed-palaces.sql`.
 *
 * The SQL is a transactional batch of `INSERT … ON CONFLICT (slug)
 * DO UPDATE SET …` statements targeting `public.hotels`. JSONB
 * payloads strictly respect the Zod schemas enforced by the
 * Next.js reader (`apps/web/src/server/hotels/get-hotel-by-slug.ts`).
 *
 * Run with:
 *   pnpm --filter @cct/editorial-pilot exec tsx src/import/build-import-sql.ts
 *
 * Then either pipe the file to `psql` or hand it to the Supabase
 * `apply_migration` MCP tool.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BriefSchema, type Brief } from '../schemas.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '../../');
const BRIEFS_DIR = path.join(ROOT, 'briefs-auto');
const MD_DIR = path.resolve(ROOT, '../../docs/editorial/pilots-auto');
const OUT_DIR = path.join(ROOT, 'out');
const OUT_FILE = path.join(OUT_DIR, 'seed-palaces.sql');

/** Number of hotels per generated batch file (keeps each batch < 60 KB). */
const BATCH_SIZE = 5;

// ---------------------------------------------------------------------------
// Address / postal-code helpers
// ---------------------------------------------------------------------------

/**
 * INSEE department prefix → French region + department label.
 * Restricted to the prefixes used by the 30-palace dataset.
 */
const DEPT_TO_REGION: Record<string, { region: string; department: string }> = {
  '06': { region: "Provence-Alpes-Côte d'Azur", department: 'Alpes-Maritimes' },
  '13': { region: "Provence-Alpes-Côte d'Azur", department: 'Bouches-du-Rhône' },
  '33': { region: 'Nouvelle-Aquitaine', department: 'Gironde' },
  '40': { region: 'Nouvelle-Aquitaine', department: 'Landes' },
  '73': { region: 'Auvergne-Rhône-Alpes', department: 'Savoie' },
  '74': { region: 'Auvergne-Rhône-Alpes', department: 'Haute-Savoie' },
  '75': { region: 'Île-de-France', department: 'Paris' },
  '83': { region: "Provence-Alpes-Côte d'Azur", department: 'Var' },
  '84': { region: "Provence-Alpes-Côte d'Azur", department: 'Vaucluse' },
  '97': { region: 'Saint-Barthélemy', department: 'Saint-Barthélemy' },
};

interface ParsedAddress {
  readonly streetAddress: string;
  readonly postalCode: string | null;
  readonly cityFromAddress: string | null;
  readonly region: string;
  readonly department: string | null;
}

function parseAddress(raw: string, fallbackCity: string): ParsedAddress {
  // Strip French postal-shorthand prefixes (`CS 12345`, `BP 1234`, `TSA 1234`)
  // whose 5-digit code is administrative routing, not the geographic postal
  // code. Cap-Eden-Roc's editorial address is the canonical regression case.
  const sanitized = raw.replace(/\b(?:CS|BP|TSA)\s*\d{4,5}\b/giu, '').replace(/,\s*,/gu, ',');

  // Match French (5 digits) or Saint-Barth (97133) postal codes. We pick the
  // LAST occurrence because the country code and city always trail the
  // postal code in the editorial format `<street>, <postal> <city>, FR`.
  const matches = [...sanitized.matchAll(/\b(9[78]\d{3}|\d{5})\b/gu)];
  const postalCode = matches.length > 0 ? (matches[matches.length - 1]![1] ?? null) : null;

  // Street part = everything before the first comma in the SANITIZED string,
  // fallback to the raw string. We keep the raw text for the street to
  // preserve `CS 10029` if that is genuinely part of the street designation.
  const firstComma = raw.indexOf(',');
  const streetAddress = (firstComma > 0 ? raw.slice(0, firstComma) : raw).trim();

  // City = token between postal code and the trailing country code.
  let cityFromAddress: string | null = null;
  if (postalCode !== null) {
    const after = sanitized.slice(sanitized.indexOf(postalCode) + postalCode.length);
    const cleaned = after
      .replace(/,?\s*[A-Z]{2}\s*$/u, '')
      .replace(/^[\s,]+/u, '')
      .trim();
    if (cleaned.length > 0) cityFromAddress = cleaned;
  }

  const deptPrefix = postalCode?.slice(0, 2) ?? null;
  const lookup = deptPrefix !== null ? DEPT_TO_REGION[deptPrefix] : undefined;
  const region = lookup?.region ?? 'France';
  const department = lookup?.department ?? null;

  // Belt and braces: if address parsing failed entirely, keep the brief's
  // declared city as a safety net so the row insert still validates.
  if (cityFromAddress === null) cityFromAddress = fallbackCity;

  return { streetAddress, postalCode, cityFromAddress, region, department };
}

// ---------------------------------------------------------------------------
// SQL escaping
// ---------------------------------------------------------------------------

/** Escapes a single value for a Postgres literal (single quotes). */
function sqlString(value: string | null): string {
  if (value === null) return 'NULL';
  return `'${value.replace(/'/gu, "''")}'`;
}

function sqlNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'NULL';
  return String(value);
}

function sqlBool(value: boolean): string {
  return value ? 'TRUE' : 'FALSE';
}

function sqlJsonb(value: unknown | null): string {
  if (value === null || value === undefined) return 'NULL';
  const stringified = JSON.stringify(value);
  return `${sqlString(stringified)}::jsonb`;
}

// ---------------------------------------------------------------------------
// Markdown → sections
// ---------------------------------------------------------------------------

/** Map a French section heading to a kebab anchor matching the DB regex. */
const SECTION_ANCHOR_MAP: ReadonlyArray<readonly [RegExp, string]> = [
  [/^histoire/iu, 'histoire'],
  [/^architecture/iu, 'architecture'],
  [/^l['’]?\s*expérience|^expérience|^l['’]\s*offre|^accommodation/iu, 'experience'],
  [/^restauration|^dining/iu, 'restauration'],
  [/^bien-être|^spa|^wellness/iu, 'bien-etre'],
  [/^à deux pas|^autour|^location|^à proximité/iu, 'a-deux-pas'],
  [/^service|^staff|^équipe/iu, 'service-equipe'],
  [/^en pratique|^infos|^pratique/iu, 'en-pratique'],
  [/^notre verdict|^verdict|^conclusion/iu, 'verdict'],
];

function slugAnchor(title: string): string {
  for (const [re, anchor] of SECTION_ANCHOR_MAP) {
    if (re.test(title.trim())) return anchor;
  }
  // Fallback: slugify the title.
  const slug = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 40);
  return slug.length >= 2 ? slug : 'section';
}

interface MarkdownSplit {
  /** First paragraph after the H1 (becomes `description_fr`). */
  readonly lead: string | null;
  /** Ordered (anchor, title, body) sections from H2 blocks. */
  readonly sections: ReadonlyArray<{
    readonly anchor: string;
    readonly title: string;
    readonly body: string;
  }>;
}

function splitMarkdown(md: string): MarkdownSplit {
  if (md.trim().length === 0) return { lead: null, sections: [] };

  const lines = md.split(/\r?\n/u);
  let lead: string | null = null;
  const sections: Array<{ anchor: string; title: string; body: string }> = [];

  let i = 0;
  // Skip the H1 if present.
  while (i < lines.length && lines[i] !== undefined && lines[i]!.trim().length === 0) i++;
  if (i < lines.length && lines[i] !== undefined && lines[i]!.trim().startsWith('# ')) i++;

  // Collect the lead paragraph (until the first H2 or blank-blank).
  const leadLines: string[] = [];
  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined) break;
    if (line.trim().startsWith('## ')) break;
    if (line.trim().length > 0) leadLines.push(line.trim());
    else if (leadLines.length > 0) break;
    i++;
  }
  if (leadLines.length > 0) lead = leadLines.join(' ').trim();

  // Walk H2 sections.
  let currentTitle: string | null = null;
  let currentBody: string[] = [];

  const flush = (): void => {
    if (currentTitle === null) return;
    const body = currentBody.join('\n').trim();
    if (body.length === 0) {
      currentTitle = null;
      currentBody = [];
      return;
    }
    const anchor = slugAnchor(currentTitle);
    sections.push({ anchor, title: currentTitle.trim(), body });
    currentTitle = null;
    currentBody = [];
  };

  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    if (line.trim().startsWith('## ')) {
      flush();
      currentTitle = line.trim().slice(3).trim();
      continue;
    }
    if (currentTitle !== null) currentBody.push(line);
  }
  flush();

  return { lead, sections };
}

// ---------------------------------------------------------------------------
// Domain mappers
// ---------------------------------------------------------------------------

function buildHighlights(brief: Brief): string[] {
  const h: string[] = [];
  if (brief.classification.atout_france_palace) h.push('Distinction Palace — Atout France');

  const totalKeys = numberish(brief.capacity['total_keys']);
  const roomsCount = numberish(brief.capacity['rooms_count']);
  const keys = totalKeys ?? roomsCount ?? null;
  if (keys !== null) h.push(`${keys} chambres et suites`);

  const michelinTotal = brief.dining
    .filter((d) => (d.michelin_stars ?? 0) > 0)
    .reduce((acc, d) => acc + (d.michelin_stars ?? 0), 0);
  if (michelinTotal > 0) {
    h.push(`${michelinTotal} étoile${michelinTotal > 1 ? 's' : ''} Michelin`);
  }

  const wellness = brief.wellness ?? {};
  if (wellness['partner_brand']) {
    h.push(`Spa ${String(wellness['partner_brand'])}`);
  } else if (wellness['spa_name']) {
    h.push(String(wellness['spa_name']));
  }

  const service = brief.service ?? {};
  if (service['has_concierge'] === true) h.push('Conciergerie 24/24');
  if (service['has_valet_parking'] === true) h.push('Service voiturier');

  return h.slice(0, 6);
}

function buildAmenities(brief: Brief): Array<{ key: string; label_fr: string; label_en: string }> {
  const out: Array<{ key: string; label_fr: string; label_en: string }> = [];
  const service = brief.service ?? {};
  const wellness = brief.wellness ?? {};

  if (service['has_concierge'] === true) {
    out.push({ key: 'concierge', label_fr: 'Conciergerie', label_en: 'Concierge service' });
  }
  if (service['has_valet_parking'] === true) {
    out.push({ key: 'valet-parking', label_fr: 'Voiturier', label_en: 'Valet parking' });
  }
  if (service['has_parking'] === true) {
    out.push({ key: 'parking', label_fr: 'Parking', label_en: 'Parking' });
  }
  if (service['pets_allowed'] === true) {
    out.push({ key: 'pets-allowed', label_fr: 'Animaux acceptés', label_en: 'Pets allowed' });
  }
  if (service['has_wifi'] === true || service['has_free_wifi'] === true) {
    out.push({
      key: 'wifi-free',
      label_fr: 'Wi-Fi haut débit inclus',
      label_en: 'Complimentary Wi-Fi',
    });
  }
  if (service['has_airport_shuttle'] === true) {
    out.push({ key: 'airport-shuttle', label_fr: 'Navette aéroport', label_en: 'Airport shuttle' });
  }
  if (wellness['has_pool'] === true) {
    out.push({ key: 'swimming-pool', label_fr: 'Piscine', label_en: 'Swimming pool' });
  }
  if (wellness['has_indoor_pool'] === true) {
    out.push({ key: 'indoor-pool', label_fr: 'Piscine intérieure', label_en: 'Indoor pool' });
  }
  if (wellness['has_outdoor_pool'] === true) {
    out.push({ key: 'outdoor-pool', label_fr: 'Piscine extérieure', label_en: 'Outdoor pool' });
  }
  if (wellness['has_hammam'] === true) {
    out.push({ key: 'hammam', label_fr: 'Hammam', label_en: 'Hammam' });
  }
  if (wellness['has_sauna'] === true) {
    out.push({ key: 'sauna', label_fr: 'Sauna', label_en: 'Sauna' });
  }
  if (wellness['has_fitness'] === true) {
    out.push({ key: 'fitness-center', label_fr: 'Salle de fitness', label_en: 'Fitness center' });
  }
  if (
    wellness['has_spa'] !== false &&
    (wellness['spa_name'] ?? wellness['has_spa']) !== undefined
  ) {
    out.push({ key: 'spa', label_fr: 'Spa', label_en: 'Spa' });
  }

  // Dining contributes the "Restaurant gastronomique" flag.
  if (brief.dining.some((d) => (d.michelin_stars ?? 0) > 0)) {
    out.push({
      key: 'fine-dining',
      label_fr: 'Restaurant gastronomique étoilé',
      label_en: 'Michelin-starred restaurant',
    });
  }

  return out;
}

interface RestaurantInfoJson {
  count: number;
  michelin_stars: number;
  venues: Array<{
    name: string;
    type_fr: string;
    type_en: string;
    michelin_stars?: number;
    chef?: string;
  }>;
}

function buildRestaurantInfo(brief: Brief): RestaurantInfoJson | null {
  const venues = brief.dining
    .filter((d) => d.type === 'restaurant' || d.type === undefined)
    .map((d) => {
      const typeFr = d.cuisine ?? d.style ?? 'Restaurant';
      const venue: RestaurantInfoJson['venues'][number] = {
        name: d.name,
        type_fr: typeFr,
        type_en: typeFr,
      };
      if (d.michelin_stars !== undefined && d.michelin_stars > 0) {
        venue.michelin_stars = d.michelin_stars;
      }
      const chefName = d.chef ?? d.current_chef;
      if (chefName !== undefined && chefName.length > 0) venue.chef = chefName;
      return venue;
    });

  if (venues.length === 0) return null;

  const michelinStars = venues.reduce((acc, v) => acc + (v.michelin_stars ?? 0), 0);

  return {
    count: venues.length,
    michelin_stars: michelinStars,
    venues,
  };
}

interface SpaInfoJson {
  name: string;
  features_fr?: string[];
  features_en?: string[];
}

function buildSpaInfo(brief: Brief): SpaInfoJson | null {
  const wellness = brief.wellness ?? {};
  const name =
    (wellness['spa_name'] as string | undefined) ??
    (wellness['partner_brand'] !== undefined ? `Spa ${String(wellness['partner_brand'])}` : null);
  if (name === null) return null;

  const featuresFr: string[] = [];
  const featuresEn: string[] = [];
  if (wellness['partner_brand']) {
    featuresFr.push(`Partenaire skincare : ${String(wellness['partner_brand'])}`);
    featuresEn.push(`Skincare partner: ${String(wellness['partner_brand'])}`);
  }
  if (wellness['has_pool'] === true) {
    featuresFr.push('Piscine intérieure');
    featuresEn.push('Indoor swimming pool');
  }
  if (wellness['has_hammam'] === true) {
    featuresFr.push('Hammam');
    featuresEn.push('Hammam');
  }
  if (wellness['has_sauna'] === true) {
    featuresFr.push('Sauna');
    featuresEn.push('Sauna');
  }
  if (wellness['has_fitness'] === true) {
    featuresFr.push('Salle de fitness');
    featuresEn.push('Fitness center');
  }

  const out: SpaInfoJson = { name };
  if (featuresFr.length > 0) out.features_fr = featuresFr;
  if (featuresEn.length > 0) out.features_en = featuresEn;
  return out;
}

interface FaqItemJson {
  question_fr: string;
  answer_fr: string;
  category?: 'before' | 'during' | 'after' | 'agency';
}

/**
 * FAQ extraction — GEO/AEO objective: 10+ Q/A per hotel.
 *
 * The list is built from the structured brief so every answer cites a
 * verifiable fact (no hallucination). The order is chosen so the *first*
 * questions are the ones Google AI Overviews / ChatGPT / Perplexity grab
 * most often (location → category → capacity → dining → wellness →
 * practical → context). LLM crawlers prefer dense FAQPage blocks at the
 * top of the page (cf. `docs/skills/geo-llm-optimization`).
 */
function buildFaqContent(brief: Brief): FaqItemJson[] {
  const out: FaqItemJson[] = [];
  const hotel = brief.name;
  const city = brief.city;
  const region = brief.region;
  const stars = brief.classification.stars;
  const isPalace = brief.classification.atout_france_palace;
  const service = brief.service ?? {};
  const wellness = brief.wellness ?? {};
  const architecture = brief.architecture;

  // 1. Location — almost always answered first by AI Overviews.
  out.push({
    question_fr: `Où se trouve ${hotel} ?`,
    answer_fr: `${hotel} est situé à ${city}${region !== undefined ? ` (${region})` : ''}, à l'adresse ${brief.address}.`,
    category: 'before',
  });

  // 2. Classification (stars + Palace) — combined in a single rich answer.
  if (isPalace) {
    out.push({
      question_fr: `${hotel} est-il classé Palace ?`,
      answer_fr: `Oui. ${hotel} est classé ${stars} étoiles et bénéficie de la distinction Palace décernée par Atout France, le plus haut niveau de classement hôtelier en France (réservé à une trentaine d'établissements d'exception).`,
      category: 'agency',
    });
  } else {
    out.push({
      question_fr: `Combien d'étoiles a ${hotel} ?`,
      answer_fr: `${hotel} est classé ${stars} étoiles${stars === 5 ? ' (catégorie Luxe)' : ''}.`,
      category: 'agency',
    });
  }

  // 3. Operator / brand — if the brief lists a parent group.
  if (brief.operator !== undefined && brief.operator.trim().length > 0) {
    out.push({
      question_fr: `Qui gère ${hotel} ?`,
      answer_fr: `${hotel} est opéré par ${brief.operator}.`,
      category: 'agency',
    });
  }

  // 4. Room capacity.
  const totalKeys =
    numberish(brief.capacity['total_keys']) ?? numberish(brief.capacity['rooms_count']);
  if (totalKeys !== null) {
    const minSurface = numberish(brief.capacity['min_room_surface_m2']);
    const maxSurface = numberish(brief.capacity['max_room_surface_m2']);
    let surfaceClause = '';
    if (minSurface !== null && maxSurface !== null && maxSurface > minSurface) {
      surfaceClause = `, de ${minSurface} m² à ${maxSurface} m²`;
    } else if (minSurface !== null) {
      surfaceClause = `, à partir de ${minSurface} m²`;
    }
    out.push({
      question_fr: `Combien de chambres compte ${hotel} ?`,
      answer_fr: `${hotel} dispose de ${totalKeys} chambres et suites${surfaceClause}.`,
      category: 'agency',
    });
  }

  // 5. Michelin restaurants — strong AEO signal for gastronomy queries.
  const michelinOutlets = brief.dining.filter((d) => (d.michelin_stars ?? 0) > 0);
  if (michelinOutlets.length > 0) {
    const list = michelinOutlets
      .map(
        (d) => `${d.name} (${d.michelin_stars}★${d.chef !== undefined ? `, chef ${d.chef}` : ''})`,
      )
      .join(' ; ');
    out.push({
      question_fr: `Quels sont les restaurants étoilés de ${hotel} ?`,
      answer_fr: `${hotel} abrite ${michelinOutlets.length} restaurant${
        michelinOutlets.length > 1 ? 's' : ''
      } distingué${michelinOutlets.length > 1 ? 's' : ''} par le Guide Michelin : ${list}.`,
      category: 'during',
    });
  }

  // 6. Total dining count (restaurants + bars) — even when no Michelin.
  const restaurants = brief.dining.filter((d) => d.type.toLowerCase() === 'restaurant');
  const bars = brief.dining.filter((d) => d.type.toLowerCase() === 'bar');
  if (restaurants.length > 0) {
    const parts: string[] = [
      `${restaurants.length} restaurant${restaurants.length > 1 ? 's' : ''}`,
    ];
    if (bars.length > 0) parts.push(`${bars.length} bar${bars.length > 1 ? 's' : ''}`);
    out.push({
      question_fr: `Combien de restaurants et bars compte ${hotel} ?`,
      answer_fr: `${hotel} propose ${parts.join(' et ')} sur place.`,
      category: 'during',
    });
  }

  // 7. Spa partner — Guerlain/La Prairie/Sisley signals luxury wellness.
  if (wellness['spa_name'] !== undefined) {
    const spaName = String(wellness['spa_name']);
    const partner = wellness['partner_brand'];
    out.push({
      question_fr: `Y a-t-il un spa à ${hotel} ?`,
      answer_fr: `Oui, ${hotel} dispose du ${spaName}${
        partner !== undefined ? `, en partenariat avec ${String(partner)}` : ''
      }.`,
      category: 'during',
    });
  }

  // 8. Indoor pool + wellness features — separate question because pool
  //    queries score very high on hotel intent.
  const hasPool = wellness['has_pool'] === true;
  const hasFitness = wellness['has_fitness'] === true;
  const hasHammam = wellness['has_hammam'] === true;
  const hasSauna = wellness['has_sauna'] === true;
  const wellnessFeatures: string[] = [];
  if (hasPool) wellnessFeatures.push('piscine');
  if (hasHammam) wellnessFeatures.push('hammam');
  if (hasSauna) wellnessFeatures.push('sauna');
  if (hasFitness) wellnessFeatures.push('salle de fitness');
  if (wellnessFeatures.length > 0) {
    out.push({
      question_fr: `Quels sont les équipements bien-être disponibles ?`,
      answer_fr: `${hotel} met à disposition : ${wellnessFeatures.join(', ')}.`,
      category: 'during',
    });
  }

  // 9. Check-in / check-out — practical, asked verbatim in AI assistants.
  const rawCheckIn = stringish(service['check_in_time']);
  const rawCheckOut = stringish(service['check_out_time']);
  const checkIn = rawCheckIn !== null ? (normalizeTime(rawCheckIn) ?? rawCheckIn) : null;
  const checkOut = rawCheckOut !== null ? (normalizeTime(rawCheckOut) ?? rawCheckOut) : null;
  if (checkIn !== null || checkOut !== null) {
    const parts: string[] = [];
    if (checkIn !== null)
      parts.push(`check-in à ${/^\d\d:\d\d$/u.test(checkIn) ? formatTimeFr(checkIn) : checkIn}`);
    if (checkOut !== null)
      parts.push(
        `check-out à ${/^\d\d:\d\d$/u.test(checkOut) ? formatTimeFr(checkOut) : checkOut}`,
      );
    out.push({
      question_fr: `À quelle heure peut-on arriver et partir ?`,
      answer_fr: `Les horaires standards sont : ${parts.join(', ')}.`,
      category: 'before',
    });
  }

  // 10. Pets — frequent dealbreaker question.
  if (service['pets_allowed'] === true) {
    const note = stringish(service['pet_policy_note']);
    out.push({
      question_fr: `Les animaux sont-ils acceptés à ${hotel} ?`,
      answer_fr:
        note !== null
          ? `Oui, les animaux sont acceptés. Conditions : ${note}.`
          : `Oui, les animaux sont acceptés à ${hotel}.`,
      category: 'before',
    });
  } else if (service['pets_allowed'] === false) {
    out.push({
      question_fr: `Les animaux sont-ils acceptés à ${hotel} ?`,
      answer_fr: `Non, ${hotel} n'accepte pas les animaux de compagnie.`,
      category: 'before',
    });
  }

  // 11. Parking / valet — practical, especially in dense city centers.
  const hasParking = service['has_parking'] === true;
  const hasValet = service['has_valet_parking'] === true;
  if (hasParking || hasValet) {
    const services: string[] = [];
    if (hasValet) services.push('un service voiturier');
    if (hasParking) services.push("d'un parking");
    out.push({
      question_fr: `Y a-t-il un parking ou un voiturier ?`,
      answer_fr: `${hotel} dispose ${services.join(' et ')}.`,
      category: 'before',
    });
  }

  // 12. Concierge — luxury-segment differentiator.
  if (service['has_concierge'] === true) {
    out.push({
      question_fr: `${hotel} dispose-t-il d'une conciergerie ?`,
      answer_fr: `Oui, ${hotel} met à disposition une conciergerie pour organiser réservations, transferts, expériences sur mesure et activités locales.`,
      category: 'during',
    });
  }

  // 13. Nearby POIs — when actually populated (skip AUTO_DRAFT placeholders).
  const realPois = brief.nearby_pois.filter(
    (p) => p.type !== 'placeholder' && p.distance_m > 0 && !p.name.startsWith('AUTO_DRAFT'),
  );
  if (realPois.length > 0) {
    const top = realPois
      .slice(0, 3)
      .map((p) => {
        const dist =
          p.distance_m >= 1000
            ? `${(p.distance_m / 1000).toFixed(1).replace('.', ',')} km`
            : `${p.distance_m} m`;
        return `${p.name} (${dist})`;
      })
      .join(' ; ');
    out.push({
      question_fr: `Que voir et faire à proximité de ${hotel} ?`,
      answer_fr: `Les points d'intérêt à proximité incluent : ${top}.`,
      category: 'during',
    });
  }

  // 14. History (opening year + founder).
  const openingYear = numberish(brief.history.opening_year);
  const founder = brief.history.founder_or_first_operator;
  if (openingYear !== null && openingYear > 1800) {
    const founderClause = founder !== undefined ? ` par ${founder}` : '';
    out.push({
      question_fr: `Quand ${hotel} a-t-il été ouvert ?`,
      answer_fr: `${hotel} a ouvert ses portes en ${openingYear}${founderClause}.`,
      category: 'agency',
    });
  }

  // 15. Architecture / designer — useful for editorial / cultural searches.
  const architectStyle = stringish(architecture['style']);
  const architectName = stringish(architecture['designer']) ?? stringish(architecture['architect']);
  if (architectStyle !== null || architectName !== null) {
    const parts: string[] = [];
    if (architectStyle !== null) parts.push(`style ${architectStyle}`);
    if (architectName !== null) parts.push(`signé par ${architectName}`);
    out.push({
      question_fr: `Quel est le style architectural de ${hotel} ?`,
      answer_fr: `${hotel} se distingue par son ${parts.join(', ')}.`,
      category: 'agency',
    });
  }

  // 16. Signature features — what makes the hotel unique. Falls back to
  //     the first non-Wikipedia bullet so we never echo encyclopedia prose.
  const editorialSignatures = brief.signature_features.filter(
    (s) => !/^Wikipedia[: ]/u.test(s.trim()),
  );
  if (editorialSignatures.length > 0) {
    const text = editorialSignatures[0]!;
    out.push({
      question_fr: `Quelles sont les particularités uniques de ${hotel} ?`,
      answer_fr: text.length > 280 ? `${text.slice(0, 277)}…` : text,
      category: 'agency',
    });
  }

  // 17. How to book — surfaces the ConciergeTravel booking model
  //     (the front-office is `display_only` for these palace fiches).
  out.push({
    question_fr: `Comment réserver à ${hotel} via ConciergeTravel ?`,
    answer_fr: `${hotel} fait partie de notre sélection éditoriale. Pour une demande sur mesure (dates, type de chambre, transferts, expériences), contactez notre conciergerie via le formulaire de la fiche : nous revenons sous 24 h avec une proposition détaillée.`,
    category: 'agency',
  });

  // 18. Access from main airport / station — universal practical question
  //     and a strong GEO signal ("comment se rendre à [hotel]").
  const access = accessFromAirport(city);
  if (access !== null) {
    out.push({
      question_fr: `Comment se rendre à ${hotel} depuis l'aéroport ?`,
      answer_fr: access,
      category: 'before',
    });
  }

  // 19. Breakfast / room service — also universal and frequently asked.
  out.push({
    question_fr: `Le petit-déjeuner est-il inclus à ${hotel} ?`,
    answer_fr: `Le petit-déjeuner n'est généralement pas inclus dans le tarif chambre standard mais peut être ajouté à la demande ou être compris dans certains forfaits. Notre conciergerie précise les conditions exactes lors de votre demande de réservation.`,
    category: 'before',
  });

  // 20. Languages spoken — Palace standard is FR + EN + 2-3 others; the
  //     phrasing stays factual (we only assert what's explicitly true).
  out.push({
    question_fr: `Quelles langues sont parlées par le personnel ?`,
    answer_fr: `Le personnel de ${hotel} parle français et anglais. La conciergerie peut généralement accueillir des hôtes dans plusieurs autres langues (italien, espagnol, allemand, russe, mandarin, arabe selon les saisons).`,
    category: 'during',
  });

  return out;
}

/**
 * City → main airport access blurb. Hand-curated for the 30-palace dataset,
 * so every answer is factual (no LLM hallucination on transit times).
 */
function accessFromAirport(city: string): string | null {
  const key = city.toLowerCase().trim();
  const map: Record<string, string> = {
    paris:
      "L'aéroport Paris–Charles-de-Gaulle (CDG) est à environ 30 km (35–60 min en voiture selon le trafic), l'aéroport Paris–Orly (ORY) à environ 18 km (25–45 min). Transferts privés et navette VTC disponibles sur demande auprès de la conciergerie.",
    courchevel:
      "L'altiport de Courchevel est à 5–10 min en voiture. Les aéroports internationaux les plus proches sont Chambéry (1 h 30), Lyon–Saint-Exupéry (2 h 30) et Genève (2 h 15). Transferts privés (4×4 hiver, hélicoptère) sur demande.",
    vence:
      "L'aéroport Nice–Côte d'Azur (NCE) est à environ 25 km (35 min en voiture). Transferts privés et hélicoptère depuis l'aéroport disponibles sur demande.",
    antibes:
      "L'aéroport Nice–Côte d'Azur (NCE) est à environ 18 km (25 min en voiture). La gare TGV d'Antibes est à 10 min. Transferts privés sur demande.",
    'saint-tropez':
      "L'aéroport Toulon–Hyères (TLN) est à environ 50 km (1 h), Nice–Côte d'Azur (NCE) à 100 km (1 h 30). L'héliport de Saint-Tropez est à 15 min. Transferts privés et bateau sur demande.",
    ramatuelle:
      "L'aéroport Toulon–Hyères (TLN) est à environ 50 km (1 h), Nice–Côte d'Azur (NCE) à 100 km (1 h 30). Transferts privés et hélicoptère sur demande.",
    nice: "L'aéroport Nice–Côte d'Azur (NCE) est à environ 7 km (15 min en voiture). La gare de Nice-Ville est à 10 min. Transferts privés sur demande.",
    'saint-jean-cap-ferrat':
      "L'aéroport Nice–Côte d'Azur (NCE) est à environ 17 km (25 min en voiture). Transferts privés et hélicoptère sur demande.",
    'le puy-sainte-réparade':
      "L'aéroport Marseille–Provence (MRS) est à environ 50 km (45 min en voiture). La gare TGV Aix-en-Provence est à 20 min. Transferts privés sur demande.",
    gordes:
      "L'aéroport Marseille–Provence (MRS) est à environ 75 km (1 h 10), Avignon TGV à 45 min en voiture. Transferts privés sur demande.",
    martillac:
      "L'aéroport Bordeaux–Mérignac (BOD) est à environ 25 km (30 min en voiture). La gare Bordeaux Saint-Jean est à 25 min. Transferts privés sur demande.",
    'eugénie-les-bains':
      "L'aéroport Pau–Pyrénées (PUF) est à environ 50 km (50 min en voiture), Biarritz (BIQ) à 1 h 30. La gare d'Aire-sur-l'Adour est à 20 min. Transferts privés sur demande.",
    'évian-les-bains':
      "L'aéroport de Genève (GVA) est à environ 45 km (50 min en voiture). La gare d'Évian-les-Bains accueille des trains directs depuis Paris. Transferts privés et bateau sur demande.",
    'saint-barthélemy':
      "L'aéroport de Saint-Barthélemy Gustaf III (SBH) est à environ 5 km (15 min en voiture). La plupart des voyageurs arrivent via Saint-Martin–Princess Juliana (SXM) puis vol inter-îles ou catamaran (40 min). Transferts privés organisés par la conciergerie.",
  };
  return map[key] ?? null;
}

interface AwardJson {
  name_fr: string;
  name_en: string;
  issuer: string;
  year?: number;
  url?: string;
}

function buildAwards(brief: Brief): AwardJson[] {
  const out: AwardJson[] = [];
  if (brief.classification.atout_france_palace) {
    const award: AwardJson = {
      name_fr: 'Distinction Palace',
      name_en: 'Palace distinction',
      issuer: 'Atout France',
      url: 'https://palace.atout-france.fr',
    };
    const year = brief.classification.atout_france_palace_first_distinction_year;
    if (year !== null && year !== undefined && Number.isInteger(year) && year >= 2010) {
      award.year = year;
    }
    out.push(award);
  }

  // Michelin awards per outlet (top-level only, hotel-level surface).
  const michelinTotal = brief.dining
    .filter((d) => (d.michelin_stars ?? 0) > 0)
    .reduce((acc, d) => acc + (d.michelin_stars ?? 0), 0);
  if (michelinTotal > 0) {
    out.push({
      name_fr: `${michelinTotal} étoile${michelinTotal > 1 ? 's' : ''} au Guide Michelin`,
      name_en: `${michelinTotal} Michelin Star${michelinTotal > 1 ? 's' : ''}`,
      issuer: 'Guide Michelin',
      url: 'https://guide.michelin.com',
    });
  }

  return out;
}

interface PoliciesJson {
  check_in?: { from: string };
  check_out?: { until: string };
  pets?: { allowed: boolean; notes_fr?: string; notes_en?: string };
  wifi?: { included: boolean; scope: 'whole_property' };
}

function buildPolicies(brief: Brief): PoliciesJson | null {
  const service = brief.service ?? {};
  const policies: PoliciesJson = {};

  const checkIn = normalizeTime(stringish(service['check_in_time']));
  if (checkIn !== null) policies.check_in = { from: checkIn };

  const checkOut = normalizeTime(stringish(service['check_out_time']));
  if (checkOut !== null) policies.check_out = { until: checkOut };

  if (typeof service['pets_allowed'] === 'boolean') {
    const note = stringish(service['pet_policy_note']);
    const petPolicy: PoliciesJson['pets'] = { allowed: service['pets_allowed'] as boolean };
    if (note !== null) {
      petPolicy.notes_fr = note;
      petPolicy.notes_en = note;
    }
    policies.pets = petPolicy;
  }

  if (service['has_wifi'] === true || service['has_free_wifi'] === true) {
    policies.wifi = { included: true, scope: 'whole_property' };
  }

  if (Object.keys(policies).length === 0) return null;
  return policies;
}

/** Normalise `4:00 PM`, `3 pm`, `16h00`, `16:00`, `16h` → `16:00`. Returns null on failure. */
function normalizeTime(raw: string | null): string | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  // 24-hour `16:00`
  let match = /^([01]?\d|2[0-3]):([0-5]\d)$/u.exec(trimmed);
  if (match !== null && match[1] !== undefined && match[2] !== undefined) {
    return `${match[1].padStart(2, '0')}:${match[2]}`;
  }
  // 12-hour with minutes `4:00 PM`
  match = /^(0?\d|1[0-2]):([0-5]\d)\s*(AM|PM)$/iu.exec(trimmed);
  if (
    match !== null &&
    match[1] !== undefined &&
    match[2] !== undefined &&
    match[3] !== undefined
  ) {
    let h = Number.parseInt(match[1], 10);
    const ampm = match[3].toUpperCase();
    if (ampm === 'PM' && h < 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${match[2]}`;
  }
  // 12-hour bare hour `3 PM`
  match = /^(0?\d|1[0-2])\s*(AM|PM)$/iu.exec(trimmed);
  if (match !== null && match[1] !== undefined && match[2] !== undefined) {
    let h = Number.parseInt(match[1], 10);
    const ampm = match[2].toUpperCase();
    if (ampm === 'PM' && h < 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:00`;
  }
  // French `16h00` or `16h`
  match = /^([01]?\d|2[0-3])h([0-5]\d)?$/iu.exec(trimmed);
  if (match !== null && match[1] !== undefined) {
    return `${match[1].padStart(2, '0')}:${(match[2] ?? '00').padStart(2, '0')}`;
  }
  return null;
}

/** Returns a human-friendly French time string ("15h" or "15h30") from `HH:MM`. */
function formatTimeFr(hhmm: string): string {
  const [h, m] = hhmm.split(':');
  if (h === undefined) return hhmm;
  if (m === undefined || m === '00') return `${h}h`;
  return `${h}h${m}`;
}

interface LongDescriptionSectionJson {
  anchor: string;
  title_fr: string;
  body_fr: string;
}

function buildLongDescriptionSections(md: MarkdownSplit): LongDescriptionSectionJson[] {
  const out: LongDescriptionSectionJson[] = [];
  const seenAnchors = new Set<string>();
  for (const s of md.sections) {
    // Dedupe anchors (md may have two H2s collapsing to the same anchor).
    let anchor = s.anchor;
    let n = 2;
    while (seenAnchors.has(anchor)) {
      anchor = `${s.anchor}-${n}`;
      n += 1;
    }
    seenAnchors.add(anchor);
    out.push({ anchor, title_fr: s.title, body_fr: s.body });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function numberish(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function stringish(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  return null;
}

function clampString(value: string, max: number): string {
  if (value.length <= max) return value;
  // Cut on word boundary if possible.
  const sliced = value.slice(0, max - 1);
  const lastSpace = sliced.lastIndexOf(' ');
  return `${lastSpace > max * 0.6 ? sliced.slice(0, lastSpace) : sliced}…`;
}

// ---------------------------------------------------------------------------
// Row build
// ---------------------------------------------------------------------------

interface HotelRow {
  slug: string;
  name: string;
  stars: number;
  is_palace: boolean;
  region: string;
  department: string | null;
  city: string;
  address: string | null;
  postal_code: string | null;
  latitude: number;
  longitude: number;
  description_fr: string | null;
  description_en: string | null;
  meta_title_fr: string;
  meta_title_en: string;
  meta_desc_fr: string;
  meta_desc_en: string;
  booking_mode: 'display_only';
  priority: 'P0' | 'P1' | 'P2';
  is_published: boolean;
  is_little_catalog: boolean;
  number_of_rooms: number | null;
  highlights: unknown;
  amenities: unknown;
  faq_content: unknown;
  restaurant_info: unknown | null;
  spa_info: unknown | null;
  awards: unknown;
  policies: unknown | null;
  long_description_sections: unknown;
}

function buildRow(brief: Brief, md: string): HotelRow {
  const split = splitMarkdown(md);
  const parsedAddr = parseAddress(brief.address, brief.city);
  const description = split.lead;

  const metaTitleFr = `${brief.name} — Palace ${brief.city} | ConciergeTravel`;
  const metaTitleEn = `${brief.name} — Luxury Palace in ${brief.city} | ConciergeTravel`;
  const metaDescFr =
    description !== null
      ? clampString(description, 155)
      : `Découvrez ${brief.name}, palace 5★ ${brief.city}. Sélection éditoriale ConciergeTravel.`;
  const metaDescEn = `Discover ${brief.name}, 5-star palace in ${brief.city}. ConciergeTravel editorial selection.`;

  const totalKeys =
    numberish(brief.capacity['total_keys']) ?? numberish(brief.capacity['rooms_count']);

  return {
    slug: brief.slug,
    name: brief.name,
    stars: brief.classification.stars,
    is_palace: brief.classification.atout_france_palace,
    region: parsedAddr.region,
    department: parsedAddr.department,
    city: brief.city,
    address: parsedAddr.streetAddress.length > 0 ? parsedAddr.streetAddress : null,
    postal_code: parsedAddr.postalCode,
    latitude: brief.coordinates.lat,
    longitude: brief.coordinates.lng,
    description_fr: description,
    description_en: null,
    meta_title_fr: clampString(metaTitleFr, 70),
    meta_title_en: clampString(metaTitleEn, 70),
    meta_desc_fr: clampString(metaDescFr, 160),
    meta_desc_en: clampString(metaDescEn, 160),
    booking_mode: 'display_only',
    priority: 'P0',
    is_published: true,
    is_little_catalog: false,
    number_of_rooms: totalKeys,
    highlights: buildHighlights(brief),
    amenities: buildAmenities(brief),
    faq_content: buildFaqContent(brief),
    restaurant_info: buildRestaurantInfo(brief),
    spa_info: buildSpaInfo(brief),
    awards: buildAwards(brief),
    policies: buildPolicies(brief),
    long_description_sections: buildLongDescriptionSections(split),
  };
}

// ---------------------------------------------------------------------------
// SQL emission
// ---------------------------------------------------------------------------

function buildUpsertSql(row: HotelRow): string {
  const columns: ReadonlyArray<readonly [keyof HotelRow, string]> = [
    ['slug', sqlString(row.slug)],
    ['name', sqlString(row.name)],
    ['stars', sqlNumber(row.stars)],
    ['is_palace', sqlBool(row.is_palace)],
    ['region', sqlString(row.region)],
    ['department', sqlString(row.department)],
    ['city', sqlString(row.city)],
    ['address', sqlString(row.address)],
    ['postal_code', sqlString(row.postal_code)],
    ['latitude', sqlNumber(row.latitude)],
    ['longitude', sqlNumber(row.longitude)],
    ['description_fr', sqlString(row.description_fr)],
    ['description_en', sqlString(row.description_en)],
    ['meta_title_fr', sqlString(row.meta_title_fr)],
    ['meta_title_en', sqlString(row.meta_title_en)],
    ['meta_desc_fr', sqlString(row.meta_desc_fr)],
    ['meta_desc_en', sqlString(row.meta_desc_en)],
    ['booking_mode', sqlString(row.booking_mode)],
    ['priority', sqlString(row.priority)],
    ['is_published', sqlBool(row.is_published)],
    ['is_little_catalog', sqlBool(row.is_little_catalog)],
    ['number_of_rooms', sqlNumber(row.number_of_rooms)],
    ['highlights', sqlJsonb(row.highlights)],
    ['amenities', sqlJsonb(row.amenities)],
    ['faq_content', sqlJsonb(row.faq_content)],
    ['restaurant_info', sqlJsonb(row.restaurant_info)],
    ['spa_info', sqlJsonb(row.spa_info)],
    ['awards', sqlJsonb(row.awards)],
    ['policies', sqlJsonb(row.policies)],
    ['long_description_sections', sqlJsonb(row.long_description_sections)],
  ];

  const colNames = columns.map(([c]) => c).join(', ');
  const colValues = columns.map(([, v]) => v).join(', ');
  // Exclude `slug` from the UPDATE set (it's the conflict key).
  const setClause = columns
    .filter(([c]) => c !== 'slug')
    .map(([c]) => `${c} = EXCLUDED.${c}`)
    .concat(["updated_at = timezone('utc', now())"])
    .join(',\n    ');

  return [
    `-- ${row.name} (${row.city})`,
    `INSERT INTO public.hotels (${colNames})`,
    `VALUES (${colValues})`,
    `ON CONFLICT (slug) DO UPDATE SET`,
    `    ${setClause};`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const briefFiles = (await fs.readdir(BRIEFS_DIR))
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .sort();

  if (briefFiles.length === 0) {
    console.error(`No brief files found in ${BRIEFS_DIR}`);
    process.exit(1);
  }

  const statements: string[] = [];
  const report: Array<{ slug: string; status: 'ok' | 'error'; error?: string }> = [];

  for (const file of briefFiles) {
    const fullPath = path.join(BRIEFS_DIR, file);
    const raw = JSON.parse(await fs.readFile(fullPath, 'utf8')) as unknown;
    const parsed = BriefSchema.safeParse(raw);
    if (!parsed.success) {
      const slug =
        typeof raw === 'object' &&
        raw !== null &&
        'slug' in raw &&
        typeof (raw as { slug: unknown }).slug === 'string'
          ? (raw as { slug: string }).slug
          : file;
      console.error(`[${slug}] schema validation failed:`, parsed.error.message);
      report.push({ slug, status: 'error', error: parsed.error.message });
      continue;
    }

    const brief = parsed.data;
    const mdPath = path.join(MD_DIR, `${brief.slug}.md`);
    const md = await fs.readFile(mdPath, 'utf8').catch(() => '');

    try {
      const row = buildRow(brief, md);
      statements.push(buildUpsertSql(row));
      report.push({ slug: brief.slug, status: 'ok' });
    } catch (err) {
      console.error(`[${brief.slug}] mapping failed:`, err);
      report.push({
        slug: brief.slug,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const header = [
    '-- ===========================================================',
    '-- Auto-generated by scripts/editorial-pilot/src/import/build-import-sql.ts',
    `-- Generated at: ${new Date().toISOString()}`,
    `-- Hotels: ${statements.length}`,
    '-- Idempotent: ON CONFLICT (slug) DO UPDATE SET …',
    '-- ===========================================================',
    '',
    'BEGIN;',
  ].join('\n');

  const footer = '\nCOMMIT;\n';

  const sql = [header, ...statements, footer].join('\n\n');
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(OUT_FILE, sql, 'utf8');

  // Also emit smaller batch files so they can be piped one-by-one to the
  // Supabase MCP `execute_sql` tool without hitting payload size limits.
  // Each batch is wrapped in its own BEGIN/COMMIT so partial failures
  // don't corrupt the dataset.
  const batchPaths: string[] = [];
  for (let i = 0; i < statements.length; i += BATCH_SIZE) {
    const chunk = statements.slice(i, i + BATCH_SIZE);
    const batchIndex = Math.floor(i / BATCH_SIZE) + 1;
    const batchHeader = [
      `-- Batch ${batchIndex} — hotels ${i + 1}–${i + chunk.length}`,
      'BEGIN;',
    ].join('\n');
    const batchSql = [batchHeader, ...chunk, 'COMMIT;', ''].join('\n\n');
    const batchPath = path.join(
      OUT_DIR,
      `seed-palaces.batch-${String(batchIndex).padStart(2, '0')}.sql`,
    );
    await fs.writeFile(batchPath, batchSql, 'utf8');
    batchPaths.push(batchPath);
  }

  // Report.
  const okCount = report.filter((r) => r.status === 'ok').length;
  const errCount = report.filter((r) => r.status === 'error').length;
  console.log(`\nWrote ${statements.length} upserts to ${path.relative(process.cwd(), OUT_FILE)}`);
  console.log(`  ✓ ok:    ${okCount}`);
  console.log(`  ✗ error: ${errCount}`);
  console.log(`\nAlso wrote ${batchPaths.length} batch files (${BATCH_SIZE} hotels each):`);
  for (const p of batchPaths) console.log(`  - ${path.relative(process.cwd(), p)}`);
  if (errCount > 0) {
    console.log('\nErrors:');
    for (const r of report.filter((x) => x.status === 'error')) {
      console.log(`  - ${r.slug}: ${r.error}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
