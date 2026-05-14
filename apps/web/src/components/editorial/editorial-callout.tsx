import type { ReactElement } from 'react';

/**
 * Sidebar editorial box: "Le saviez-vous ?", "Conseil de notre
 * conciergerie", "Attention", "Pro tip", "Fait".
 *
 * Stored in the JSONB `editorial_callouts` column of
 * `editorial_guides` / `editorial_rankings`:
 *
 *   { kind, title_fr, title_en, body_fr (≥ 30 words), body_en }
 *
 * Skill: responsive-ui-architecture, accessibility.
 */

export type CalloutKind = 'did_you_know' | 'concierge_tip' | 'warning' | 'pro_tip' | 'fact';

const KNOWN_KINDS: readonly CalloutKind[] = [
  'did_you_know',
  'concierge_tip',
  'warning',
  'pro_tip',
  'fact',
];

function isKnownKind(value: string): value is CalloutKind {
  return (KNOWN_KINDS as readonly string[]).includes(value);
}

export interface EditorialCalloutData {
  /**
   * Free-form so the component can absorb LLM-generated synonyms;
   * unknown kinds gracefully fall back to a neutral "fact" tone.
   */
  readonly kind: string;
  readonly title_fr: string;
  readonly title_en?: string;
  readonly body_fr: string;
  readonly body_en?: string;
}

const KIND_LABEL_FR: Readonly<Record<CalloutKind, string>> = {
  did_you_know: 'Le saviez-vous ?',
  concierge_tip: 'Le conseil de la conciergerie',
  warning: 'À noter',
  pro_tip: 'Astuce experte',
  fact: 'Le fait',
};

const KIND_LABEL_EN: Readonly<Record<CalloutKind, string>> = {
  did_you_know: 'Did you know?',
  concierge_tip: 'Concierge tip',
  warning: 'Important',
  pro_tip: 'Pro tip',
  fact: 'Fact',
};

const KIND_TONE: Readonly<Record<CalloutKind, string>> = {
  did_you_know: 'border-l-4 border-l-amber-500/60 bg-amber-50/40 dark:bg-amber-950/20',
  concierge_tip: 'border-l-4 border-l-emerald-600/60 bg-emerald-50/40 dark:bg-emerald-950/20',
  warning: 'border-l-4 border-l-rose-500/60 bg-rose-50/40 dark:bg-rose-950/20',
  pro_tip: 'border-l-4 border-l-sky-500/60 bg-sky-50/40 dark:bg-sky-950/20',
  fact: 'border-l-4 border-l-slate-400/60 bg-slate-50/40 dark:bg-slate-900/30',
};

interface Props {
  readonly callout: EditorialCalloutData;
  readonly locale: 'fr' | 'en';
}

function pick(fr: string | undefined, en: string | undefined, locale: 'fr' | 'en'): string {
  if (locale === 'en') return en !== undefined && en.length > 0 ? en : (fr ?? '');
  return fr ?? '';
}

export function EditorialCallout({ callout, locale }: Props): ReactElement {
  const safeKind: CalloutKind = isKnownKind(callout.kind) ? callout.kind : 'fact';
  const eyebrow = locale === 'en' ? KIND_LABEL_EN[safeKind] : KIND_LABEL_FR[safeKind];
  const tone = KIND_TONE[safeKind];
  const title = pick(callout.title_fr, callout.title_en, locale);
  const body = pick(callout.body_fr, callout.body_en, locale);
  return (
    <aside className={`my-6 rounded-r-lg px-5 py-4 ${tone}`} role="note" aria-label={eyebrow}>
      <p className="text-fg/60 mb-1 text-xs font-medium uppercase tracking-wider">{eyebrow}</p>
      <h4 className="text-fg mb-1.5 font-medium">{title}</h4>
      <p className="text-fg/85 text-sm leading-relaxed">{body}</p>
    </aside>
  );
}
