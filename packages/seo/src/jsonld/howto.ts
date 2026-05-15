import type { HowTo } from 'schema-dts';

/**
 * HowTo JSON-LD builders (skill: structured-data-schema-org §HowTo).
 *
 * Schema.org's `HowTo` is one of the most consumable signals for
 * AI Overviews + Perplexity + SearchGPT — voice assistants explicitly
 * pick up `step[].name` + `step[].text` to give procedural answers
 * ("Comment réserver une chambre à <hotel> ?", "Comment annuler ma
 * réservation ?").
 *
 * Two pre-built recipes for the booking-engine context:
 *
 *   - `bookingHowToJsonLd`   — "Comment réserver à <hotel>"
 *   - `cancellationHowToJsonLd` — "Comment annuler ma réservation"
 *
 * Both accept the hotel name + canonical URL so they round-trip into
 * the fiche graph without leaking templated copy. Step counts are
 * capped at 6 because Google's `HowTo` rich-result documentation
 * recommends 3-6 steps for procedural answers.
 *
 * Each builder is locale-aware: pass `'fr'` or `'en'` so the
 * editorial copy matches the page locale and Google's
 * `inLanguage` field validates.
 */

type HowToNode = Exclude<HowTo, string> & {
  inLanguage?: string;
  totalTime?: string;
  estimatedCost?: { '@type': 'MonetaryAmount'; currency: string; value: string };
};

type HowToStepNode = {
  '@type': 'HowToStep';
  position: number;
  name: string;
  text: string;
  url?: string;
};

const T = {
  fr: {
    bookName: (hotel: string) => `Comment réserver une chambre à ${hotel}`,
    bookDescription: (hotel: string) =>
      `Réservation pas à pas d'une chambre à ${hotel} via la conciergerie ConciergeTravel — tarifs négociés IATA, accompagnement humain.`,
    bookSteps: (hotel: string): readonly { name: string; text: string }[] => [
      {
        name: 'Choisir les dates',
        text: "Saisissez vos dates d'arrivée et de départ, ainsi que le nombre de voyageurs (adultes + enfants) dans le formulaire de réservation.",
      },
      {
        name: `Consulter les chambres disponibles à ${hotel}`,
        text: "Notre moteur interroge en direct le système de réservation de l'hôtel et affiche les chambres disponibles avec leurs tarifs nets.",
      },
      {
        name: 'Sélectionner une chambre + un tarif',
        text: 'Comparez les catégories de chambres, les politiques d\'annulation et le prix total TTC. Cliquez sur "Réserver" pour bloquer l\'offre pendant 15 minutes.',
      },
      {
        name: 'Renseigner les coordonnées',
        text: "Indiquez les noms des voyageurs, l'e-mail de contact et le téléphone. Toutes les communications resteront via notre conciergerie agréée IATA.",
      },
      {
        name: 'Payer la réservation',
        text: "Le paiement est sécurisé par Amadeus Payments (PCI-DSS Niveau 1). 3DS2 + Apple Pay / Google Pay supportés. Aucun numéro de carte n'est stocké sur nos serveurs.",
      },
      {
        name: 'Recevoir la confirmation',
        text: `Vous recevez immédiatement votre numéro de réservation (PNR) par e-mail, suivi du voucher officiel à présenter à l'arrivée. Notre conciergerie reste joignable 7j/7 pour toute modification.`,
      },
    ],
    cancelName: (hotel: string) => `Comment annuler ma réservation à ${hotel}`,
    cancelDescription: (hotel: string) =>
      `Procédure pour annuler ou modifier une réservation à ${hotel} effectuée via ConciergeTravel.`,
    cancelSteps: (): readonly { name: string; text: string }[] => [
      {
        name: "Vérifier la politique d'annulation",
        text: "Consultez votre voucher de réservation : la date limite d'annulation gratuite et le montant des pénalités y figurent. Chaque tarif a sa propre politique.",
      },
      {
        name: 'Contacter la conciergerie ConciergeTravel',
        text: 'Envoyez un e-mail à reservations@conciergetravel.fr en précisant votre numéro de réservation (PNR) et le motif. Réponse sous 4 h ouvrées.',
      },
      {
        name: "Recevoir la confirmation d'annulation",
        text: "Notre conciergerie déclenche l'annulation auprès de l'hôtel et vous transmet la confirmation écrite. Le remboursement (intégral ou partiel selon la politique) est initié sous 5 jours ouvrés.",
      },
    ],
    contactName: (hotel: string) => `Comment contacter ${hotel} et notre conciergerie`,
    contactDescription: (hotel: string) =>
      `Différents canaux pour contacter ${hotel} ou notre conciergerie agréée IATA avant, pendant ou après votre séjour.`,
  },
  en: {
    bookName: (hotel: string) => `How to book a room at ${hotel}`,
    bookDescription: (hotel: string) =>
      `Step-by-step booking of a room at ${hotel} via the ConciergeTravel concierge desk — IATA-negotiated rates, human assistance.`,
    bookSteps: (hotel: string): readonly { name: string; text: string }[] => [
      {
        name: 'Choose your dates',
        text: 'Enter your arrival and departure dates along with the number of travellers (adults + children) in the booking form.',
      },
      {
        name: `Browse available rooms at ${hotel}`,
        text: "Our engine queries the hotel's reservation system in real time and displays available rooms with their net rates.",
      },
      {
        name: 'Select a room + a rate',
        text: 'Compare room categories, cancellation policies and the total price including tax. Click "Book" to lock the offer for 15 minutes.',
      },
      {
        name: 'Provide traveller details',
        text: 'Enter the names of the travellers, a contact e-mail and a phone number. All communications stay within our IATA-accredited concierge channel.',
      },
      {
        name: 'Pay for the booking',
        text: 'Payment is secured by Amadeus Payments (PCI-DSS Level 1). 3DS2 + Apple Pay / Google Pay supported. No card number is stored on our servers.',
      },
      {
        name: 'Receive your confirmation',
        text: `You immediately receive your booking reference (PNR) by e-mail, followed by the official voucher to present at check-in. Our concierge desk is reachable 7 days a week for any change.`,
      },
    ],
    cancelName: (hotel: string) => `How to cancel my reservation at ${hotel}`,
    cancelDescription: (hotel: string) =>
      `Procedure to cancel or modify a reservation at ${hotel} made via ConciergeTravel.`,
    cancelSteps: (): readonly { name: string; text: string }[] => [
      {
        name: 'Check the cancellation policy',
        text: 'Review your booking voucher: the free-cancellation deadline and any penalty amounts are listed there. Each rate has its own policy.',
      },
      {
        name: 'Contact the ConciergeTravel concierge desk',
        text: 'E-mail reservations@conciergetravel.fr with your booking reference (PNR) and the reason. Reply within 4 business hours.',
      },
      {
        name: 'Receive the cancellation confirmation',
        text: 'Our desk triggers the cancellation with the hotel and forwards you the written confirmation. The refund (full or partial per the policy) is initiated within 5 business days.',
      },
    ],
    contactName: (hotel: string) => `How to contact ${hotel} and our concierge desk`,
    contactDescription: (hotel: string) =>
      `Various channels to contact ${hotel} or our IATA-accredited concierge desk before, during, or after your stay.`,
  },
} as const;

export interface BookingHowToInput {
  readonly hotelName: string;
  readonly hotelUrl: string;
  readonly locale: 'fr' | 'en';
}

/**
 * Builds the "How to book a room at X" HowTo node.
 *
 * The total time and estimated cost are deliberately omitted: total
 * time depends on the user and editorial copy that says "5 minutes"
 * would conflict with the variable-length payment iframe. Estimated
 * cost is the room nightly rate which we never know at JSON-LD
 * emission time (the price-comparator on the fiche carries it).
 */
export const bookingHowToJsonLd = (input: BookingHowToInput): HowToNode => {
  const t = T[input.locale];
  const steps = t.bookSteps(input.hotelName);
  const stepNodes: HowToStepNode[] = steps.map((s, i) => ({
    '@type': 'HowToStep',
    position: i + 1,
    name: s.name,
    text: s.text,
    url: `${input.hotelUrl}#booking`,
  }));
  return {
    '@type': 'HowTo',
    name: t.bookName(input.hotelName),
    description: t.bookDescription(input.hotelName),
    inLanguage: input.locale === 'fr' ? 'fr-FR' : 'en-GB',
    step: stepNodes,
  };
};

export interface CancellationHowToInput {
  readonly hotelName: string;
  readonly hotelUrl: string;
  readonly locale: 'fr' | 'en';
}

/**
 * Builds the "How to cancel a reservation at X" HowTo node.
 *
 * Short procedural answer — 3 steps — matches the actual flow:
 *
 *   1. Check the policy on the voucher
 *   2. Contact the concierge desk
 *   3. Receive the confirmation + refund
 *
 * Used for AI assistants answering "Comment annuler ma réservation
 * à <hotel> ?" and similar voice queries.
 */
export const cancellationHowToJsonLd = (input: CancellationHowToInput): HowToNode => {
  const t = T[input.locale];
  const steps = t.cancelSteps();
  const stepNodes: HowToStepNode[] = steps.map((s, i) => ({
    '@type': 'HowToStep',
    position: i + 1,
    name: s.name,
    text: s.text,
  }));
  return {
    '@type': 'HowTo',
    name: t.cancelName(input.hotelName),
    description: t.cancelDescription(input.hotelName),
    inLanguage: input.locale === 'fr' ? 'fr-FR' : 'en-GB',
    step: stepNodes,
  };
};
