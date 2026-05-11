import type { Metadata } from 'next';
import { RootLayout } from '@payloadcms/next/layouts';
import config from '@payload-config';
import { handleServerFunctions } from '@payloadcms/next/layouts';
import '@payloadcms/next/css';

import './globals.css';

import { payloadAdminImportMap } from './payload-import-map';

export const metadata: Metadata = {
  title: 'ConciergeTravel — Back-office',
  description: 'Administration ConciergeTravel.fr',
};

const adminConfigPromise = Promise.resolve(config);

export default function PayloadAdminLayout({ children }: { readonly children: React.ReactNode }) {
  const serverFunction = (fnArgs: {
    readonly name: string;
    readonly args: Record<string, unknown>;
  }) =>
    handleServerFunctions({
      ...fnArgs,
      config: adminConfigPromise,
      importMap: payloadAdminImportMap,
    });

  return (
    <RootLayout
      config={adminConfigPromise}
      importMap={payloadAdminImportMap}
      serverFunction={serverFunction}
    >
      {children}
    </RootLayout>
  );
}
