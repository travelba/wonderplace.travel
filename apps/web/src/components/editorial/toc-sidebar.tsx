'use client';

import { useEffect, useState, type ReactElement } from 'react';

/**
 * Sticky table-of-contents sidebar for editorial long-reads.
 * Tracks the closest visible <section id="..."> via IntersectionObserver
 * so the current section's link is highlighted as the reader scrolls.
 *
 * Data: precomputed at write-time by the editorial pipeline and stored
 * in the JSONB `toc_anchors` column (cf. push-guide-v2.ts /
 * push-ranking-v2.ts).
 *
 * Skill: accessibility (`<nav aria-label>`), responsive-ui-architecture
 * (mobile = horizontal scroll, desktop = sticky vertical).
 */

export interface TocAnchor {
  readonly anchor: string;
  readonly label_fr: string;
  readonly label_en: string;
  readonly level?: 2 | 3 | undefined;
}

interface Props {
  readonly anchors: readonly TocAnchor[];
  readonly locale: 'fr' | 'en';
}

export function TocSidebar({ anchors, locale }: Props): ReactElement | null {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || anchors.length === 0) return;
    const targets: HTMLElement[] = [];
    for (const a of anchors) {
      const el = document.getElementById(a.anchor);
      if (el !== null) targets.push(el);
    }
    if (targets.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) => (a.target as HTMLElement).offsetTop - (b.target as HTMLElement).offsetTop,
          );
        const first = visible[0];
        if (first) {
          setActiveId(first.target.id);
        }
      },
      { rootMargin: '-25% 0px -65% 0px', threshold: 0 },
    );
    for (const t of targets) observer.observe(t);
    return () => observer.disconnect();
  }, [anchors]);

  if (anchors.length === 0) return null;

  const heading = locale === 'en' ? 'On this page' : 'Sur cette page';

  return (
    <nav
      aria-label={heading}
      className="border-border bg-bg/60 hidden rounded-lg border p-4 lg:sticky lg:top-24 lg:block"
    >
      <p className="text-fg/60 mb-2 text-xs font-medium uppercase tracking-wider">{heading}</p>
      <ul className="space-y-1.5 text-sm">
        {anchors.map((a) => {
          const label =
            locale === 'en' ? (a.label_en.length > 0 ? a.label_en : a.label_fr) : a.label_fr;
          const isActive = activeId === a.anchor;
          return (
            <li key={a.anchor} className={`${a.level === 3 ? 'pl-3' : ''}`}>
              <a
                href={`#${a.anchor}`}
                className={`block border-l-2 py-0.5 pl-2.5 transition-colors ${
                  isActive
                    ? 'border-l-fg/60 text-fg'
                    : 'text-fg/70 hover:border-l-fg/30 hover:text-fg/90 border-l-transparent'
                }`}
              >
                {label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
