/**
 * scale-manual-palaces.ts — drive build-brief-manual.ts for the Atout France
 * Palaces absent from DATAtourisme (5 Courchevel + Château Saint-Martin Vence
 * + Airelles Gordes + Cheval Blanc St-Barth).
 *
 * Each entry carries the minimum facts needed to bootstrap the brief:
 * canonical name, city, postal code, GPS coordinates (from the hotel's own
 * official "find us" page), official website. Wikidata + Wikipedia + Tavily
 * fill the rest.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

interface ManualPalace {
  readonly slug: string;
  readonly name: string;
  readonly city: string;
  readonly postal: string;
  readonly address: string;
  readonly lat: number;
  readonly lng: number;
  readonly website: string;
  /** Optional explicit Wikipedia FR page title hint (falls back to name). */
  readonly wpTitle?: string;
  /** Optional explicit Wikidata QID hint. */
  readonly qid?: string;
  /** French region for log readability. */
  readonly region: string;
}

const MANUAL_PALACES: readonly ManualPalace[] = [
  // ─── Courchevel 1850 — Le Jardin Alpin ──────────────────────────────────
  {
    slug: 'cheval-blanc-courchevel',
    name: 'Cheval Blanc Courchevel',
    city: 'Courchevel',
    postal: '73120',
    address: 'Le Jardin Alpin',
    lat: 45.4119,
    lng: 6.6291,
    website: 'https://www.chevalblanc.com/courchevel',
    wpTitle: 'Cheval Blanc Courchevel',
    region: 'Savoie/Courchevel',
  },
  {
    slug: 'fouquets-courchevel',
    name: "Le Fouquet's Courchevel",
    city: 'Courchevel',
    postal: '73120',
    address: 'Rue du Marquis',
    lat: 45.4128,
    lng: 6.631,
    website: 'https://www.barriere.com/fr/courchevel/le-fouquets.html',
    region: 'Savoie/Courchevel',
  },
  {
    slug: 'lapogee-courchevel',
    name: "L'Apogée Courchevel",
    city: 'Courchevel',
    postal: '73120',
    address: 'Le Jardin Alpin',
    lat: 45.4135,
    lng: 6.6311,
    website: 'https://www.oetkercollection.com/fr/hotels/lapogee-courchevel/',
    wpTitle: "L'Apogée Courchevel",
    region: 'Savoie/Courchevel',
  },
  {
    slug: 'le-k2-palace',
    name: 'Le K2 Palace',
    city: 'Courchevel',
    postal: '73120',
    address: '238 rue des Clarines',
    lat: 45.4135,
    lng: 6.6228,
    website: 'https://www.lek2collections.com/fr/le-k2-palace',
    region: 'Savoie/Courchevel',
  },
  {
    slug: 'les-airelles-courchevel',
    name: 'Les Airelles Courchevel',
    city: 'Courchevel',
    postal: '73120',
    address: 'Le Jardin Alpin',
    lat: 45.4118,
    lng: 6.6296,
    website: 'https://airelles.com/fr/destination/courchevel-hotel',
    wpTitle: 'Les Airelles',
    region: 'Savoie/Courchevel',
  },
  // ─── Côte d'Azur arrière-pays ───────────────────────────────────────────
  {
    slug: 'chateau-saint-martin-vence',
    name: 'Château Saint-Martin & Spa',
    city: 'Vence',
    postal: '06140',
    address: '2490 avenue des Templiers',
    lat: 43.731,
    lng: 7.11,
    website: 'https://www.oetkercollection.com/fr/hotels/chateau-saint-martin/',
    region: 'Alpes-Maritimes/Vence',
  },
  // ─── Provence/Luberon ───────────────────────────────────────────────────
  {
    slug: 'les-airelles-gordes',
    name: 'Airelles Gordes, La Bastide',
    city: 'Gordes',
    postal: '84220',
    address: 'Le Village',
    lat: 43.9116,
    lng: 5.1985,
    website: 'https://airelles.com/fr/destination/gordes-hotel',
    region: 'Vaucluse/Gordes',
  },
  // ─── Caraïbes ───────────────────────────────────────────────────────────
  {
    slug: 'cheval-blanc-st-barth',
    name: 'Cheval Blanc St-Barth Isle de France',
    city: 'Saint-Barthélemy',
    postal: '97133',
    address: 'Anse des Flamands',
    lat: 17.914,
    lng: -62.862,
    website: 'https://www.chevalblanc.com/saint-barth',
    wpTitle: 'Cheval Blanc St-Barth',
    region: 'Saint-Barthélemy',
  },
];

async function main(): Promise<void> {
  const briefsDir = resolve(process.cwd(), 'briefs-auto');
  const todo: ManualPalace[] = [];
  for (const e of MANUAL_PALACES) {
    if (existsSync(resolve(briefsDir, `${e.slug}.json`))) {
      console.log(`[skip] ${e.slug} — brief already exists`);
      continue;
    }
    todo.push(e);
  }
  console.log(`\n[scale-manual] ${todo.length} palace(s) to build\n`);

  const results: Array<{ slug: string; ok: boolean; elapsed_ms: number; error?: string }> = [];
  for (let i = 0; i < todo.length; i++) {
    const e = todo[i];
    if (!e) continue;
    const start = Date.now();
    console.log(`\n[${i + 1}/${todo.length}] ${e.slug} — ${e.name} (${e.region})`);
    try {
      await runBuildBriefManual(e);
      results.push({ slug: e.slug, ok: true, elapsed_ms: Date.now() - start });
      console.log(`  ✓ ${e.slug} built in ${((Date.now() - start) / 1000).toFixed(1)}s`);
    } catch (err) {
      const msg = (err as Error).message;
      results.push({ slug: e.slug, ok: false, elapsed_ms: Date.now() - start, error: msg });
      console.error(`  ✗ ${e.slug} FAILED — ${msg}`);
    }
  }

  console.log(`\n━━━ scale-manual summary ━━━`);
  for (const r of results) {
    const tag = r.ok ? '✓' : '✗';
    console.log(
      `  ${tag} ${r.slug} — ${(r.elapsed_ms / 1000).toFixed(1)}s${r.error ? ` — ${r.error}` : ''}`,
    );
  }
  const successes = results.filter((r) => r.ok).map((r) => r.slug);
  console.log(`\n[scale-manual] ${successes.length}/${results.length} successful`);
  if (successes.length > 0) {
    console.log(`\nNext step — run pipeline on built briefs:`);
    console.log(
      `  $env:EDITORIAL_PILOT_BRIEFS_DIR="briefs-auto"; $env:EDITORIAL_PILOT_ANCHOR_SCRUB="1"`,
    );
    console.log(`  pnpm exec tsx src/run.ts ${successes.join(' ')}`);
  }
}

function runBuildBriefManual(e: ManualPalace): Promise<void> {
  return new Promise((resolveP, rejectP) => {
    const isWin = process.platform === 'win32';
    const quote = (s: string): string => (isWin ? `"${s.replace(/"/g, '\\"')}"` : s);
    const args: string[] = [
      'exec',
      'tsx',
      'src/enrichment/build-brief-manual.ts',
      e.slug,
      '--name',
      quote(e.name),
      '--city',
      quote(e.city),
      '--postal',
      e.postal,
      '--address',
      quote(e.address),
      '--lat',
      String(e.lat),
      '--lng',
      String(e.lng),
      '--website',
      e.website,
    ];
    if (e.wpTitle) {
      args.push('--wp', quote(e.wpTitle));
    }
    if (e.qid) {
      args.push('--qid', e.qid);
    }

    const child = spawn('pnpm', args, {
      stdio: ['ignore', 'inherit', 'inherit'],
      shell: isWin,
      windowsVerbatimArguments: isWin,
    });
    child.on('error', rejectP);
    child.on('exit', (code) => (code === 0 ? resolveP() : rejectP(new Error(`exit ${code}`))));
  });
}

main().catch((err) => {
  console.error('[scale-manual-palaces] FATAL:', err);
  process.exit(1);
});
