# Checklist SEO — ConciergeTravel.fr

Mirror du CDC v3.0 §12.1 + complément Excel "Plan d'action".

## Avant publication d'une page

- [ ] `<title>` unique 50–60 chars
- [ ] `<meta description>` unique 140–160 chars
- [ ] `<link rel="canonical">` correct (et non un alias de redirection)
- [ ] Hreflang FR / EN / x-default cohérents
- [ ] Open Graph + Twitter Cards
- [ ] H1 unique, hiérarchie sans saut
- [ ] Breadcrumbs HTML + JSON-LD
- [ ] AEO block 40–60 mots
- [ ] 5 Q/A FAQ minimum (classement / sélection / comparatif / guide / fiche hôtel)
- [ ] `dateModified` synchronisé (badge + sitemap + JSON-LD `Article`)
- [ ] Liens internes bidirectionnels (hub ↔ fiche, sélection ↔ fiche)
- [ ] JSON-LD validé (Hotel / ItemList / FAQPage / Article / BreadcrumbList / TravelAgency selon type)
- [ ] Pas de cannibalisation (matrice 301 vérifiée)
- [ ] Image ≥ 1200×630 OG dynamique
- [ ] `noindex` si tunnel / compte ; `index, follow` sinon

## Avant lancement

- [ ] `robots.txt` autorise GPTBot, PerplexityBot, ClaudeBot, Applebot-Extended
- [ ] `sitemap.xml` index pointant vers sous-sitemaps avec `<lastmod>`
- [ ] `llms.txt` < 50 KB, `llms-full.txt` < 500 KB
- [ ] `agent-skills.json` accessible via `/.well-known/`
- [ ] Link header `agent-skills` set
- [ ] `lastmod` sur toutes les URLs sitemap
- [ ] Lighthouse mobile > 90 sur 5 pages stratégiques (home, hub, fiche, classement, tunnel)
- [ ] LCP < 2.0s, CLS < 0.05, INP < 200ms (mobile 4G)
- [ ] Submitted Search Console + Bing Webmaster
