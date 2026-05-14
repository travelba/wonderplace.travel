/**
 * Allowlist of trusted external-link domains for editorial guides
 * and rankings. Drives the anti-hallucination check on the LLM
 * output: any URL whose hostname does not match this list is
 * dropped before persistence.
 *
 * Strategy: match by suffix on the registrable domain (effective TLD).
 * `wikipedia.org` matches `fr.wikipedia.org` and `en.wikipedia.org`.
 *
 * Categories mirror the JSON-LD typing of `external_sources`:
 *   wikipedia | wikimedia_commons | wikidata
 *   official  — operator/group/hotel official sites (closed list)
 *   atout_france
 *   unesco
 *   michelin  — Michelin Guide
 *   tourist_office — French tourist offices (DGE / Atout, regional)
 *   gov       — gov.fr ministries, ADEME, INSEE…
 *   press     — Condé Nast, Forbes, Routard, Lonely Planet, Michelin
 *               Guide Vert, Géo, Travel + Leisure, Tatler, Vogue,
 *               Le Figaro, Le Monde
 *   other     — fallback (never auto-included; only opt-in)
 */

export interface AllowlistEntry {
  /** Suffix to match against URL hostname (case-insensitive). */
  readonly suffix: string;
  readonly type:
    | 'wikipedia'
    | 'wikimedia_commons'
    | 'wikidata'
    | 'official'
    | 'atout_france'
    | 'unesco'
    | 'michelin'
    | 'tourist_office'
    | 'gov'
    | 'press';
  readonly label: string;
}

export const ALLOWLIST: readonly AllowlistEntry[] = [
  // Wikipedia / Wikimedia
  { suffix: 'wikipedia.org', type: 'wikipedia', label: 'Wikipédia' },
  { suffix: 'commons.wikimedia.org', type: 'wikimedia_commons', label: 'Wikimedia Commons' },
  { suffix: 'wikidata.org', type: 'wikidata', label: 'Wikidata' },

  // Atout France & administration française
  { suffix: 'atout-france.fr', type: 'atout_france', label: 'Atout France' },
  { suffix: 'gouvernement.fr', type: 'gov', label: 'Gouvernement français' },
  { suffix: 'service-public.fr', type: 'gov', label: 'service-public.fr' },
  { suffix: 'economie.gouv.fr', type: 'gov', label: 'Ministère de l’Économie' },
  { suffix: 'culture.gouv.fr', type: 'gov', label: 'Ministère de la Culture' },
  { suffix: 'tourisme.gouv.fr', type: 'gov', label: 'Ministère du Tourisme' },
  { suffix: 'pop.culture.gouv.fr', type: 'gov', label: 'Plateforme Ouverte du Patrimoine' },
  { suffix: 'data.culture.gouv.fr', type: 'gov', label: 'data.culture.gouv.fr' },
  { suffix: 'datatourisme.fr', type: 'gov', label: 'DATAtourisme' },
  { suffix: 'insee.fr', type: 'gov', label: 'INSEE' },

  // UNESCO
  { suffix: 'unesco.org', type: 'unesco', label: 'UNESCO' },
  { suffix: 'whc.unesco.org', type: 'unesco', label: 'UNESCO World Heritage' },

  // Michelin
  { suffix: 'guide.michelin.com', type: 'michelin', label: 'Guide MICHELIN' },
  { suffix: 'michelin.com', type: 'michelin', label: 'Michelin' },
  { suffix: 'cartes.michelin.fr', type: 'michelin', label: 'Cartes Michelin' },

  // Offices de tourisme officiels — France (régional / municipal)
  { suffix: 'france.fr', type: 'tourist_office', label: 'France.fr' },
  { suffix: 'parisinfo.com', type: 'tourist_office', label: 'Office du Tourisme de Paris' },
  { suffix: 'cotedazurfrance.fr', type: 'tourist_office', label: "Côte d'Azur France" },
  {
    suffix: 'auvergnerhonealpes-tourisme.com',
    type: 'tourist_office',
    label: 'Auvergne-Rhône-Alpes Tourisme',
  },
  { suffix: 'savoie-mont-blanc.com', type: 'tourist_office', label: 'Savoie Mont-Blanc' },
  {
    suffix: 'bordeaux-tourisme.com',
    type: 'tourist_office',
    label: 'Office du Tourisme de Bordeaux',
  },
  { suffix: 'visit-reims.com', type: 'tourist_office', label: 'Tourisme Reims' },
  { suffix: 'tourisme-en-champagne.com', type: 'tourist_office', label: 'Tourisme en Champagne' },
  { suffix: 'visitprovence.com', type: 'tourist_office', label: 'Visit Provence' },
  {
    suffix: 'provence-alpes-cotedazur.com',
    type: 'tourist_office',
    label: 'Comité Régional du Tourisme PACA',
  },
  { suffix: 'visit-corsica.com', type: 'tourist_office', label: 'Visit Corsica' },
  { suffix: 'tourisme-biarritz.com', type: 'tourist_office', label: 'Tourisme Biarritz' },
  { suffix: 'cannes-destination.com', type: 'tourist_office', label: 'Cannes Destination' },
  { suffix: 'nicetourisme.com', type: 'tourist_office', label: 'Nice Tourisme' },
  { suffix: 'sainttropeztourisme.com', type: 'tourist_office', label: 'Saint-Tropez Tourisme' },
  { suffix: 'courchevel.com', type: 'tourist_office', label: 'Courchevel.com' },
  { suffix: 'megeve.com', type: 'tourist_office', label: 'Megève.com' },
  { suffix: 'chamonix.com', type: 'tourist_office', label: 'Chamonix.com' },
  { suffix: 'valdisere.com', type: 'tourist_office', label: "Val d'Isère.com" },
  { suffix: 'monaco-tourisme.com', type: 'tourist_office', label: 'Monaco Tourisme' },

  // Sites officiels — groupes hôteliers + Palaces
  { suffix: 'chevalblanc.com', type: 'official', label: 'Cheval Blanc' },
  { suffix: 'airelles.com', type: 'official', label: 'Airelles' },
  { suffix: 'oetkercollection.com', type: 'official', label: 'Oetker Collection' },
  { suffix: 'dorchestercollection.com', type: 'official', label: 'Dorchester Collection' },
  { suffix: 'fourseasons.com', type: 'official', label: 'Four Seasons' },
  { suffix: 'rosewoodhotels.com', type: 'official', label: 'Rosewood Hotels' },
  { suffix: 'raffles.com', type: 'official', label: 'Raffles' },
  { suffix: 'peninsula.com', type: 'official', label: 'The Peninsula Hotels' },
  { suffix: 'mandarinoriental.com', type: 'official', label: 'Mandarin Oriental' },
  { suffix: 'shangri-la.com', type: 'official', label: 'Shangri-La' },
  { suffix: 'hyatt.com', type: 'official', label: 'Hyatt' },
  { suffix: 'mariott.com', type: 'official', label: 'Marriott' },
  { suffix: 'lvmh-hotelmanagement.com', type: 'official', label: 'LVMH Hotel Management' },
  { suffix: 'ritzparis.com', type: 'official', label: 'Ritz Paris' },
  { suffix: 'rosewoodhotels.com', type: 'official', label: 'Rosewood' },
  { suffix: 'lebristolparis.com', type: 'official', label: 'Le Bristol Paris' },
  { suffix: 'dorchestercollection.com', type: 'official', label: 'Le Meurice & Plaza Athénée' },
  { suffix: 'royalmonceau.com', type: 'official', label: 'Le Royal Monceau' },
  { suffix: 'hoteldecrillon.com', type: 'official', label: 'Hôtel de Crillon' },
  { suffix: 'shangri-la.com', type: 'official', label: 'Shangri-La Paris' },
  { suffix: 'parkhyattparisvendome.com', type: 'official', label: 'Park Hyatt Paris-Vendôme' },
  { suffix: 'hotellutetia.com', type: 'official', label: 'Hôtel Lutetia' },
  { suffix: 'fouquets-paris.com', type: 'official', label: "Le Fouquet's Paris" },
  { suffix: 'hoteldupalais.com', type: 'official', label: 'Hôtel du Palais Biarritz' },
  { suffix: 'lenegresco.com', type: 'official', label: 'Le Negresco' },
  { suffix: 'hotel-cap-eden-roc.com', type: 'official', label: 'Hôtel du Cap-Eden-Roc' },
  { suffix: 'sources-caudalie.com', type: 'official', label: 'Les Sources de Caudalie' },
  { suffix: 'royalchampagne.com', type: 'official', label: 'Royal Champagne' },
  { suffix: 'lescrayeres.com', type: 'official', label: 'Domaine Les Crayères' },
  { suffix: 'villalacoste.com', type: 'official', label: 'Villa La Coste' },
  { suffix: 'la-reserve-paris.com', type: 'official', label: 'La Réserve Paris' },
  { suffix: 'lareserve-ramatuelle.com', type: 'official', label: 'La Réserve Ramatuelle' },
  { suffix: 'k2collections.com', type: 'official', label: 'Le K2 Collections' },
  { suffix: 'evianresort.com', type: 'official', label: 'Évian Resort' },
  { suffix: 'sixsenses.com', type: 'official', label: 'Six Senses' },
  { suffix: 'aman.com', type: 'official', label: 'Aman Resorts' },

  // Presse de référence
  { suffix: 'cntraveler.com', type: 'press', label: 'Condé Nast Traveler' },
  { suffix: 'cntraveller.com', type: 'press', label: 'Condé Nast Traveller' },
  { suffix: 'forbes.com', type: 'press', label: 'Forbes' },
  { suffix: 'travelandleisure.com', type: 'press', label: 'Travel + Leisure' },
  { suffix: 'tatler.com', type: 'press', label: 'Tatler' },
  { suffix: 'vogue.fr', type: 'press', label: 'Vogue France' },
  { suffix: 'vogue.com', type: 'press', label: 'Vogue' },
  { suffix: 'lefigaro.fr', type: 'press', label: 'Le Figaro' },
  { suffix: 'madame.lefigaro.fr', type: 'press', label: 'Madame Figaro' },
  { suffix: 'lemonde.fr', type: 'press', label: 'Le Monde' },
  { suffix: 'lesechos.fr', type: 'press', label: 'Les Échos' },
  { suffix: 'liberation.fr', type: 'press', label: 'Libération' },
  { suffix: 'geo.fr', type: 'press', label: 'GEO France' },
  { suffix: 'routard.com', type: 'press', label: 'Routard' },
  { suffix: 'lonelyplanet.fr', type: 'press', label: 'Lonely Planet France' },
  { suffix: 'lonelyplanet.com', type: 'press', label: 'Lonely Planet' },
  { suffix: 'viamichelin.fr', type: 'press', label: 'ViaMichelin' },
  { suffix: 'gault-millau.com', type: 'press', label: 'Gault & Millau' },
];

/** Returns the matching allowlist entry if the URL is trusted, null otherwise. */
export function matchAllowlist(url: string): AllowlistEntry | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  const host = parsed.hostname.toLowerCase();
  for (const entry of ALLOWLIST) {
    if (host === entry.suffix || host.endsWith(`.${entry.suffix}`)) return entry;
  }
  return null;
}

/** Compact prompt-friendly description of the allowlist. */
export function describeAllowlistForPrompt(): string {
  const byType: Map<AllowlistEntry['type'], string[]> = new Map();
  for (const e of ALLOWLIST) {
    const arr = byType.get(e.type) ?? [];
    arr.push(e.suffix);
    byType.set(e.type, arr);
  }
  const lines: string[] = [];
  for (const [type, suffixes] of byType.entries()) {
    lines.push(
      `- ${type}: ${suffixes.slice(0, 8).join(', ')}${suffixes.length > 8 ? ` (+${suffixes.length - 8} more)` : ''}`,
    );
  }
  return lines.join('\n');
}
