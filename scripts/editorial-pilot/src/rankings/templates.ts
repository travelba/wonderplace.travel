/**
 * templates.ts — slug + title templates for the rankings matrice.
 *
 * Each template renders a stable slug and bilingual title from a
 * `RankingAxes` object. The combinator (`combinator.ts`) iterates
 * the catalog of templates against every (type, lieu, theme,
 * occasion) combination to produce candidate seeds.
 *
 * Adding a template:
 *   1. Append below.
 *   2. Provide `applies(axes)` returning true only when the axes
 *      contain the slots the template references (we never emit a
 *      slug with an undefined `{theme}` slot).
 *   3. The combinator handles eligibility against the hotels DB —
 *      templates are pure string functions.
 */

import type { HotelType, Occasion, RankingAxes, Theme } from './axes.js';

// ─── Type-side display labels ────────────────────────────────────────────

const TYPE_LABEL_FR: Readonly<Record<HotelType, string>> = {
  palace: 'Palaces',
  '5-etoiles': 'hôtels 5 étoiles',
  '4-etoiles': 'hôtels 4 étoiles',
  'boutique-hotel': 'boutique-hôtels',
  chateau: 'châteaux-hôtels',
  chalet: 'chalets',
  villa: 'villas',
  'maison-hotes': "maisons d'hôtes",
  resort: 'resorts',
  ecolodge: 'écolodges',
  insolite: 'hôtels insolites',
  all: 'hôtels',
};

const TYPE_LABEL_EN: Readonly<Record<HotelType, string>> = {
  palace: 'Palaces',
  '5-etoiles': '5-star hotels',
  '4-etoiles': '4-star hotels',
  'boutique-hotel': 'boutique hotels',
  chateau: 'château hotels',
  chalet: 'chalets',
  villa: 'villas',
  'maison-hotes': 'guesthouses',
  resort: 'resorts',
  ecolodge: 'ecolodges',
  insolite: 'unusual stays',
  all: 'hotels',
};

const TYPE_SLUG: Readonly<Record<HotelType, string>> = {
  palace: 'palaces',
  '5-etoiles': '5-etoiles',
  '4-etoiles': '4-etoiles',
  'boutique-hotel': 'boutique-hotels',
  chateau: 'chateaux-hotels',
  chalet: 'chalets',
  villa: 'villas',
  'maison-hotes': 'maisons-hotes',
  resort: 'resorts',
  ecolodge: 'ecolodges',
  insolite: 'hotels-insolites',
  all: 'hotels',
};

// ─── Theme labels ────────────────────────────────────────────────────────

const THEME_LABEL_FR: Readonly<Record<Theme, string>> = {
  romantique: 'romantiques',
  famille: 'pour la famille',
  'spa-bienetre': 'avec spa',
  gastronomie: 'gastronomiques',
  design: 'design',
  patrimoine: 'de charme',
  vignobles: 'au cœur des vignobles',
  mer: 'en bord de mer',
  montagne: 'à la montagne',
  campagne: 'à la campagne',
  urbain: 'urbains',
  'sport-golf': 'avec golf',
  'sport-tennis': 'avec tennis',
  'sport-padel': 'avec padel',
  'sport-surf': 'spot de surf',
  'sport-ski': 'au pied des pistes',
  rooftop: 'avec rooftop',
  piscine: 'avec piscine',
  'kids-friendly': 'kids-friendly',
  insolite: 'insolites',
};

const THEME_LABEL_EN: Readonly<Record<Theme, string>> = {
  romantique: 'romantic',
  famille: 'for families',
  'spa-bienetre': 'with spa',
  gastronomie: 'gastronomic',
  design: 'design',
  patrimoine: 'of character',
  vignobles: 'in the vineyards',
  mer: 'by the sea',
  montagne: 'in the mountains',
  campagne: 'in the countryside',
  urbain: 'urban',
  'sport-golf': 'with golf',
  'sport-tennis': 'with tennis',
  'sport-padel': 'with padel',
  'sport-surf': 'surf hotels',
  'sport-ski': 'ski-in / ski-out',
  rooftop: 'with rooftop',
  piscine: 'with pool',
  'kids-friendly': 'kids-friendly',
  insolite: 'unusual',
};

const THEME_SLUG: Readonly<Record<Theme, string>> = {
  romantique: 'romantiques',
  famille: 'famille',
  'spa-bienetre': 'spa',
  gastronomie: 'gastronomie',
  design: 'design',
  patrimoine: 'charme',
  vignobles: 'vignobles',
  mer: 'bord-de-mer',
  montagne: 'montagne',
  campagne: 'campagne',
  urbain: 'urbains',
  'sport-golf': 'golf',
  'sport-tennis': 'tennis',
  'sport-padel': 'padel',
  'sport-surf': 'surf',
  'sport-ski': 'ski',
  rooftop: 'rooftop',
  piscine: 'piscine',
  'kids-friendly': 'kids-friendly',
  insolite: 'insolites',
};

// ─── Occasion labels ─────────────────────────────────────────────────────

const OCCASION_LABEL_FR: Readonly<Record<Occasion, string>> = {
  'week-end': 'pour un week-end',
  'lune-de-miel': 'pour une lune de miel',
  anniversaire: 'pour un anniversaire',
  seminaire: 'pour un séminaire',
  mariage: 'pour un mariage',
  escapade: 'pour une escapade',
  staycation: 'pour un staycation',
  fetes: 'pour les fêtes',
  minceur: 'minceur et détox',
};

const OCCASION_LABEL_EN: Readonly<Record<Occasion, string>> = {
  'week-end': 'for a weekend',
  'lune-de-miel': 'for a honeymoon',
  anniversaire: 'for an anniversary',
  seminaire: 'for a seminar',
  mariage: 'for a wedding',
  escapade: 'for a getaway',
  staycation: 'for a staycation',
  fetes: 'for the holidays',
  minceur: 'for a wellness retreat',
};

const OCCASION_SLUG: Readonly<Record<Occasion, string>> = {
  'week-end': 'week-end',
  'lune-de-miel': 'lune-de-miel',
  anniversaire: 'anniversaire',
  seminaire: 'seminaire',
  mariage: 'mariage',
  escapade: 'escapade',
  staycation: 'staycation',
  fetes: 'fetes',
  minceur: 'minceur',
};

// ─── Lieu helpers ────────────────────────────────────────────────────────

/**
 * Convert the lieu slug into a French preposition + label suitable
 * for the title sentence ("de Paris", "en Corse", "sur la Côte d'Azur",
 * "des Alpes"). Avoids bizarre titles like "Palaces de la France".
 */
function lieuTitleFr(slug: string, label: string): string {
  if (slug === 'france') return 'de France';
  if (slug === 'corse') return 'de Corse';
  if (slug === 'paris') return 'de Paris';
  if (slug === 'monaco') return 'de Monaco';
  if (slug === 'cote-d-azur' || slug === 'french-riviera') return "de la Côte d'Azur";
  if (slug === 'provence') return 'de Provence';
  if (slug === 'alpes') return 'des Alpes';
  if (slug === 'alpilles') return 'des Alpilles';
  if (slug === 'luberon') return 'du Luberon';
  if (slug === 'champagne') return 'de Champagne';
  if (slug === 'bordeaux') return 'de Bordeaux';
  if (slug === 'bretagne') return 'de Bretagne';
  if (slug === 'normandie') return 'de Normandie';
  if (slug === 'pays-basque') return 'du Pays basque';
  if (slug === 'loire') return 'de la Loire';
  if (slug === 'alsace') return "d'Alsace";
  if (slug === 'cap-d-antibes') return "du Cap d'Antibes";
  if (slug === 'cap-ferrat') return 'du Cap-Ferrat';
  // Default: "de <Label>" — works for cities (Cannes, Nice, Reims, Megève…).
  return `de ${label}`;
}

function lieuTitleEn(slug: string, label: string): string {
  if (slug === 'france') return 'in France';
  if (slug === 'cote-d-azur' || slug === 'french-riviera') return 'on the French Riviera';
  if (slug === 'provence') return 'in Provence';
  if (slug === 'alpes') return 'in the French Alps';
  return `in ${label}`;
}

// ─── Templates ───────────────────────────────────────────────────────────

export interface RenderedRankingSeed {
  readonly slug: string;
  readonly titleFr: string;
  readonly titleEn: string;
  readonly templateKey: TemplateKey;
}

export type TemplateKey =
  | 'meilleurs-type-lieu'
  | 'plus-beaux-type-lieu'
  | 'meilleurs-hotels-theme-lieu'
  | 'plus-beaux-hotels-lieu'
  | 'hotels-theme-lieu'
  | 'meilleurs-hotels-occasion-lieu'
  | 'meilleurs-type-occasion-lieu'
  | 'meilleurs-hotels-theme-france'
  | 'plus-beaux-type-france';

interface TemplateDef {
  readonly key: TemplateKey;
  readonly applies: (axes: RankingAxes) => boolean;
  readonly render: (axes: RankingAxes) => RenderedRankingSeed;
}

function pickType(axes: RankingAxes): HotelType {
  return axes.types[0] ?? 'all';
}

function pickTheme(axes: RankingAxes): Theme | null {
  return axes.themes[0] ?? null;
}

function pickOccasion(axes: RankingAxes): Occasion | null {
  return axes.occasions[0] ?? null;
}

const TEMPLATES: readonly TemplateDef[] = [
  // T1 — Type × Lieu : "Les meilleurs Palaces de Paris"
  {
    key: 'meilleurs-type-lieu',
    applies: (a) => pickType(a) !== 'all' && a.lieu.slug !== 'france',
    render: (a) => {
      const t = pickType(a);
      return {
        slug: `meilleurs-${TYPE_SLUG[t]}-${a.lieu.slug}`,
        titleFr: `Les meilleurs ${TYPE_LABEL_FR[t]} ${lieuTitleFr(a.lieu.slug, a.lieu.label)}`,
        titleEn: `The best ${TYPE_LABEL_EN[t]} ${lieuTitleEn(a.lieu.slug, a.lieu.label)}`,
        templateKey: 'meilleurs-type-lieu',
      };
    },
  },

  // T2 — Plus beaux Type × Lieu : "Les plus beaux châteaux-hôtels de la Loire"
  {
    key: 'plus-beaux-type-lieu',
    applies: (a) => pickType(a) !== 'all' && a.lieu.slug !== 'france',
    render: (a) => {
      const t = pickType(a);
      return {
        slug: `plus-beaux-${TYPE_SLUG[t]}-${a.lieu.slug}`,
        titleFr: `Les plus beaux ${TYPE_LABEL_FR[t]} ${lieuTitleFr(a.lieu.slug, a.lieu.label)}`,
        titleEn: `The most beautiful ${TYPE_LABEL_EN[t]} ${lieuTitleEn(a.lieu.slug, a.lieu.label)}`,
        templateKey: 'plus-beaux-type-lieu',
      };
    },
  },

  // T3 — Theme × Lieu : "Les meilleurs hôtels avec spa de Provence"
  {
    key: 'meilleurs-hotels-theme-lieu',
    applies: (a) => pickTheme(a) !== null,
    render: (a) => {
      const th = pickTheme(a)!;
      return {
        slug: `meilleurs-hotels-${THEME_SLUG[th]}-${a.lieu.slug}`,
        titleFr: `Les meilleurs hôtels ${THEME_LABEL_FR[th]} ${lieuTitleFr(a.lieu.slug, a.lieu.label)}`,
        titleEn: `The best hotels ${THEME_LABEL_EN[th]} ${lieuTitleEn(a.lieu.slug, a.lieu.label)}`,
        templateKey: 'meilleurs-hotels-theme-lieu',
      };
    },
  },

  // T4 — Plus beaux hotels par lieu (no type) : "Les plus beaux hôtels de Bretagne"
  {
    key: 'plus-beaux-hotels-lieu',
    applies: (a) => pickType(a) === 'all' && pickTheme(a) === null && a.lieu.slug !== 'france',
    render: (a) => ({
      slug: `plus-beaux-hotels-${a.lieu.slug}`,
      titleFr: `Les plus beaux hôtels ${lieuTitleFr(a.lieu.slug, a.lieu.label)}`,
      titleEn: `The most beautiful hotels ${lieuTitleEn(a.lieu.slug, a.lieu.label)}`,
      templateKey: 'plus-beaux-hotels-lieu',
    }),
  },

  // T5 — Hotels theme par lieu (variante shorter) : "Hôtels romantiques à Paris"
  {
    key: 'hotels-theme-lieu',
    applies: (a) => pickTheme(a) !== null && pickType(a) === 'all',
    render: (a) => {
      const th = pickTheme(a)!;
      return {
        slug: `hotels-${THEME_SLUG[th]}-${a.lieu.slug}`,
        titleFr: `Hôtels ${THEME_LABEL_FR[th]} ${lieuTitleFr(a.lieu.slug, a.lieu.label)}`,
        titleEn: `Hotels ${THEME_LABEL_EN[th]} ${lieuTitleEn(a.lieu.slug, a.lieu.label)}`,
        templateKey: 'hotels-theme-lieu',
      };
    },
  },

  // T6 — Occasion × Lieu : "Les meilleurs hôtels pour un week-end à Paris"
  {
    key: 'meilleurs-hotels-occasion-lieu',
    applies: (a) => pickOccasion(a) !== null && pickType(a) === 'all',
    render: (a) => {
      const o = pickOccasion(a)!;
      return {
        slug: `meilleurs-hotels-${OCCASION_SLUG[o]}-${a.lieu.slug}`,
        titleFr: `Les meilleurs hôtels ${OCCASION_LABEL_FR[o]} ${lieuTitleFr(a.lieu.slug, a.lieu.label)}`,
        titleEn: `The best hotels ${OCCASION_LABEL_EN[o]} ${lieuTitleEn(a.lieu.slug, a.lieu.label)}`,
        templateKey: 'meilleurs-hotels-occasion-lieu',
      };
    },
  },

  // T7 — Type × Occasion × Lieu : "Les meilleurs Palaces pour une lune de miel à Paris"
  {
    key: 'meilleurs-type-occasion-lieu',
    applies: (a) => pickType(a) !== 'all' && pickOccasion(a) !== null,
    render: (a) => {
      const t = pickType(a);
      const o = pickOccasion(a)!;
      return {
        slug: `meilleurs-${TYPE_SLUG[t]}-${OCCASION_SLUG[o]}-${a.lieu.slug}`,
        titleFr: `Les meilleurs ${TYPE_LABEL_FR[t]} ${OCCASION_LABEL_FR[o]} ${lieuTitleFr(a.lieu.slug, a.lieu.label)}`,
        titleEn: `The best ${TYPE_LABEL_EN[t]} ${OCCASION_LABEL_EN[o]} ${lieuTitleEn(a.lieu.slug, a.lieu.label)}`,
        templateKey: 'meilleurs-type-occasion-lieu',
      };
    },
  },

  // T8 — National theme : "Les meilleurs hôtels avec spa de France"
  {
    key: 'meilleurs-hotels-theme-france',
    applies: (a) => a.lieu.slug === 'france' && pickTheme(a) !== null && pickType(a) === 'all',
    render: (a) => {
      const th = pickTheme(a)!;
      return {
        slug: `meilleurs-hotels-${THEME_SLUG[th]}-france`,
        titleFr: `Les meilleurs hôtels ${THEME_LABEL_FR[th]} de France`,
        titleEn: `The best hotels ${THEME_LABEL_EN[th]} in France`,
        templateKey: 'meilleurs-hotels-theme-france',
      };
    },
  },

  // T9 — National type : "Les plus beaux Palaces de France"
  {
    key: 'plus-beaux-type-france',
    applies: (a) => a.lieu.slug === 'france' && pickType(a) !== 'all',
    render: (a) => {
      const t = pickType(a);
      return {
        slug: `plus-beaux-${TYPE_SLUG[t]}-france`,
        titleFr: `Les plus beaux ${TYPE_LABEL_FR[t]} de France`,
        titleEn: `The most beautiful ${TYPE_LABEL_EN[t]} in France`,
        templateKey: 'plus-beaux-type-france',
      };
    },
  },
];

/**
 * Try every template in order; return the first applicable rendering.
 * Returns null when no template matches the axes (the combinator
 * skips the seed in that case).
 */
export function renderRanking(axes: RankingAxes): RenderedRankingSeed | null {
  for (const t of TEMPLATES) {
    if (t.applies(axes)) return t.render(axes);
  }
  return null;
}

/**
 * Render via every applicable template (for combinator's deduping
 * step). Useful when an axis combination satisfies multiple templates
 * and we want to keep the most specific.
 */
export function renderAll(axes: RankingAxes): readonly RenderedRankingSeed[] {
  const out: RenderedRankingSeed[] = [];
  for (const t of TEMPLATES) {
    if (t.applies(axes)) out.push(t.render(axes));
  }
  return out;
}

/** Specificity score: higher = more specific (preferred when colliding). */
const TEMPLATE_SPECIFICITY: Readonly<Record<TemplateKey, number>> = {
  'meilleurs-type-occasion-lieu': 5,
  'meilleurs-type-lieu': 4,
  'plus-beaux-type-lieu': 4,
  'meilleurs-hotels-theme-lieu': 3,
  'meilleurs-hotels-occasion-lieu': 3,
  'hotels-theme-lieu': 2,
  'meilleurs-hotels-theme-france': 2,
  'plus-beaux-type-france': 2,
  'plus-beaux-hotels-lieu': 1,
};

export function templateSpecificity(key: TemplateKey): number {
  return TEMPLATE_SPECIFICITY[key];
}
