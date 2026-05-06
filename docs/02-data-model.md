# Modèle de données — ConciergeTravel.fr

Ce document est rempli en Phase 2 avec :

- ERD complet (hotels, hotel_rooms, bookings, editorial_pages, loyalty_members, booking_requests_email, price_comparisons, authors, profiles, redirects, audit_logs)
- Politiques RLS par rôle (anon, customer, editor, seo, operator, admin, service_role)
- Contraintes, indexes (incluant index partiels et GIN sur JSONB)
- Triggers (`set_updated_at`)
- Schémas JSONB documentés (`bookings.cancellation_policy`, `hotels.faq_content`, `hotels.amenities`, `hotels.loyalty_benefits_meta`)
- Schéma migrations Supabase + procédure de rollback

> Référence vivante : skill `supabase-postgres-rls`, CDC v3.0 §4, addendum v3.2 §B.1.
