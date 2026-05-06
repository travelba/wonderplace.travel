---
name: geo-llm-optimization
description: GEO / AEO optimization for ConciergeTravel.fr (llms.txt, llms-full.txt, AEO blocks, agent-skills.json, Link Header WebMCP, FAQ extraction, freshness signals). Use for any work touching LLM ingestion, AI Overviews, or LLM-actionable surfaces.
---

# GEO / LLM optimization — ConciergeTravel.fr

Beyond Google SEO, the site must rank inside **AI Overviews, ChatGPT, Perplexity, Claude** answers (CDC §6.5 + Excel sheet "GEO & Agentique"). The architecture exposes machine-readable surfaces designed for extraction.

## Triggers

Invoke when:
- Editing `llms.txt`, `llms-full.txt`, AEO blocks, or `agent-skills.json`.
- Adding new structured FAQ content.
- Setting `Link` HTTP headers (RFC 8288).
- Adjusting freshness signals or "last updated" UI.

## Surfaces produced

| Surface | Path | Format | Generated from |
|---|---|---|---|
| Quick LLM guide | `/llms.txt` | Markdown < 50 KB | Static + curated key pages |
| Full LLM sitemap | `/llms-full.txt` | Markdown < 500 KB | Payload published pages |
| Agent skills | `/.well-known/agent-skills.json` | JSON | Static manifest (search/filter/booking) |
| Link header | All pages | RFC 8288 | Middleware annotation |
| AEO blocks | Top of editorial pages + hotel detail | HTML | `<AeoBlock>` component, content from Payload |
| FAQ | Editorial + hotel pages | HTML + JSON-LD | Payload `faq_content` JSONB |
| Sitemap with `<lastmod>` | `/sitemap.xml` | XML | Payload + DB |

## Non-negotiable rules

### `llms.txt` (root)
- Title `# ConciergeTravel.fr — Agence IATA Hôtels 5★ & Palaces France`.
- One-line description.
- "## Pages stratégiques" with 5–10 curated links + 40–60 word descriptions each.
- "## À propos" with IATA / ASPST credentials, value proposition, freshness.
- Keep < 50 KB. Validate weekly.

### `llms-full.txt`
- Sectioned by hub: Pilier, Hubs régionaux, Hubs villes, Fiches hôtels, Sélections, Guides, Programme fidélité, Méthodologie.
- Each entry: `- [Title](URL) — 1–3 lines factual description`.
- Generated server-side from Payload published list at request time, cached 1h.

### AEO block (40–60 words) — CDC §6.5
- Component `<AeoBlock>` placed at the top of every editorial page and hotel detail.
- Content authored in Payload field `aeo_block_fr` / `aeo_block_en`. Lint validates 40–60 words.
- Format: direct answer to the page's primary question, names entities, includes the freshness phrase ("mise à jour [mois année]").

### FAQ extraction
- Authored in Payload `faq_content` JSONB (5 Q&A min on classements/sélections/comparatifs/guides; 5 Q&A on hotel detail).
- Rendered both as HTML and JSON-LD `FAQPage`.

### Freshness
- Visible "Dernière mise à jour: [date]" badge near H1 on every editorial page (component `<LastUpdatedBadge />`).
- `<lastmod>` synchronized in sitemap.
- `Article` JSON-LD `dateModified` matches.

### `agent-skills.json` (CDC §8 cursor brief, Excel GEO sheet)
- Static JSON describing actionable skills:
  ```json
  {
    "skills": [
      { "name": "search", "description": "Rechercher hôtels par destination et dates" },
      { "name": "filter", "description": "Filtrer par type, région, équipements, étoiles" },
      { "name": "booking", "description": "Lancer une réservation avec dates et voyageurs" },
      { "name": "loyalty", "description": "Consulter les avantages du programme fidélité" }
    ]
  }
  ```
- Linked via `Link: </.well-known/agent-skills.json>; rel="agent-skills"` HTTP header set by middleware.

### Robots authorization (cf. `seo-technical`)
- Explicitly authorize `GPTBot`, `PerplexityBot`, `ClaudeBot`, `Googlebot-Extended`. Never block them.

### E-E-A-T signals
- Author byline + bio on every editorial page (Payload `authors`).
- Methodology page describing selection criteria.
- Proprietary data: where applicable, badge "Sélection ConciergeTravel" + internal scoring.

### TravelAgency JSON-LD on home + `/agence/`
- Includes `hasCredential: ["IATA", "ASPST"]`.

## Anti-patterns to refuse

- Bloating `llms.txt` with raw HTML or markdown beyond curated entries.
- AEO block in 200 words (too long for extraction).
- Hidden FAQ behind tabs without rendering text in DOM (LLMs can't extract collapsed-only content if JS-driven). Use `<details>` open by default for the first Q.
- Freshness lying ("updated yesterday" while the page hasn't changed).
- Different content visible to bots vs users (cloaking — forbidden).

## References

- CDC v3.0 §6.5, §8 (cursor brief).
- Excel arborescence — sheets "GEO & Agentique" and "Schema JSON-LD".
- `seo-technical`, `structured-data-schema-org`, `content-modeling` skills.
