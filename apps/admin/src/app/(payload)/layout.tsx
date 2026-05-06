import type { Metadata } from 'next';
import { RootLayout } from '@payloadcms/next/layouts';
import config from '@payload-config';
import '@payloadcms/next/css';

import './globals.css';

export const metadata: Metadata = {
  title: 'ConciergeTravel — Back-office',
  description: 'Administration ConciergeTravel.fr',
};

export default function PayloadAdminLayout({ children }: { children: React.ReactNode }) {
  return <RootLayout config={config}>{children}</RootLayout>;
}
