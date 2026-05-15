/**
 * Assembles a Brief (matching scripts/editorial-pilot/src/schemas.ts) from
 * automated enrichment sources.
 *
 * Sprint 1D MVP: only DATAtourisme is wired in. Sections that DATAtourisme
 * does not cover (history dates, dining, capacity, wellness, IATA insider…)
 * are filled with explicit `AUTO_DRAFT` sentinels so the LLM pipeline can
 * detect incomplete input and avoid hallucinating. Pass 4 (fact-check) is
 * expected to flag sentinel-derived content as low-confidence.
 *
 * Later milestones will add Wikidata, Wikipedia, and Tavily integrations
 * to progressively replace sentinels with real facts.
 */

import { BriefSchema, type Brief } from '../schemas.js';
import type { DtHotel, DtPoi } from './datatourisme.js';
import type { WdHotel } from './wikidata.js';
import type { WpSummary } from './wikipedia.js';
import type { DiningOutlet } from './dining-extractor.js';
import type { CapacityFacts } from './capacity-extractor.js';
import type { WellnessFacts } from './wellness-extractor.js';
import type { ServicesFacts } from './services-extractor.js';

export interface BuildBriefOptions {
  readonly slug?: string;
  readonly advisorName?: string;
  readonly advisorRole?: string;
}

/**
 * Source-agnostic minimal hotel profile required to assemble a brief.
 * Replaces the previously hard dependency on `DtHotel`. Two adapters
 * are exposed below: `hotelCoreFromDt(...)` and the manual constructor
 * used by the `--no-datatourisme` CLI mode.
 */
export interface HotelCore {
  readonly name: string;
  readonly city: string;
  readonly region: string | null;
  readonly country: string;
  readonly streetAddress: string;
  readonly postalCode: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly website: string | null;
  readonly descriptionShort: string | null;
  readonly descriptionLong: string | null;
  readonly stars: number | null;
  readonly isPalace: boolean;
  /** Canonical source URL identifying this record (DATAtourisme URI, or other). */
  readonly sourceUri: string | null;
  /** Human label for the source — "DATAtourisme catalog" or "Manual entry — Atout France Palace registry". */
  readonly sourceLabel: string;
}

export function hotelCoreFromDt(dt: DtHotel): HotelCore {
  return {
    name: dt.name,
    city: dt.location.city,
    region: dt.location.region || null,
    country: dt.location.country || 'FR',
    streetAddress: dt.location.streetAddress,
    postalCode: dt.location.postalCode,
    latitude: dt.location.latitude,
    longitude: dt.location.longitude,
    website: dt.contact.website,
    descriptionShort: dt.descriptionShort ?? null,
    descriptionLong: dt.descriptionLong ?? null,
    stars: dt.classification.stars,
    isPalace: dt.classification.isPalace,
    sourceUri: dt.uri || `https://api.datatourisme.fr/v1/catalog/${dt.uuid}`,
    sourceLabel: `DATAtourisme catalog — ${dt.uri || dt.uuid}`,
  };
}

export interface EnrichmentSources {
  readonly hotel: HotelCore;
  readonly pois: readonly DtPoi[];
  readonly wikidata?: WdHotel | null;
  readonly wikipedia?: WpSummary | null;
  /** Tavily-extracted dining outlets (Phase 3). */
  readonly diningOutlets?: readonly DiningOutlet[];
  /** Tavily-extracted capacity facts (Phase 3). */
  readonly capacity?: CapacityFacts | null;
  /** Tavily-extracted wellness facts (Phase 3). */
  readonly wellness?: WellnessFacts | null;
  /** Tavily-extracted services facts (Phase 3.5). */
  readonly services?: ServicesFacts | null;
}

const AUTO_DRAFT = 'AUTO_DRAFT';

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/['']/gu, '')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .replace(/-+/gu, '-');
}

function todayIso(): string {
  const iso = new Date().toISOString().split('T')[0];
  if (!iso) throw new Error('unreachable: ISO date split');
  return iso;
}

function mapPoiCategoryToBrief(category: DtPoi['category']): string {
  switch (category) {
    case 'museum':
      return 'museum';
    case 'cultural':
      return 'cultural';
    case 'park':
      return 'park_garden';
    case 'building':
      return 'remarkable_building';
    case 'religious':
      return 'religious_site';
    case 'theater':
      return 'theater';
    case 'restaurant':
      return 'gourmet_restaurant';
    case 'other':
      return 'other';
  }
}

/**
 * Build a Brief from one or more enrichment sources.
 * The returned object MUST validate against BriefSchema.
 *
 * Sections covered per source:
 *   - DATAtourisme   → name, address, GPS, classification, contact, POIs, descriptionShort
 *   - Wikidata       → inception year, architects, owner, operator, heritage designation
 *   - Wikipedia      → narrative extract (lead paragraph)
 *   - Tavily/Michelin→ dining outlets (chef, stars, cuisine)
 *   - Tavily/official→ capacity (rooms, suites, sizes) & wellness (spa, brand, pool)
 */
export function buildBriefFromSources(
  sources: EnrichmentSources,
  opts: BuildBriefOptions = {},
): Brief {
  const {
    hotel,
    pois,
    wikidata,
    wikipedia,
    diningOutlets,
    capacity: tavilyCapacity,
    wellness: tavilyWellness,
    services: tavilyServices,
  } = sources;
  const slug = opts.slug ?? slugify(hotel.name);
  const advisorName = opts.advisorName ?? 'Léa';
  const advisorRole = opts.advisorRole ?? 'conseillère senior ConciergeTravel.fr';
  const today = todayIso();

  const keyDates = buildKeyDates(wikidata, hotel);
  const culturalRefs = buildCulturalRefs(wikidata, wikipedia);
  const architecture = buildArchitecture(wikidata, hotel);
  const signatureFeatures = buildSignatureFeatures(hotel, wikipedia, wikidata);

  const draft: Brief = {
    slug,
    name: hotel.name,
    city: hotel.city,
    region: hotel.region || undefined,
    country: hotel.country || 'FR',
    address: [
      hotel.streetAddress,
      [hotel.postalCode, hotel.city].filter(Boolean).join(' '),
      hotel.country,
    ]
      .filter(Boolean)
      .join(', '),
    coordinates: {
      lat: hotel.latitude,
      lng: hotel.longitude,
      verified_confidence: 'high',
      source: hotel.sourceLabel,
    },
    classification: {
      stars: hotel.stars ?? 5,
      atout_france_palace: hotel.isPalace,
      atout_france_palace_first_distinction_year: null,
      verified_confidence: 'high',
      source: hotel.isPalace
        ? 'Atout France Palace registry (https://palace.atout-france.fr) — see hotel.sourceLabel for record provenance'
        : 'Not flagged as Palace by Atout France registry',
    },
    history: {
      opening_year: wikidata?.inception?.year ?? undefined,
      founder_or_first_operator: wikidata?.owner ?? undefined,
      verified_confidence: wikidata?.inception ? 'medium-high' : 'low',
      key_dates: keyDates,
      cultural_references: culturalRefs,
    },
    architecture,
    capacity: buildCapacity(tavilyCapacity),
    dining: buildDining(diningOutlets, hotel),
    wellness: buildWellness(tavilyWellness),
    service: buildService(tavilyServices),
    signature_features: [...signatureFeatures],
    nearby_pois:
      pois.length > 0
        ? pois.map((p) => ({
            name: p.name,
            distance_m: p.distanceMeters,
            type: mapPoiCategoryToBrief(p.category),
            note: p.descriptionShort ? p.descriptionShort.slice(0, 200) : undefined,
            confidence: 'high' as const,
          }))
        : [
            {
              name: `${AUTO_DRAFT} — POIs around`,
              distance_m: 0,
              type: 'placeholder',
              confidence: 'low',
            },
          ],
    iata_insider: {
      advisor_name: advisorName,
      advisor_role: advisorRole,
      key_observation: `${AUTO_DRAFT} — observation insider à rédiger par conseiller ConciergeTravel (visite, retour client, ou Tavily insider sources)`,
      best_for: `${AUTO_DRAFT} — profil voyageur cible à définir`,
      honest_caveat: `${AUTO_DRAFT} — caveat honnête à rédiger`,
    },
    sources: buildSources(
      hotel,
      wikidata ?? null,
      wikipedia ?? null,
      diningOutlets ?? [],
      tavilyCapacity ?? null,
      tavilyWellness ?? null,
      tavilyServices ?? null,
      today,
    ),
    external_source_facts: buildExternalSourceFacts(
      hotel,
      wikipedia ?? null,
      diningOutlets ?? [],
      tavilyCapacity ?? null,
      tavilyWellness ?? null,
      tavilyServices ?? null,
    ),
    verification_required_before_publication: buildVerificationList({
      hasDining: (diningOutlets?.length ?? 0) > 0,
      hasCapacity: Boolean(tavilyCapacity),
      hasWellness: Boolean(tavilyWellness),
      hasServices: Boolean(tavilyServices),
      wikidataInceptionYear: wikidata?.inception?.year ?? null,
    }),
  };

  // Validate against the canonical schema so downstream pipeline stays happy.
  const parsed = BriefSchema.safeParse(draft);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`[brief-builder] BriefSchema validation failed:\n${issues}`);
  }
  return parsed.data;
}

/**
 * @deprecated use `buildBriefFromSources({ hotel: hotelCoreFromDt(dt), pois })` instead.
 * Kept for backward compatibility with build-brief.ts v1 callers.
 */
export function buildBriefFromDatatourisme(
  hotel: DtHotel,
  pois: readonly DtPoi[],
  opts: BuildBriefOptions = {},
): Brief {
  return buildBriefFromSources({ hotel: hotelCoreFromDt(hotel), pois }, opts);
}

function buildKeyDates(
  wd: WdHotel | null | undefined,
  hotel: HotelCore,
): Brief['history']['key_dates'] {
  const dates: Brief['history']['key_dates'] = [];
  if (wd?.inception?.year) {
    dates.push({
      year: wd.inception.year,
      event: `Construction / ouverture (Wikidata P571 — ${wd.label})`,
      confidence: 'medium-high',
    });
  }
  if (wd?.owner) {
    dates.push({
      year: 0,
      event: `Propriétaire actuel : ${wd.owner} (Wikidata P127 — date d'acquisition à vérifier)`,
      confidence: 'medium',
    });
  }
  if (dates.length === 0) {
    dates.push({
      year: 0,
      event: `${AUTO_DRAFT} — dates historiques à enrichir manuellement (Wikidata vide pour cet hôtel)`,
      confidence: 'low',
    });
  }
  // Schema requires min 1 — guaranteed by the fallback above
  void hotel;
  return dates;
}

function buildCulturalRefs(
  wd: WdHotel | null | undefined,
  wp: WpSummary | null | undefined,
): Brief['history']['cultural_references'] {
  const refs: Brief['history']['cultural_references'] = [];
  for (const heritage of wd?.heritageDesignations ?? []) {
    refs.push({
      type: 'heritage_designation',
      item: `Distinction patrimoniale officielle : ${heritage} (Wikidata P1435)`,
      confidence: 'high',
    });
  }
  if (wd?.partOf) {
    refs.push({
      type: 'chain_membership',
      item: `Membre du groupe : ${wd.partOf} (Wikidata P361)`,
      confidence: 'high',
    });
  }
  if (wp?.description) {
    refs.push({
      type: 'wikipedia_short_description',
      item: `Wikipedia: ${wp.description}`,
      confidence: 'medium',
    });
  }
  if (refs.length === 0) {
    refs.push({
      type: 'auto_pending',
      item: `${AUTO_DRAFT} — références culturelles à enrichir`,
      confidence: 'low',
    });
  }
  return refs;
}

function buildArchitecture(
  wd: WdHotel | null | undefined,
  hotel: HotelCore,
): Record<string, unknown> {
  const arch: Record<string, unknown> = {
    auto_status: wd?.architects.length ? 'enriched' : 'pending',
  };
  if (wd?.architects.length) {
    arch['original_architects'] = wd.architects;
    arch['source'] = `Wikidata P84 (${wd.qid})`;
  }
  if (hotel.descriptionShort) {
    arch['source_description_excerpt'] = hotel.descriptionShort;
  }
  if (!wd?.architects.length) {
    arch['note'] =
      `${AUTO_DRAFT} — architecture (style, façade, designer, last major renovation) to enrich via Wikipedia + official site`;
  }
  return arch;
}

function buildSignatureFeatures(
  hotel: HotelCore,
  wp: WpSummary | null | undefined,
  wd: WdHotel | null | undefined,
): readonly string[] {
  const features: string[] = [];
  if (wp?.extract) {
    features.push(`Wikipedia: ${wp.extract.trim()}`);
  }
  if (hotel.descriptionLong) {
    features.push(`Catalog: ${hotel.descriptionLong.trim()}`);
  } else if (hotel.descriptionShort) {
    features.push(`Catalog: ${hotel.descriptionShort.trim()}`);
  }
  if (wd?.heritageDesignations.length) {
    features.push(`Patrimoine: ${wd.heritageDesignations.join(', ')}`);
  }
  if (features.length === 0) {
    features.push(`${AUTO_DRAFT} — signature features to enrich`);
  }
  return features;
}

function buildExternalSourceFacts(
  hotel: HotelCore,
  wp: WpSummary | null,
  diningOutlets: readonly DiningOutlet[],
  capacity: CapacityFacts | null,
  wellness: WellnessFacts | null,
  services: ServicesFacts | null,
): NonNullable<Brief['external_source_facts']> {
  const facts: NonNullable<Brief['external_source_facts']> = [];
  if (hotel.sourceUri && hotel.descriptionLong && hotel.descriptionLong.length >= 50) {
    facts.push({
      source: hotel.sourceLabel,
      url: hotel.sourceUri,
      verbatim: hotel.descriptionLong,
      confidence: 'medium-high',
    });
  } else if (hotel.sourceUri && hotel.descriptionShort && hotel.descriptionShort.length >= 20) {
    facts.push({
      source: hotel.sourceLabel,
      url: hotel.sourceUri,
      verbatim: hotel.descriptionShort,
      confidence: 'medium-high',
    });
  }
  if (wp?.extract && wp.extract.length >= 20) {
    facts.push({
      source: `Wikipedia FR — ${wp.title}`,
      url: wp.url,
      verbatim: wp.extract,
      confidence: 'medium',
    });
  }
  for (const outlet of diningOutlets) {
    if (outlet.evidenceQuote.length < 20) continue;
    const isMichelin = outlet.sourceUrl.includes('guide.michelin.com');
    facts.push({
      source: isMichelin ? `Guide Michelin — ${outlet.name}` : `Site officiel — ${outlet.name}`,
      url: outlet.sourceUrl,
      verbatim: outlet.evidenceQuote,
      confidence: isMichelin ? 'high' : 'medium-high',
    });
  }
  if (capacity && capacity.evidenceQuote.length >= 20) {
    facts.push({
      source: 'Site officiel — capacité',
      url: capacity.sourceUrl,
      verbatim: capacity.evidenceQuote,
      confidence: 'high',
    });
  }
  if (wellness && wellness.evidenceQuote.length >= 20) {
    facts.push({
      source: `Site officiel — ${wellness.spaName ?? 'spa & wellness'}`,
      url: wellness.sourceUrl,
      verbatim: wellness.evidenceQuote,
      confidence: 'high',
    });
  }
  if (services && services.evidenceQuote.length >= 20) {
    facts.push({
      source: 'Site officiel — services & équipements',
      url: services.sourceUrl,
      verbatim: services.evidenceQuote,
      confidence: 'high',
    });
  }
  return facts;
}

function buildSources(
  hotel: HotelCore,
  wd: WdHotel | null,
  wp: WpSummary | null,
  diningOutlets: readonly DiningOutlet[],
  capacity: CapacityFacts | null,
  wellness: WellnessFacts | null,
  services: ServicesFacts | null,
  today: string,
): Brief['sources'] {
  const sources: Brief['sources'] = [];
  if (hotel.sourceUri && hotel.sourceUri.includes('datatourisme')) {
    sources.push({
      type: 'datatourisme',
      url: hotel.sourceUri,
      consulted_at: today,
    });
  }
  if (hotel.website) {
    sources.push({
      type: 'official',
      url: hotel.website,
      consulted_at: today,
    });
  }
  if (wd) {
    sources.push({
      type: 'wikidata',
      qid: wd.qid,
      url: `https://www.wikidata.org/wiki/${wd.qid}`,
      consulted_at: today,
    });
  }
  if (wp) {
    sources.push({
      type: 'wikipedia_fr',
      url: wp.url,
      consulted_at: today,
    });
  }
  // Tavily-derived URLs (Michelin + official spa / capacity pages)
  const seen = new Set(sources.map((s) => s.url ?? ''));
  for (const outlet of diningOutlets) {
    if (seen.has(outlet.sourceUrl)) continue;
    seen.add(outlet.sourceUrl);
    sources.push({
      type: outlet.sourceUrl.includes('guide.michelin.com') ? 'michelin' : 'official_dining',
      url: outlet.sourceUrl,
      consulted_at: today,
    });
  }
  for (const tavilySource of [capacity?.sourceUrl, wellness?.sourceUrl, services?.sourceUrl]) {
    if (!tavilySource || seen.has(tavilySource)) continue;
    seen.add(tavilySource);
    sources.push({ type: 'official', url: tavilySource, consulted_at: today });
  }
  // schema requires min(2) sources, ensured by datatourisme + (official|wikidata|wikipedia)
  if (sources.length < 2) {
    sources.push({
      type: 'auto_pending',
      url: 'https://fr.wikipedia.org/wiki/Special:Search',
      citation: `${AUTO_DRAFT} — to be replaced with Wikipedia article URL after enrichment`,
      consulted_at: today,
    });
  }
  return sources;
}

// ─── Phase 3 — Tavily-driven builders ─────────────────────────────────────

function buildDining(
  outlets: readonly DiningOutlet[] | undefined,
  hotel: HotelCore,
): Brief['dining'] {
  if (!outlets || outlets.length === 0) {
    return [
      {
        name: `${AUTO_DRAFT} — dining outlets`,
        type: 'placeholder',
        verified_confidence: 'low',
        note_to_check: hotel.descriptionLong
          ? `Mine catalog description for chef/restaurant/Michelin info: "${hotel.descriptionLong.slice(0, 400)}"`
          : 'No Tavily extraction — enrich manually via Michelin Guide + official site',
      },
    ];
  }
  return outlets.map((o) => {
    const out: Brief['dining'][number] = {
      name: o.name,
      type: o.type,
      verified_confidence: o.sourceUrl.includes('guide.michelin.com') ? 'high' : 'medium-high',
      source: sourceLabel(o.sourceUrl),
    };
    if (o.chef) out.chef = o.chef;
    if (o.cuisine) out.cuisine = o.cuisine;
    if (o.michelinStars !== null) out.michelin_stars = o.michelinStars;
    if (o.signature) out.signature = o.signature;
    return out;
  });
}

function buildCapacity(c: CapacityFacts | null | undefined): Record<string, unknown> {
  if (!c) {
    return {
      auto_status: 'pending',
      note: `${AUTO_DRAFT} — capacity not found via Tavily (official site may not expose room counts; enrich manually)`,
    };
  }
  const out: Record<string, unknown> = {
    auto_status: 'enriched',
    source: c.sourceUrl,
    verified_confidence: 'high',
  };
  if (c.totalKeys !== null) out['total_keys'] = c.totalKeys;
  if (c.roomsCount !== null) out['rooms_count'] = c.roomsCount;
  if (c.suitesCount !== null) out['suites_count'] = c.suitesCount;
  if (c.signatureSuitesCount !== null) out['signature_suites_count'] = c.signatureSuitesCount;
  if (c.minRoomSurfaceM2 !== null) out['min_room_surface_m2'] = c.minRoomSurfaceM2;
  if (c.maxRoomSurfaceM2 !== null) out['max_room_surface_m2'] = c.maxRoomSurfaceM2;
  if (c.evidenceQuote) out['evidence_quote'] = c.evidenceQuote;
  return out;
}

function buildService(s: ServicesFacts | null | undefined): Record<string, unknown> {
  if (!s) {
    return {
      auto_status: 'pending',
      note: `${AUTO_DRAFT} — service (languages, concierge, transfer) to enrich via official site (Tavily Phase 3)`,
    };
  }
  const out: Record<string, unknown> = {
    auto_status: 'enriched',
    source: s.sourceUrl,
    verified_confidence: 'high',
  };
  if (s.languagesSpoken.length > 0) out['languages_spoken'] = s.languagesSpoken;
  if (s.hasParking !== null) out['has_parking'] = s.hasParking;
  if (s.hasValetParking !== null) out['has_valet_parking'] = s.hasValetParking;
  if (s.hasAirportTransfer !== null) out['has_airport_transfer'] = s.hasAirportTransfer;
  if (s.airportTransferNote) out['airport_transfer_note'] = s.airportTransferNote;
  if (s.petsAllowed !== null) out['pets_allowed'] = s.petsAllowed;
  if (s.petPolicyNote) out['pet_policy_note'] = s.petPolicyNote;
  if (s.hasConcierge !== null) out['has_concierge'] = s.hasConcierge;
  if (s.conciergeClefsDor !== null) out['concierge_clefs_dor'] = s.conciergeClefsDor;
  if (s.has24hRoomService !== null) out['has_24h_room_service'] = s.has24hRoomService;
  if (s.hasButlerService !== null) out['has_butler_service'] = s.hasButlerService;
  if (s.checkInTime) out['check_in_time'] = s.checkInTime;
  if (s.checkOutTime) out['check_out_time'] = s.checkOutTime;
  if (s.evidenceQuote) out['evidence_quote'] = s.evidenceQuote;
  return out;
}

function buildWellness(w: WellnessFacts | null | undefined): Record<string, unknown> {
  if (!w) {
    return {
      auto_status: 'pending',
      note: `${AUTO_DRAFT} — wellness not found via Tavily (spa page may not be indexed; enrich manually)`,
    };
  }
  const out: Record<string, unknown> = {
    auto_status: 'enriched',
    source: w.sourceUrl,
    verified_confidence: 'high',
  };
  if (w.spaName) out['spa_name'] = w.spaName;
  if (w.partnerBrand) out['partner_brand'] = w.partnerBrand;
  if (w.surfaceM2 !== null) out['surface_m2'] = w.surfaceM2;
  if (w.hasPool !== null) out['has_pool'] = w.hasPool;
  if (w.poolType) out['pool_type'] = w.poolType;
  if (w.hasFitness !== null) out['has_fitness'] = w.hasFitness;
  if (w.hasHammam !== null) out['has_hammam'] = w.hasHammam;
  if (w.hasSauna !== null) out['has_sauna'] = w.hasSauna;
  if (w.numberOfTreatmentRooms !== null)
    out['number_of_treatment_rooms'] = w.numberOfTreatmentRooms;
  if (w.signatureTreatments.length > 0) out['signature_treatments'] = w.signatureTreatments;
  if (w.evidenceQuote) out['evidence_quote'] = w.evidenceQuote;
  return out;
}

function sourceLabel(url: string): string {
  if (url.includes('guide.michelin.com')) return `Guide Michelin — ${url}`;
  try {
    const host = new URL(url).hostname.replace(/^www\./u, '');
    return `Site officiel (${host}) — ${url}`;
  } catch {
    return url;
  }
}

interface VerificationListInput {
  readonly hasDining: boolean;
  readonly hasCapacity: boolean;
  readonly hasWellness: boolean;
  readonly hasServices: boolean;
  readonly wikidataInceptionYear: number | null;
}

function buildVerificationList(v: VerificationListInput): string[] {
  const list: string[] = [
    'AUTO-GENERATED BRIEF — vérifier chaque chiffre auto-extrait avant publication, surtout là où source ≠ Guide Michelin / site officiel.',
  ];
  if (!v.hasDining) {
    list.push(
      'Restauration : aucun outlet trouvé via Tavily — enrichir manuellement (Guide Michelin + site officiel)',
    );
  } else {
    list.push(
      'Restauration : faits issus de Tavily — recouper chef/étoiles avec le Guide Michelin si la date ≠ année courante',
    );
  }
  if (!v.hasCapacity) {
    list.push(
      'Capacité : non trouvée via Tavily — chercher dans la rubrique presse / kit-media du site officiel',
    );
  } else {
    list.push('Capacité : recouper le total chambres avec la fiche presse officielle');
  }
  if (!v.hasWellness) {
    list.push(
      'Wellness : non trouvé via Tavily — vérifier manuellement la page spa du site officiel',
    );
  } else {
    list.push('Wellness : confirmer le partenaire skincare et la surface du spa');
  }
  if (!v.hasServices) {
    list.push(
      'Services : aucun fait concret extrait (langues, voiturier, transferts, animaux) — enrichir manuellement',
    );
  } else {
    list.push("Services : recouper langues parlées et statut Clefs d'Or avec la fiche officielle");
  }
  list.push('Observation IATA insider authentique — à rédiger par conseiller ConciergeTravel');
  list.push('Recoupement GPS DATAtourisme avec Google Maps');
  if (v.wikidataInceptionYear !== null) {
    list.push(
      `Vérifier la cohérence date ouverture: Wikidata=${v.wikidataInceptionYear} vs sources internes`,
    );
  }
  return list;
}
