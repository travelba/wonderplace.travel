import type { Metadata, Viewport } from 'next';
import '@/styles/globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env['NEXT_PUBLIC_SITE_URL'] ?? 'https://conciergetravel.fr'),
  title: {
    default: 'ConciergeTravel — Hôtels 5★ et Palaces en France',
    template: '%s · ConciergeTravel',
  },
  description:
    "Sélection éditoriale et réservation premium d'hôtels 5 étoiles et Palaces en France. Agence IATA, paiement sécurisé Amadeus, programme de fidélité dès la première nuit.",
  applicationName: 'ConciergeTravel',
  authors: [{ name: 'ConciergeTravel' }],
  formatDetection: { email: false, address: false, telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#fafaf8',
  colorScheme: 'light',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // The `[locale]` layout sets the actual <html lang="..">; this root layout
  // is only required by Next.js. We keep it minimal.
  return children;
}
