# Checklist sécurité — ConciergeTravel.fr

Mirror du CDC v3.0 §11. Skill : `security-engineering`.

## Identité et accès

- [ ] RLS active sur toutes les tables business (`alter table … enable row level security;`)
- [ ] Aucune policy `using (true)` pour rôle exposé au client
- [ ] Service role key Supabase jamais importée côté client
- [ ] 2FA TOTP activé pour admin / operator
- [ ] Sessions Payload `SameSite=Strict` + 8h
- [ ] Sessions Supabase `SameSite=Lax` + refresh sliding 24h

## PCI / paiement

- [ ] Aucune donnée carte (PAN/CVV/expiry) ne transite ni n'est stockée
- [ ] Iframe Amadeus uniquement source du formulaire
- [ ] Apple Pay / Google Pay configurés via SDK Amadeus
- [ ] Webhook paiement HMAC validé + nonce replay 10 min

## Headers

- [ ] HSTS preload
- [ ] CSP nonce-based (script-src 'self' 'nonce-...')
- [ ] X-Frame-Options DENY (sauf route paiement avec frame-src Amadeus)
- [ ] Permissions-Policy minimal

## Validation et logs

- [ ] Toutes les server actions validées par Zod
- [ ] Logs pino redactent `*.email`, `*.phone`, `*.password`, `authorization`, `cookie`
- [ ] Sentry `beforeSend` strip des PII

## Dépendances

- [ ] `pnpm audit` clean ou exceptions documentées
- [ ] Dependabot weekly groups configuré

## RGPD

- [ ] Cookies essentiels uniquement avant consentement
- [ ] Droit à l'oubli : action serveur dédiée
- [ ] Suppression liste Brevo synchronisée
