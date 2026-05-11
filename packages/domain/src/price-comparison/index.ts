export type {
  CompetitorPrice,
  CompetitorProvider,
  ComparisonScenario,
  NormalizedComparison,
} from './types';
export { COMPETITOR_PROVIDERS } from './types';
export {
  normalizeComparison,
  type NormalizeComparisonInput,
  type RawCompetitorEntry,
} from './normalize';
export { computeScenario, type ScenarioInput } from './scenario';
