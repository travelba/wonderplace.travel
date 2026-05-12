import type { AmenityCategory } from '@/server/hotels/amenity-taxonomy';

/**
 * Category pictograms for the grouped amenities block (CDC §2 bloc 6).
 *
 * Why inline SVG and not `lucide-react`?
 *   - `apps/web` currently ships **zero icon dependencies**. Adding
 *     `lucide-react` pulls ~50 kB gzipped of icon metadata + a full
 *     tree-shake setup just for nine glyphs that never change. The
 *     inline path approach keeps the bundle flat and these icons
 *     stable forever (they ship inside the page HTML, no client JS).
 *   - The paths below are originals (sketched from the Lucide
 *     vocabulary which is ISC-licensed) trimmed to a single `<path>`
 *     per glyph so the markup stays compact.
 *
 * Design tokens
 *   - 16×16 viewBox, 1.25 stroke, rounded caps/joins.
 *   - The colour is inherited via `currentColor` so the caller decides
 *     whether the icon adopts `text-accent`, `text-muted`, …
 *
 * A11y
 *   - The icon is **decorative**. The category label sits next to it
 *     and is the screen-reader source of truth, so we render the SVG
 *     with `aria-hidden="true"` and `focusable="false"`.
 */
const CATEGORY_PATHS: Record<AmenityCategory, string> = {
  // wellness: a spa droplet + sparkle (water therapies + signature feel)
  wellness:
    'M8 1.5C5.7 4.5 4 7 4 9.25a4 4 0 1 0 8 0C12 7 10.3 4.5 8 1.5Z M13 2.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6Z',
  // dining: a fork + knife pair
  dining:
    'M5 1.5v6 M5 7.5v7 M3.5 1.5v3.5a1.5 1.5 0 0 0 3 0V1.5 M11 1.5v13 M11 1.5l2 2v3.5a2 2 0 0 1-2 2',
  // services: a service bell with handle
  services: 'M2.5 12h11 M3.5 12V11a4.5 4.5 0 0 1 9 0v1 M8 6.5V4.5 M6.5 4.5h3 M7 14h2',
  // family: two adults with a child silhouette in front
  family:
    'M4.25 5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm0 0a2.5 2.5 0 0 0-2.5 2.5v3h1.5l.5 4h1l.5-4h1.5v-3A2.5 2.5 0 0 0 4.25 5Z M11.75 5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm0 0a2.5 2.5 0 0 0-2.5 2.5v3h1.5l.5 4h1l.5-4h1.5v-3A2.5 2.5 0 0 0 11.75 5Z',
  // connectivity: a wifi arc
  connectivity: 'M2 7.5a8 8 0 0 1 12 0 M4 9.5a5 5 0 0 1 8 0 M6 11.5a2 2 0 0 1 4 0 M8 14h0',
  // business: a briefcase
  business: 'M2.5 5.5h11v8h-11Z M5.5 5.5V4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.5 M2.5 8.5h11',
  // accessibility: a wheelchair user (ISA-inspired)
  accessibility:
    'M9 3a1.25 1.25 0 1 0 0-2.5A1.25 1.25 0 0 0 9 3Z M9 3.25v3l2 .25 1 3 1.5-.5 M6.5 14a3.5 3.5 0 1 1 3.5-4',
  // sustainability: a leaf
  sustainability: 'M3 13c0-5 4-9 10-10-1 6-5 10-10 10Z M3 13l5-5',
  // other: a tag
  other: 'M2.5 8.5 8.5 2.5h4v4l-6 6Z M10.5 5.5a.75.75 0 1 1 .001-1.501.75.75 0 0 1-.001 1.501Z',
};

interface AmenityCategoryIconProps {
  readonly category: AmenityCategory;
  /** Tailwind classes applied to the SVG root. Defaults to a 14×14 size. */
  readonly className?: string;
}

export function AmenityCategoryIcon({
  category,
  className = 'h-3.5 w-3.5 shrink-0 opacity-70',
}: AmenityCategoryIconProps): React.ReactElement {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={CATEGORY_PATHS[category]} />
    </svg>
  );
}
