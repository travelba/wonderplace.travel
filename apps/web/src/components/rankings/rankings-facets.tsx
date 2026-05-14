'use client';

import { useMemo, useState } from 'react';

import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';

interface RankingCard {
  readonly slug: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly entryCount: number;
  /**
   * Pre-rendered label for the entry count (e.g. "12 hôtels"). The
   * parent Server Component owns the i18n logic; we only render a
   * string here so the props payload stays serialisable across the
   * RSC ↔ Client Component boundary.
   */
  readonly entryCountLabel: string;
  readonly kind: 'best_of' | 'awarded' | 'thematic' | 'geographic';
  readonly types: readonly string[];
  readonly lieuSlug: string | null;
  readonly lieuLabel: string | null;
  readonly themes: readonly string[];
  readonly occasions: readonly string[];
}

interface FacetOption {
  readonly value: string;
  readonly label: string;
  readonly count: number;
}

interface FacetGroup {
  readonly id: 'type' | 'lieu' | 'theme' | 'occasion';
  readonly label: string;
  readonly options: readonly FacetOption[];
}

interface Props {
  readonly rankings: ReadonlyArray<RankingCard>;
  readonly facets: ReadonlyArray<FacetGroup>;
  readonly locale: Locale;
  readonly seeRankingLabel: string;
  readonly searchPlaceholder: string;
  readonly emptyLabel: string;
  readonly clearLabel: string;
  /**
   * String template containing the placeholder `{n}` (e.g.
   * `"{n} résultats"`). We keep it as a string — not a function —
   * so the props payload stays serialisable across the RSC ↔ Client
   * Component boundary (Next.js refuses to pass functions to client
   * components).
   */
  readonly resultsLabelTpl: string;
  readonly subhubsLabel: string;
}

type FilterId = FacetGroup['id'];

function rankingMatchesFilter(ranking: RankingCard, filterId: FilterId, value: string): boolean {
  switch (filterId) {
    case 'type':
      return ranking.types.includes(value);
    case 'lieu':
      return ranking.lieuSlug === value;
    case 'theme':
      return ranking.themes.includes(value);
    case 'occasion':
      return ranking.occasions.includes(value);
    default:
      return false;
  }
}

export function RankingsFacets({
  rankings,
  facets,
  locale,
  seeRankingLabel,
  searchPlaceholder,
  emptyLabel,
  clearLabel,
  resultsLabelTpl,
  subhubsLabel,
}: Props) {
  const [search, setSearch] = useState('');
  const [active, setActive] = useState<Record<FilterId, string | null>>({
    type: null,
    lieu: null,
    theme: null,
    occasion: null,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rankings.filter((r) => {
      if (q.length > 0) {
        const hay = `${r.title} ${r.subtitle ?? ''} ${r.lieuLabel ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      for (const id of Object.keys(active) as FilterId[]) {
        const v = active[id];
        if (v === null) continue;
        if (!rankingMatchesFilter(r, id, v)) return false;
      }
      return true;
    });
  }, [rankings, search, active]);

  const activeCount = Object.values(active).filter((v) => v !== null).length;

  return (
    <div>
      {/* Search + clear */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="border-border bg-bg/60 w-full max-w-xs rounded border px-3 py-2 text-sm focus:border-amber-500/60 focus:outline-none"
        />
        {(activeCount > 0 || search.length > 0) && (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setActive({ type: null, lieu: null, theme: null, occasion: null });
            }}
            className="text-fg/70 text-xs underline hover:no-underline"
          >
            {clearLabel}
          </button>
        )}
        <span className="text-muted ml-auto text-xs">
          {resultsLabelTpl.replace('{n}', String(filtered.length))}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[260px_1fr]">
        {/* Facets sidebar */}
        <aside aria-label={locale === 'fr' ? 'Filtres' : 'Filters'} className="space-y-6">
          {facets.map((group) => (
            <fieldset key={group.id} className="space-y-2">
              <legend className="text-fg mb-1 text-xs font-medium uppercase tracking-wide">
                {group.label}
              </legend>
              <ul className="space-y-1">
                <li>
                  <button
                    type="button"
                    onClick={() => setActive((a) => ({ ...a, [group.id]: null }))}
                    className={`text-left text-sm transition ${
                      active[group.id] === null
                        ? 'text-fg font-semibold'
                        : 'text-fg/70 hover:text-fg'
                    }`}
                  >
                    {locale === 'fr' ? 'Tous' : 'All'}
                  </button>
                </li>
                {group.options.map((opt) => (
                  <li key={opt.value} className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setActive((a) => ({
                          ...a,
                          [group.id]: a[group.id] === opt.value ? null : opt.value,
                        }))
                      }
                      className={`text-left text-sm transition ${
                        active[group.id] === opt.value
                          ? 'text-fg font-semibold'
                          : 'text-fg/70 hover:text-fg'
                      }`}
                    >
                      {opt.label}
                    </button>
                    <Link
                      href={`/classements/${group.id}/${opt.value}`}
                      className="text-muted/70 text-[10px] uppercase tracking-wide hover:underline"
                      aria-label={`${subhubsLabel}: ${opt.label}`}
                    >
                      {opt.count}
                    </Link>
                  </li>
                ))}
              </ul>
            </fieldset>
          ))}
        </aside>

        {/* Result list */}
        <div>
          {filtered.length === 0 ? (
            <p className="text-muted/80 text-sm">{emptyLabel}</p>
          ) : (
            <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {filtered.map((r) => (
                <li
                  key={r.slug}
                  className="border-border bg-bg/60 rounded-lg border p-5 transition hover:shadow-md"
                >
                  <Link href={`/classement/${r.slug}`} className="block">
                    <p className="text-muted mb-1 text-xs uppercase tracking-wide">
                      {r.entryCountLabel}
                      {r.lieuLabel !== null ? ` · ${r.lieuLabel}` : ''}
                    </p>
                    <h3 className="text-fg font-medium">{r.title}</h3>
                    {r.subtitle !== null && r.subtitle.length > 0 ? (
                      <p className="text-fg/75 mt-2 line-clamp-3 text-xs">{r.subtitle}</p>
                    ) : null}
                    <p className="text-fg/70 mt-3 text-xs underline">{seeRankingLabel} →</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
