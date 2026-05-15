import { z } from 'zod';

const ConfidenceSchema = z.enum(['high', 'medium-high', 'medium', 'medium-low', 'low']);

const SourceSchema = z.object({
  type: z.string(),
  url: z.string().url().optional(),
  qid: z.string().optional(),
  citation: z.string().optional(),
  consulted_at: z.string().optional(),
});

const KeyDateSchema = z.object({
  year: z.number().int(),
  event: z.string(),
  confidence: ConfidenceSchema.optional(),
});

const CulturalRefSchema = z.object({
  type: z.string(),
  item: z.string(),
  confidence: ConfidenceSchema.optional(),
});

const DiningSchema = z.object({
  name: z.string(),
  type: z.string(),
  chef: z.string().optional(),
  current_chef: z.string().optional(),
  michelin_stars: z.number().int().min(0).max(3).optional(),
  michelin_history_note: z.string().optional(),
  since_stars: z.union([z.number().int(), z.string()]).optional(),
  style: z.string().optional(),
  cuisine: z.string().optional(),
  designer: z.string().optional(),
  signature: z.string().optional(),
  feature: z.string().optional(),
  verified_confidence: ConfidenceSchema.optional(),
  source: z.string().optional(),
  note_to_check: z.string().optional(),
});

const PoiSchema = z.object({
  name: z.string(),
  distance_m: z.number().int().min(0),
  type: z.string(),
  note: z.string().optional(),
  confidence: ConfidenceSchema.optional(),
});

const ExternalSourceFactSchema = z.object({
  source: z.string(),
  url: z.string().url().optional(),
  verbatim: z.string().min(20),
  confidence: z.enum(['high', 'medium-high', 'medium', 'medium-low', 'low']).optional(),
});

export const BriefSchema = z.object({
  slug: z.string().min(3),
  name: z.string().min(3),
  operator: z.string().optional(),
  city: z.string(),
  region: z.string().optional(),
  country: z.string().length(2),
  address: z.string(),
  coordinates: z.object({
    lat: z.number(),
    lng: z.number(),
    verified_confidence: ConfidenceSchema.optional(),
    source: z.string().optional(),
  }),
  classification: z.object({
    stars: z.number().int().min(1).max(5),
    atout_france_palace: z.boolean(),
    atout_france_palace_first_distinction_year: z.number().int().nullable().optional(),
    verified_confidence: ConfidenceSchema.optional(),
    source: z.string().optional(),
  }),
  history: z.object({
    opening_year: z.number().int().optional(),
    founder_or_first_operator: z.string().optional(),
    eden_roc_pavilion_year: z.number().int().optional(),
    verified_confidence: ConfidenceSchema.optional(),
    key_dates: z.array(KeyDateSchema).min(1),
    cultural_references: z.array(CulturalRefSchema).min(1),
  }),
  architecture: z.record(z.unknown()),
  capacity: z.record(z.unknown()),
  dining: z.array(DiningSchema).min(1),
  wellness: z.record(z.unknown()).optional(),
  service: z.record(z.unknown()),
  signature_features: z.array(z.string()).min(1),
  nearby_pois: z.array(PoiSchema).min(1),
  iata_insider: z.object({
    advisor_name: z.string(),
    advisor_role: z.string(),
    key_observation: z.string(),
    best_for: z.string(),
    honest_caveat: z.string(),
    alternative_recommendation: z.string().optional(),
  }),
  pricing_indication: z.record(z.unknown()).optional(),
  operational: z.record(z.unknown()).optional(),
  sources: z.array(SourceSchema).min(2),
  external_source_facts: z.array(ExternalSourceFactSchema).optional(),
  verification_required_before_publication: z.array(z.string()).min(1),
});

export type Brief = z.infer<typeof BriefSchema>;

export const FactCheckReportSchema = z.object({
  hotel_slug: z.string(),
  summary: z.object({
    facts_ok: z.number().int().min(0),
    warn_medium: z.number().int().min(0),
    warn_low: z.number().int().min(0),
    hallucinations: z.number().int().min(0),
    tbd_leftover: z.number().int().min(0),
    divergent_numbers: z.number().int().min(0),
    cultural_to_verify: z.number().int().min(0),
  }),
  findings: z.array(
    z.object({
      category: z.string(),
      severity: z.enum(['blocker', 'high', 'medium', 'low']),
      quote_from_text: z.string(),
      issue: z.string(),
      brief_reference: z.string(),
      recommended_action: z.string(),
    }),
  ),
  external_sources_required: z
    .array(
      z.object({
        fact: z.string(),
        suggested_source: z.string(),
        before_publication: z.boolean(),
      }),
    )
    .optional(),
  final_recommendation: z.enum(['READY_TO_PUBLISH', 'NEEDS_PASS_2BIS', 'MANUAL_REVIEW_REQUIRED']),
  blockers_for_publication: z.array(z.string()),
});

export type FactCheckReport = z.infer<typeof FactCheckReportSchema>;
