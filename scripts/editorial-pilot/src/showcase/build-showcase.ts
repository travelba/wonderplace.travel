/**
 * build-showcase.ts — produces the *complete* publishable bundle for one
 * palace, demonstrating what the final Next.js page is supposed to surface.
 *
 * Input  : briefs-auto/<slug>.json + docs/editorial/pilots-auto/<slug>.md
 * Output : docs/editorial/showcase/<slug>/
 *   ├── final.md            (enriched markdown — FAQ, AEO blocks, full POI list)
 *   ├── jsonld.json         (Hotel + Restaurants + FAQPage + BreadcrumbList)
 *   ├── aeo.json            (3-4 answer-engine optimised blocks)
 *   ├── metadata.json       (Next.js metadata — title, description, og, hreflang)
 *   ├── llms-entry.txt      (entry for global llms.txt)
 *   ├── llms-full-entry.txt (entry for llms-full.txt)
 *   ├── agent-skills.json   (entry for /.well-known/agent-skills.json)
 *   └── page-preview.html   (visual HTML preview of the assembled page)
 *
 * NOTE: this is a *demonstration* script. The production version belongs
 * inside the Next.js page at apps/web/src/app/[locale]/hotels/[slug]/
 * but until that route is built, this script materialises the same
 * artefacts as static files so the editorial team can audit them.
 *
 * Usage:
 *   pnpm exec tsx src/showcase/build-showcase.ts <slug>
 *   pnpm exec tsx src/showcase/build-showcase.ts cheval-blanc-courchevel
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

// ─── Brief shape (subset we need) ─────────────────────────────────────────
interface Brief {
  readonly slug: string;
  readonly name: string;
  readonly city: string;
  readonly country: string;
  readonly address: string;
  readonly coordinates: { lat: number; lng: number };
  readonly classification: {
    readonly stars: number;
    readonly atout_france_palace: boolean;
  };
  readonly capacity?: Record<string, unknown>;
  readonly dining: ReadonlyArray<{
    name: string;
    type: string;
    chef?: string;
    michelin_stars?: number;
    cuisine?: string;
    signature?: string;
    source?: string;
  }>;
  readonly wellness?: Record<string, unknown>;
  readonly service?: Record<string, unknown>;
  readonly nearby_pois?: ReadonlyArray<{
    name: string;
    distance_m: number;
    type: string;
    note?: string;
  }>;
  readonly sources: ReadonlyArray<{ type: string; url: string; consulted_at: string }>;
  readonly external_source_facts?: ReadonlyArray<{
    source: string;
    url: string;
    verbatim: string;
    confidence: string;
  }>;
}

const SITE_ORIGIN = 'https://conciergetravel.fr';
const SITE_NAME = 'ConciergeTravel.fr';

async function main(): Promise<void> {
  const slug = process.argv[2];
  if (!slug) {
    console.error('Usage: pnpm exec tsx src/showcase/build-showcase.ts <slug>');
    process.exit(1);
  }

  const briefPath = resolve(process.cwd(), 'briefs-auto', `${slug}.json`);
  const mdPath = resolve(
    process.cwd(),
    '..',
    '..',
    'docs',
    'editorial',
    'pilots-auto',
    `${slug}.md`,
  );
  const outDir = resolve(process.cwd(), '..', '..', 'docs', 'editorial', 'showcase', slug);

  const brief = JSON.parse(await readFile(briefPath, 'utf-8')) as Brief;
  const editorialMd = await readFile(mdPath, 'utf-8');

  console.log(`\n[showcase] building bundle for ${slug}…`);
  console.log(`  brief: ${briefPath}`);
  console.log(`  md:    ${mdPath}`);
  console.log(`  out:   ${outDir}`);

  await mkdir(outDir, { recursive: true });

  // 1. JSON-LD graph ─────────────────────────────────────────────────────
  const jsonld = buildJsonLdGraph(brief);
  await writeFile(resolve(outDir, 'jsonld.json'), JSON.stringify(jsonld, null, 2), 'utf-8');
  console.log(`  ✓ jsonld.json (${jsonld['@graph'].length} nodes)`);

  // 2. AEO blocks ─────────────────────────────────────────────────────────
  const aeo = buildAeoBlocks(brief);
  await writeFile(resolve(outDir, 'aeo.json'), JSON.stringify(aeo, null, 2), 'utf-8');
  console.log(`  ✓ aeo.json (${aeo.length} blocks)`);

  // 3. Metadata (Next.js) ─────────────────────────────────────────────────
  const metadata = buildMetadata(brief);
  await writeFile(resolve(outDir, 'metadata.json'), JSON.stringify(metadata, null, 2), 'utf-8');
  console.log(`  ✓ metadata.json`);

  // 4. llms.txt entry ─────────────────────────────────────────────────────
  const llmsEntry = buildLlmsEntry(brief);
  await writeFile(resolve(outDir, 'llms-entry.txt'), llmsEntry, 'utf-8');

  const llmsFullEntry = buildLlmsFullEntry(brief);
  await writeFile(resolve(outDir, 'llms-full-entry.txt'), llmsFullEntry, 'utf-8');
  console.log(`  ✓ llms-entry.txt + llms-full-entry.txt`);

  // 5. agent-skills.json entry ───────────────────────────────────────────
  const agentSkills = buildAgentSkillsEntry(brief);
  await writeFile(
    resolve(outDir, 'agent-skills.json'),
    JSON.stringify(agentSkills, null, 2),
    'utf-8',
  );
  console.log(`  ✓ agent-skills.json`);

  // 6. Enriched markdown ──────────────────────────────────────────────────
  const enrichedMd = buildEnrichedMarkdown(brief, editorialMd, aeo);
  await writeFile(resolve(outDir, 'final.md'), enrichedMd, 'utf-8');
  console.log(`  ✓ final.md (${enrichedMd.length} chars)`);

  // 7. Page preview HTML ──────────────────────────────────────────────────
  const html = buildPagePreview(brief, enrichedMd, jsonld, aeo, metadata);
  await writeFile(resolve(outDir, 'page-preview.html'), html, 'utf-8');
  console.log(`  ✓ page-preview.html`);

  console.log(`\nOpen the preview:`);
  console.log(`  start "" "${resolve(outDir, 'page-preview.html')}"`);
}

// ─── JSON-LD builders ─────────────────────────────────────────────────────

function buildJsonLdGraph(b: Brief): { '@context': string; '@graph': unknown[] } {
  const url = `${SITE_ORIGIN}/fr/hotels/${b.slug}`;
  const capacity = b.capacity ?? {};
  const totalKeys =
    (capacity['total_keys'] as number | undefined) ??
    (capacity['rooms_count'] as number | undefined);

  const graph: unknown[] = [];

  // BreadcrumbList
  graph.push({
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Accueil', item: `${SITE_ORIGIN}/fr` },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Hôtels Palaces',
        item: `${SITE_ORIGIN}/fr/hotels`,
      },
      { '@type': 'ListItem', position: 3, name: b.name, item: url },
    ],
  });

  // Hotel
  const service = b.service ?? {};
  const wellness = b.wellness ?? {};

  const amenities: string[] = [];
  if (wellness['has_pool']) amenities.push('Piscine');
  if (wellness['has_hammam']) amenities.push('Hammam');
  if (wellness['has_sauna']) amenities.push('Sauna');
  if (wellness['has_fitness']) amenities.push('Salle de fitness');
  if (service['has_valet_parking']) amenities.push('Voiturier');
  if (service['has_concierge']) amenities.push('Conciergerie');
  if (service['has_24h_room_service']) amenities.push('Room service 24/7');
  if (service['has_airport_transfer']) amenities.push('Transferts aéroport');

  const hotelNode: Record<string, unknown> = {
    '@type': 'Hotel',
    '@id': `${url}#hotel`,
    name: b.name,
    url,
    description: `Palace 5 étoiles distingué par Atout France à ${b.city}.`,
    starRating: { '@type': 'Rating', ratingValue: b.classification.stars, bestRating: 5 },
    address: {
      '@type': 'PostalAddress',
      streetAddress: b.address.split(',')[0]?.trim() ?? '',
      addressLocality: b.city,
      addressCountry: b.country,
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: b.coordinates.lat,
      longitude: b.coordinates.lng,
    },
  };
  if (b.classification.atout_france_palace) {
    hotelNode['award'] = 'Distinction Palace — Atout France';
  }
  if (totalKeys && totalKeys > 0) {
    hotelNode['numberOfRooms'] = totalKeys;
  }
  if (service['check_in_time']) hotelNode['checkinTime'] = String(service['check_in_time']);
  if (service['check_out_time']) hotelNode['checkoutTime'] = String(service['check_out_time']);
  if (service['pets_allowed'] === true) hotelNode['petsAllowed'] = true;
  if (service['pets_allowed'] === false) hotelNode['petsAllowed'] = false;
  if (amenities.length > 0) {
    hotelNode['amenityFeature'] = amenities.map((name) => ({
      '@type': 'LocationFeatureSpecification',
      name,
      value: true,
    }));
  }
  hotelNode['dateModified'] = new Date().toISOString().split('T')[0];
  graph.push(hotelNode);

  // Restaurants
  for (const outlet of b.dining) {
    if (outlet.type !== 'restaurant') continue;
    const restNode: Record<string, unknown> = {
      '@type': 'Restaurant',
      name: outlet.name,
      address: {
        '@type': 'PostalAddress',
        streetAddress: b.address.split(',')[0]?.trim() ?? '',
        addressLocality: b.city,
        addressCountry: b.country,
      },
      containedInPlace: { '@id': `${url}#hotel` },
    };
    if (outlet.cuisine) restNode['servesCuisine'] = outlet.cuisine;
    if (outlet.chef) {
      restNode['employee'] = {
        '@type': 'Person',
        name: outlet.chef,
        jobTitle: 'Chef',
      };
    }
    if (outlet.michelin_stars !== undefined && outlet.michelin_stars > 0) {
      restNode['award'] =
        `${outlet.michelin_stars} étoile${outlet.michelin_stars > 1 ? 's' : ''} Guide Michelin`;
    }
    graph.push(restNode);
  }

  // FAQPage
  const faqs = buildFaqs(b);
  if (faqs.length > 0) {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: faqs.map((f) => ({
        '@type': 'Question',
        name: f.question,
        acceptedAnswer: { '@type': 'Answer', text: f.answer },
      })),
    });
  }

  return { '@context': 'https://schema.org', '@graph': graph };
}

interface Faq {
  readonly question: string;
  readonly answer: string;
}

function buildFaqs(b: Brief): readonly Faq[] {
  const out: Faq[] = [];
  const capacity = b.capacity ?? {};
  const wellness = b.wellness ?? {};
  const service = b.service ?? {};

  const totalKeys =
    (capacity['total_keys'] as number | undefined) ??
    (capacity['rooms_count'] as number | undefined);
  if (totalKeys) {
    const minSurface = capacity['min_room_surface_m2'] as number | undefined;
    const maxSurface = capacity['max_room_surface_m2'] as number | undefined;
    const surfaceText =
      minSurface && maxSurface
        ? `, avec des surfaces allant de ${minSurface} à ${maxSurface} m²`
        : '';
    out.push({
      question: `Combien de chambres compte ${b.name} ?`,
      answer: `${b.name} dispose de ${totalKeys} chambres et suites${surfaceText}. L'établissement est classé Palace par Atout France.`,
    });
  }

  const michelinOutlets = b.dining.filter((o) => o.michelin_stars && o.michelin_stars > 0);
  if (michelinOutlets.length > 0) {
    const list = michelinOutlets
      .map(
        (o) =>
          `${o.name} (${o.michelin_stars} étoile${(o.michelin_stars ?? 0) > 1 ? 's' : ''}${o.chef ? `, chef ${o.chef}` : ''})`,
      )
      .join(', ');
    out.push({
      question: `Quels sont les restaurants étoilés à ${b.name} ?`,
      answer: `${b.name} abrite ${michelinOutlets.length} restaurant${michelinOutlets.length > 1 ? 's' : ''} distingué${michelinOutlets.length > 1 ? 's' : ''} par le Guide Michelin : ${list}.`,
    });
  }

  if (wellness['spa_name']) {
    const partner = wellness['partner_brand']
      ? ` en partenariat avec ${wellness['partner_brand']}`
      : '';
    out.push({
      question: `Quels équipements bien-être propose ${b.name} ?`,
      answer: `Le ${wellness['spa_name']}${partner} propose ${wellness['has_pool'] ? 'une piscine, ' : ''}${wellness['has_hammam'] ? 'un hammam, ' : ''}${wellness['has_sauna'] ? 'un sauna, ' : ''}${wellness['has_fitness'] ? 'une salle de fitness' : ''}. Les soins suivent la signature de la maison partenaire.`,
    });
  }

  if (service['check_in_time'] || service['check_out_time']) {
    out.push({
      question: `Quels sont les horaires de check-in et check-out à ${b.name} ?`,
      answer: `Le check-in s'effectue à partir de ${service['check_in_time'] ?? '15h00'} et le check-out jusqu'à ${service['check_out_time'] ?? '12h00'}. Pour des arrivées ou départs en dehors de ces horaires, contactez la conciergerie via votre conseiller ConciergeTravel.fr.`,
    });
  }

  if (service['pets_allowed'] === true) {
    const note = service['pet_policy_note'] ? ` ${service['pet_policy_note']}` : '';
    out.push({
      question: `Les animaux de compagnie sont-ils acceptés à ${b.name} ?`,
      answer: `Oui, ${b.name} accueille les animaux de compagnie.${note} Les conditions précises (poids maximum, supplément) sont à confirmer auprès du conciergerie de l'hôtel.`,
    });
  }

  return out;
}

// ─── AEO blocks ────────────────────────────────────────────────────────────

function buildAeoBlocks(b: Brief): Array<{ question: string; answer: string; word_count: number }> {
  const out: Array<{ question: string; answer: string }> = [];
  const capacity = b.capacity ?? {};
  const wellness = b.wellness ?? {};
  const totalKeys =
    (capacity['total_keys'] as number | undefined) ??
    (capacity['rooms_count'] as number | undefined);

  // AEO 1 — Summary (50-60 mots)
  const michelinCount = b.dining.filter((o) => o.michelin_stars && o.michelin_stars > 0).length;
  out.push({
    question: `Qu'est-ce que ${b.name} ?`,
    answer: `${b.name} est un hôtel 5 étoiles distingué Palace par Atout France, situé à ${b.city}. L'établissement compte ${totalKeys ?? 'une sélection de'} chambres et suites, ${michelinCount > 0 ? `${michelinCount} restaurant${michelinCount > 1 ? 's' : ''} étoilé${michelinCount > 1 ? 's' : ''} au Guide Michelin, ` : ''}${wellness['spa_name'] ? `un spa ${wellness['partner_brand'] ?? ''} ` : ''}et un service de Palace conforme aux exigences du classement Atout France.`,
  });

  // AEO 2 — Pour qui ? (best for)
  out.push({
    question: `À qui s'adresse ${b.name} ?`,
    answer: `${b.name} s'adresse aux voyageurs en quête d'une adresse Palace 5 étoiles à ${b.city}, exigeants sur la gastronomie, le service et l'authenticité du cadre. L'établissement convient particulièrement aux séjours en couple, aux célébrations marquantes et aux voyageurs habitués des standards Atout France les plus stricts.`,
  });

  // AEO 3 — Restaurants
  if (michelinCount > 0) {
    const top = b.dining.find((o) => o.michelin_stars && o.michelin_stars > 0);
    if (top) {
      out.push({
        question: `Quel est le restaurant principal de ${b.name} ?`,
        answer: `Le restaurant signature de ${b.name} est ${top.name}, distingué de ${top.michelin_stars} étoile${(top.michelin_stars ?? 0) > 1 ? 's' : ''} au Guide Michelin${top.chef ? `, sous la direction du chef ${top.chef}` : ''}. ${top.signature ? top.signature.slice(0, 120) : "L'établissement propose une cuisine d'auteur reflétant les standards d'un Palace 5 étoiles."}`,
      });
    }
  }

  // AEO 4 — Wellness
  if (wellness['spa_name']) {
    out.push({
      question: `Le spa de ${b.name}, c'est quoi ?`,
      answer: `Le ${wellness['spa_name']} est l'espace bien-être signature de ${b.name}${wellness['partner_brand'] ? `, en partenariat avec la maison ${wellness['partner_brand']}` : ''}. Il comprend ${wellness['has_pool'] ? 'une piscine, ' : ''}${wellness['has_hammam'] ? 'un hammam, ' : ''}${wellness['has_sauna'] ? 'un sauna, ' : ''}et une carte de soins fidèle aux protocoles de la maison.`,
    });
  }

  // Add word counts and filter to AEO range (40-80 words)
  return out
    .map((block) => ({
      question: block.question,
      answer: block.answer,
      word_count: block.answer.trim().split(/\s+/u).length,
    }))
    .filter((b) => b.word_count >= 25 && b.word_count <= 100); // soft range for showcase
}

// ─── Next.js metadata ──────────────────────────────────────────────────────

function buildMetadata(b: Brief): Record<string, unknown> {
  const url = `${SITE_ORIGIN}/fr/hotels/${b.slug}`;
  const capacity = b.capacity ?? {};
  const totalKeys =
    (capacity['total_keys'] as number | undefined) ??
    (capacity['rooms_count'] as number | undefined);
  const michelinCount = b.dining.filter((o) => o.michelin_stars && o.michelin_stars > 0).length;

  const title = `${b.name} — Hôtel Palace 5★ à ${b.city} | ${SITE_NAME}`;
  const description = `${b.name}, Palace Atout France 5 étoiles à ${b.city}. ${totalKeys ? `${totalKeys} chambres, ` : ''}${michelinCount > 0 ? `${michelinCount} restaurant${michelinCount > 1 ? 's' : ''} étoilé${michelinCount > 1 ? 's' : ''}, ` : ''}spa & conciergerie. Réservation et conseils IATA par ConciergeTravel.fr.`;

  return {
    title,
    description: description.slice(0, 160),
    canonical: url,
    alternates: {
      canonical: url,
      languages: {
        fr: `${SITE_ORIGIN}/fr/hotels/${b.slug}`,
        en: `${SITE_ORIGIN}/en/hotels/${b.slug}`,
      },
    },
    openGraph: {
      type: 'website',
      url,
      title,
      description: description.slice(0, 200),
      locale: 'fr_FR',
      site_name: SITE_NAME,
      images: [
        {
          url: `${SITE_ORIGIN}/og/hotels/${b.slug}.jpg`,
          width: 1200,
          height: 630,
          alt: `${b.name} — ${b.city}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: description.slice(0, 200),
      images: [`${SITE_ORIGIN}/og/hotels/${b.slug}.jpg`],
    },
    robots: {
      index: true,
      follow: true,
      'max-snippet': -1,
      'max-image-preview': 'large',
      'max-video-preview': -1,
    },
  };
}

// ─── llms.txt / llms-full.txt entries ──────────────────────────────────────

function buildLlmsEntry(b: Brief): string {
  return `- ${SITE_ORIGIN}/fr/hotels/${b.slug} — ${b.name}, Palace 5★ à ${b.city}.\n`;
}

function buildLlmsFullEntry(b: Brief): string {
  const lines: string[] = [];
  const url = `${SITE_ORIGIN}/fr/hotels/${b.slug}`;
  const capacity = b.capacity ?? {};
  const wellness = b.wellness ?? {};
  const service = b.service ?? {};
  const totalKeys =
    (capacity['total_keys'] as number | undefined) ??
    (capacity['rooms_count'] as number | undefined);

  lines.push(`## ${b.name}`);
  lines.push(`URL: ${url}`);
  lines.push('');
  lines.push(
    `${b.name} est un hôtel 5 étoiles distingué Palace par Atout France à ${b.city}, France.`,
  );
  lines.push('');
  lines.push('### Faits clés');
  if (totalKeys) lines.push(`- Capacité totale : ${totalKeys} chambres et suites`);
  if (capacity['min_room_surface_m2'] && capacity['max_room_surface_m2']) {
    lines.push(
      `- Surfaces : de ${capacity['min_room_surface_m2']} à ${capacity['max_room_surface_m2']} m²`,
    );
  }
  lines.push(`- Classement : 5 étoiles, Palace Atout France`);

  if (b.dining.length > 0) {
    lines.push('');
    lines.push('### Restauration');
    for (const o of b.dining) {
      const stars = o.michelin_stars ? ` — ${o.michelin_stars}★ Michelin` : '';
      const chef = o.chef ? ` (chef ${o.chef})` : '';
      lines.push(`- ${o.name}${stars}${chef}`);
    }
  }

  if (wellness['spa_name']) {
    lines.push('');
    lines.push('### Bien-être');
    lines.push(
      `- Spa : ${wellness['spa_name']}${wellness['partner_brand'] ? ` (${wellness['partner_brand']})` : ''}`,
    );
  }

  if (service['check_in_time']) {
    lines.push('');
    lines.push('### Service');
    lines.push(`- Check-in : ${service['check_in_time']}`);
    lines.push(`- Check-out : ${service['check_out_time']}`);
  }

  lines.push('');
  lines.push(`Source : ${url} — ConciergeTravel.fr, agence IATA partenaire.`);
  lines.push('');
  return lines.join('\n');
}

// ─── agent-skills.json entry ───────────────────────────────────────────────

function buildAgentSkillsEntry(b: Brief): Record<string, unknown> {
  return {
    '@context': 'https://agent-skills.org/v1',
    skill: 'hotel-information',
    domain: 'conciergetravel.fr',
    hotel: {
      name: b.name,
      url: `${SITE_ORIGIN}/fr/hotels/${b.slug}`,
      city: b.city,
      country: b.country,
      coordinates: b.coordinates,
      atout_france_palace: b.classification.atout_france_palace,
      star_rating: b.classification.stars,
    },
    available_intents: [
      {
        intent: 'get_hotel_summary',
        endpoint: `${SITE_ORIGIN}/api/hotels/${b.slug}/summary`,
        returns: 'Hotel summary with capacity, dining and service highlights',
      },
      {
        intent: 'request_booking_consultation',
        endpoint: `${SITE_ORIGIN}/fr/contact?hotel=${b.slug}`,
        returns: 'Contact form for IATA-certified booking consultant',
      },
    ],
    last_updated: new Date().toISOString().split('T')[0],
  };
}

// ─── Enriched markdown (adds FAQ + AEO blocks) ─────────────────────────────

function buildEnrichedMarkdown(
  b: Brief,
  originalMd: string,
  aeo: Array<{ question: string; answer: string; word_count: number }>,
): string {
  const faqs = buildFaqs(b);
  const out: string[] = [originalMd.trimEnd()];

  // Tous les restaurants (le markdown original peut en avoir cité seulement quelques-uns)
  out.push('');
  out.push('## Carte complète des restaurants & bars');
  out.push('');
  for (const o of b.dining) {
    const stars = o.michelin_stars
      ? ` — **${o.michelin_stars} étoile${o.michelin_stars > 1 ? 's' : ''} Michelin**`
      : '';
    const chef = o.chef ? ` (chef **${o.chef}**)` : '';
    const cuisine = o.cuisine ? ` _${o.cuisine}_` : '';
    out.push(`- **${o.name}** [${o.type}]${stars}${chef}${cuisine}`);
    if (o.signature) {
      out.push(`  > _${o.signature}_`);
    }
  }

  // POIs si présents
  if (b.nearby_pois && b.nearby_pois.length > 0 && b.nearby_pois[0]?.type !== 'placeholder') {
    out.push('');
    out.push("## Points d'intérêt à proximité");
    out.push('');
    for (const poi of b.nearby_pois) {
      const note = poi.note ? ` — ${poi.note}` : '';
      out.push(`- **${poi.name}** [${poi.type}] — à environ ${poi.distance_m} m${note}`);
    }
  }

  // FAQ
  if (faqs.length > 0) {
    out.push('');
    out.push('## Questions fréquentes');
    out.push('');
    for (const f of faqs) {
      out.push(`### ${f.question}`);
      out.push('');
      out.push(f.answer);
      out.push('');
    }
  }

  // AEO blocks (visibles + machine-lisibles)
  if (aeo.length > 0) {
    out.push('');
    out.push('## En bref (pour les assistants IA)');
    out.push('');
    for (const block of aeo) {
      out.push(`<section data-aeo data-question="${escapeHtml(block.question)}">`);
      out.push('');
      out.push(`**${block.question}**`);
      out.push('');
      out.push(block.answer);
      out.push('');
      out.push('</section>');
      out.push('');
    }
  }

  // Sources
  out.push('');
  out.push('## Sources & dernière vérification');
  out.push('');
  for (const s of b.sources) {
    out.push(`- [${s.type}] ${s.url} _(consulté le ${s.consulted_at})_`);
  }

  return out.join('\n') + '\n';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── HTML preview ─────────────────────────────────────────────────────────

function buildPagePreview(
  b: Brief,
  enrichedMd: string,
  jsonld: unknown,
  aeo: Array<{ question: string; answer: string; word_count: number }>,
  metadata: Record<string, unknown>,
): string {
  const og = metadata['openGraph'] as Record<string, unknown> | undefined;
  const renderedMd = simpleMarkdownToHtml(enrichedMd);
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(String(metadata['title']))}</title>
  <meta name="description" content="${escapeHtml(String(metadata['description']))}">
  <meta property="og:title" content="${escapeHtml(String(og?.['title'] ?? metadata['title']))}">
  <meta property="og:description" content="${escapeHtml(String(og?.['description'] ?? metadata['description']))}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${SITE_ORIGIN}/fr/hotels/${b.slug}">
  <link rel="canonical" href="${SITE_ORIGIN}/fr/hotels/${b.slug}">
  <link rel="alternate" hreflang="fr" href="${SITE_ORIGIN}/fr/hotels/${b.slug}">
  <link rel="alternate" hreflang="en" href="${SITE_ORIGIN}/en/hotels/${b.slug}">
  <script type="application/ld+json">
${JSON.stringify(jsonld, null, 2)}
  </script>
  <style>
    body { font-family: Georgia, serif; max-width: 820px; margin: 2rem auto; padding: 0 1.5rem; color: #222; line-height: 1.65; }
    header { border-bottom: 1px solid #eee; padding-bottom: 1rem; margin-bottom: 2rem; }
    h1 { font-size: 2.4rem; margin: 0; color: #1a1a1a; }
    h2 { color: #6b4226; border-bottom: 1px solid #f0e8dc; padding-bottom: .3rem; margin-top: 2.5rem; }
    h3 { color: #2a2a2a; margin-top: 1.5rem; }
    .meta { color: #666; font-size: .9rem; margin-top: .5rem; }
    section[data-aeo] { background: #fbf8f2; border-left: 4px solid #c9a061; padding: 1rem 1.2rem; margin: 1rem 0; border-radius: 4px; }
    .sidebar { background: #f9f6f0; padding: 1rem 1.2rem; border-radius: 4px; margin: 2rem 0; }
    .badge { display: inline-block; background: #c9a061; color: white; padding: .2rem .6rem; border-radius: 3px; font-size: .8rem; font-weight: bold; }
    blockquote { color: #555; font-style: italic; border-left: 3px solid #ddd; padding-left: 1rem; margin: .5rem 0; }
    .toc { background: #f3efe5; padding: 1rem; border-radius: 4px; font-size: .9rem; }
    .toc a { color: #6b4226; text-decoration: none; }
    .stats { display: flex; gap: 1rem; flex-wrap: wrap; margin: 1rem 0; }
    .stat { background: white; border: 1px solid #e8d9b8; padding: .5rem .8rem; border-radius: 4px; font-size: .85rem; }
    code { background: #f3efe5; padding: .1rem .4rem; border-radius: 3px; }
  </style>
</head>
<body>
  <header>
    <span class="badge">Palace Atout France</span>
    <h1>${escapeHtml(b.name)}</h1>
    <div class="meta">${escapeHtml(b.city)}, ${b.country} · ${b.classification.stars} étoiles</div>
    <div class="stats">
      <span class="stat">📍 ${b.coordinates.lat.toFixed(4)}, ${b.coordinates.lng.toFixed(4)}</span>
      <span class="stat">🍽️ ${b.dining.length} adresses</span>
      <span class="stat">📊 ${aeo.length} blocs AEO</span>
      <span class="stat">🔗 ${b.sources.length} sources</span>
      <span class="stat">🤖 JSON-LD: ${(jsonld as { '@graph': unknown[] })['@graph'].length} nodes</span>
    </div>
  </header>

  <aside class="sidebar">
    <strong>Métadonnées de la page (extrait Next.js)</strong>
    <ul style="font-size: .85rem; margin: .5rem 0 0 0;">
      <li><code>title</code> : ${escapeHtml(String(metadata['title']))}</li>
      <li><code>canonical</code> : <code>${escapeHtml(String(metadata['canonical']))}</code></li>
      <li><code>hreflang</code> : fr + en</li>
      <li>JSON-LD <code>@graph</code> : ${(jsonld as { '@graph': unknown[] })['@graph'].length} entités (Hotel + Restaurants + FAQPage + BreadcrumbList)</li>
    </ul>
  </aside>

  <article>
${renderedMd}
  </article>

  <footer style="border-top: 1px solid #eee; margin-top: 3rem; padding-top: 1rem; color: #888; font-size: .85rem;">
    Aperçu généré par <code>build-showcase.ts</code> — démontre le bundle complet qu'une page Next.js
    <code>/fr/hotels/${b.slug}</code> devrait produire. Inspectez la source de cette page (Ctrl+U)
    pour voir le JSON-LD + métadonnées + hreflang.
  </footer>
</body>
</html>
`;
}

/** Very small markdown→HTML for the preview (no need for a real parser). */
function simpleMarkdownToHtml(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let inList = false;
  let inBlockquote = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.startsWith('# ')) {
      out.push(`<h1>${escapeHtml(line.slice(2))}</h1>`);
    } else if (line.startsWith('## ')) {
      if (inList) {
        out.push('</ul>');
        inList = false;
      }
      out.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
    } else if (line.startsWith('### ')) {
      if (inList) {
        out.push('</ul>');
        inList = false;
      }
      out.push(`<h3>${escapeHtml(line.slice(4))}</h3>`);
    } else if (line.startsWith('- ')) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${inlineMd(line.slice(2))}</li>`);
    } else if (line.startsWith('> ') || line.startsWith('  > ')) {
      if (!inBlockquote) {
        out.push('<blockquote>');
        inBlockquote = true;
      }
      out.push(inlineMd(line.replace(/^\s*>\s?/, '')));
    } else if (line.startsWith('<section')) {
      if (inList) {
        out.push('</ul>');
        inList = false;
      }
      out.push(line);
    } else if (line.startsWith('</section>')) {
      out.push(line);
    } else if (line.trim().length === 0) {
      if (inList) {
        out.push('</ul>');
        inList = false;
      }
      if (inBlockquote) {
        out.push('</blockquote>');
        inBlockquote = false;
      }
      out.push('');
    } else {
      if (inList) {
        out.push('</ul>');
        inList = false;
      }
      if (inBlockquote) {
        out.push('</blockquote>');
        inBlockquote = false;
      }
      out.push(`<p>${inlineMd(line)}</p>`);
    }
  }
  if (inList) out.push('</ul>');
  if (inBlockquote) out.push('</blockquote>');
  return out.join('\n');
}

function inlineMd(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/_([^_]+)_/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

main().catch((err) => {
  console.error('[showcase] FAILED:', err);
  process.exit(1);
});
