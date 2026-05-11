---
name: technical-documentation
description: Documentation standards for ConciergeTravel.fr (README, architecture, integrations, deployment, ADRs, runbooks, checklists). Use whenever you create or update any document under `docs/` or top-level READMEs.
---

# Technical documentation — ConciergeTravel.fr

The cahier des charges (CDC v3.0 §15) requires a complete documentation package: main README, architecture doc, env variables list, integrations docs, deployment plan, back-office runbook, SEO/GEO checklist, QA pre-launch checklist.

## Triggers

Invoke when:
- Adding a new README, doc, or runbook.
- Editing existing documentation.
- Closing a phase: docs must be up to date before moving forward.

## Documentation tree

```
docs/
├── 00-conception-et-phasage.md  # CDC phasing map, doc ↔ phase, MVP vs post-MVP, ADR index
├── 01-architecture.md           # Layers, monorepo, rendering matrix, dependencies
├── 02-data-model.md             # Tables, RLS, JSONB shapes, ERD
├── 03-integrations/
│   ├── amadeus.md
│   ├── little-hotelier.md
│   ├── makcorps-apify.md
│   ├── google-places.md
│   ├── brevo.md
│   ├── algolia.md
│   ├── upstash-redis.md
│   └── sentry.md
├── 04-seo-geo-aeo.md            # Topic clusters, anti-canniba matrix, JSON-LD per page, llms.txt strategy
├── 05-booking-flow.md           # State machine, cancellation policy, payment, idempotency
├── 06-loyalty.md                # Tiers, benefits, eligibility rules, MVP simplifications
├── 07-deployment.md             # Environments, Vercel, Supabase, secrets, rollback
├── 08-backoffice-operations.md  # Daily ops, hotel onboarding, content publishing, reporting
├── 09-checklists/
│   ├── seo.md
│   ├── launch-qa.md
│   └── security.md
├── 10-environment-variables.md  # Every env var with description + scope
└── adr/                         # Architecture Decision Records
    ├── 0001-stack.md
    ├── 0002-monorepo-turborepo.md
    ├── 0003-payload-cms.md
    ├── 0004-algolia.md
    └── ...
```

## Non-negotiable rules

### Format
- Markdown with YAML frontmatter where useful. ASCII diagrams or Mermaid (no images that drift from code).
- Headings hierarchy strict; tables of contents auto-rendered for long docs.
- Code blocks fenced with language tags.
- Cross-link with relative paths (`../03-integrations/amadeus.md`).

### Completeness
- Every external dependency has a doc.
- Every env variable in `docs/10-environment-variables.md` matches `.env.example`.
- Every architectural decision lives in `docs/adr/` with status (`accepted`, `superseded`, `deprecated`).

### Tone
- Senior CTO can read the docs without prior context.
- No marketing tone; precise, factual.
- Every assertion that could surprise (e.g. PCI scope-out, comparator no-affiliate) explains *why* in 2 lines.

### ADR template
```md
# ADR NNNN — Title
- Status: accepted
- Date: YYYY-MM-DD
- Decision: ...
- Context: ...
- Alternatives considered: ...
- Consequences: ...
- Reviewed by: ...
```

### Runbook template (per integration)
```md
# Integration — <Vendor>
- Owner package: packages/integrations/<vendor>
- Endpoints used: ...
- Auth: ...
- Rate limits: ...
- Error mapping: ...
- Caching: ...
- Failure modes & playbook: ...
```

### Checklists
- SEO checklist mirrors CDC §12.1.
- Launch QA mirrors CDC §12.2.
- Security checklist mirrors §11.

## Anti-patterns to refuse

- Documentation that drifts from code without an ADR explaining the change.
- "TODO" sections without owners + dates.
- Screenshots that go stale (prefer text or Mermaid).
- Marketing copy in technical docs.
- Leaving simplifications unflagged — every MVP simplification must be in a numbered ADR.

## References

- CDC v3.0 §15.
- All other skills (each may add a section to its corresponding integration / module doc).
