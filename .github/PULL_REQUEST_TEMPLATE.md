<!--
Merci de bien vouloir compléter ce template avant la revue.
-->

## Contexte

<!-- Quel besoin produit / technique cette PR adresse-t-elle ? Lien vers la phase du plan ou l'ADR concerné. -->

- Phase :
- ADR(s) :
- Lien CDC : v3.0 §

## Changements

<!-- Liste concise des modifications. Mentionnez les fichiers / packages touchés. -->

- [ ] `apps/web` : …
- [ ] `apps/admin` : …
- [ ] `packages/...` : …
- [ ] migrations `packages/db/migrations/...` : …
- [ ] documentation (`docs/...`, ADR) : …

## Validation

- [ ] `pnpm lint` pass
- [ ] `pnpm typecheck` pass
- [ ] `pnpm test` pass
- [ ] e2e Playwright (si flow utilisateur impacté)
- [ ] Lighthouse CI (si page front impactée)
- [ ] vérification manuelle sur preview Vercel

## SEO / GEO / sécurité

- [ ] Aucune régression `index/follow` sur les pages éditoriales
- [ ] hreflang + canonical inchangés ou corrigés explicitement
- [ ] aucune donnée carte ne transite/n'est stockée
- [ ] aucun secret commité

## Simplifications / dette

<!-- Toute simplification volontaire est documentée par un ADR ou une note dans `docs/`. -->
