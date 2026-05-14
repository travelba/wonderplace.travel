import Link from 'next/link';
import type { ReactElement } from 'react';

/**
 * Renders a structured comparison table produced by the editorial v2
 * pipeline. The table data lives in the JSONB `tables` column of
 * `editorial_guides` / `editorial_rankings`, with shape:
 *
 *   {
 *     key, kind, title_fr, title_en, note_fr, note_en,
 *     headers: [{ key, label_fr, label_en, align? }],
 *     rows:    [{ [headerKey]: string | number | boolean | null
 *                              | { text, href? } }]
 *   }
 *
 * - Accessibility: <table> + scoped <th>, caption with title.
 * - SEO: stable DOM that LLM scrapers + Google can index.
 * - i18n: locale chooses _fr / _en at render time.
 *
 * Skill: accessibility, structured-data-schema-org, content-modeling.
 */

export type TableCell =
  | string
  | number
  | boolean
  | null
  | { readonly text: string; readonly href?: string | null | undefined };

export interface EditorialTableHeader {
  readonly key: string;
  readonly label_fr: string;
  readonly label_en?: string;
  readonly align?: 'left' | 'right' | 'center' | undefined;
}

export interface EditorialTableData {
  readonly key: string;
  readonly kind: string;
  readonly title_fr: string;
  readonly title_en?: string;
  readonly note_fr?: string;
  readonly note_en?: string;
  readonly headers: readonly EditorialTableHeader[];
  readonly rows: readonly Readonly<Record<string, TableCell>>[];
}

interface Props {
  readonly table: EditorialTableData;
  readonly locale: 'fr' | 'en';
}

function pickLocalized(
  fr: string | undefined,
  en: string | undefined,
  locale: 'fr' | 'en',
): string {
  if (locale === 'en') {
    return en !== undefined && en.length > 0 ? en : (fr ?? '');
  }
  return fr ?? '';
}

function renderCell(cell: TableCell, locale: 'fr' | 'en'): ReactElement | string {
  if (cell === null || cell === undefined) return '—';
  if (typeof cell === 'boolean') return cell ? '✓' : '—';
  if (typeof cell === 'number') return cell.toLocaleString(locale);
  if (typeof cell === 'string') return cell;
  if (typeof cell === 'object' && typeof cell.text === 'string') {
    if (typeof cell.href === 'string' && cell.href.length > 0) {
      const isExternal = /^https?:\/\//iu.test(cell.href);
      return (
        <Link
          href={cell.href}
          {...(isExternal ? { rel: 'noopener noreferrer', target: '_blank' } : {})}
          className="text-fg underline-offset-2 hover:underline"
        >
          {cell.text}
        </Link>
      );
    }
    return cell.text;
  }
  return String(cell);
}

export function EditorialTable({ table, locale }: Props): ReactElement {
  const title = pickLocalized(table.title_fr, table.title_en, locale);
  const note = pickLocalized(table.note_fr, table.note_en, locale);
  return (
    <figure className="border-border bg-bg/30 my-8 overflow-hidden rounded-lg border">
      <figcaption className="text-fg/90 border-border bg-bg/60 border-b px-4 py-3 font-serif text-base font-light">
        {title}
      </figcaption>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-border border-b">
              {table.headers.map((h) => (
                <th
                  key={h.key}
                  scope="col"
                  className={`text-fg/80 px-4 py-2.5 text-xs font-medium uppercase tracking-wide ${
                    h.align === 'right'
                      ? 'text-right'
                      : h.align === 'center'
                        ? 'text-center'
                        : 'text-left'
                  }`}
                >
                  {pickLocalized(h.label_fr, h.label_en, locale)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, idx) => (
              <tr
                key={idx}
                className="border-border/50 hover:bg-bg/50 border-b transition-colors last:border-b-0"
              >
                {table.headers.map((h, i) => (
                  <td
                    key={h.key}
                    className={`text-fg/90 px-4 py-2.5 ${
                      h.align === 'right'
                        ? 'text-right'
                        : h.align === 'center'
                          ? 'text-center'
                          : 'text-left'
                    } ${i === 0 ? 'font-medium' : ''}`}
                  >
                    {renderCell(row[h.key] ?? null, locale)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {note.length > 0 ? (
        <p className="text-fg/60 border-border bg-bg/40 border-t px-4 py-2 text-xs italic">
          {note}
        </p>
      ) : null}
    </figure>
  );
}
