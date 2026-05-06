/**
 * Web Vitals reporter — invoked from app/layout.tsx via Next.js `reportWebVitals`.
 * Posts metrics to /api/metrics/web-vitals which forwards to Sentry custom measurements
 * and Vercel Analytics.
 */
export interface WebVitalsMetric {
  readonly id: string;
  readonly name: 'CLS' | 'FCP' | 'INP' | 'LCP' | 'TTFB' | 'FID';
  readonly value: number;
  readonly rating: 'good' | 'needs-improvement' | 'poor';
  readonly navigationType?: string;
}

export const reportWebVitals = (metric: WebVitalsMetric): void => {
  if (typeof window === 'undefined') return;
  const body = JSON.stringify(metric);
  const url = '/api/metrics/web-vitals';
  if ('sendBeacon' in navigator) {
    navigator.sendBeacon(url, body);
  } else {
    void fetch(url, { method: 'POST', body, keepalive: true });
  }
};
