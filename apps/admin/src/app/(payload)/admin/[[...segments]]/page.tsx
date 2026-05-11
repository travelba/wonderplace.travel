import type { Metadata } from 'next';
import { generatePageMetadata, RootPage } from '@payloadcms/next/views';
import config from '@payload-config';

import { payloadAdminImportMap } from '../../payload-import-map';

type Args = {
  params: Promise<{ segments?: string[] }>;
  searchParams: Promise<Record<string, string | string[]>>;
};

async function normalizedParams(paramsPromise: Args['params']) {
  const p = await paramsPromise;
  return Promise.resolve({
    segments: p.segments ?? [],
  });
}

export const generateMetadata = async ({ params, searchParams }: Args): Promise<Metadata> =>
  generatePageMetadata({
    config: Promise.resolve(config),
    params: normalizedParams(params),
    searchParams,
  });

const Page = async ({ params, searchParams }: Args) =>
  RootPage({
    config: Promise.resolve(config),
    importMap: payloadAdminImportMap,
    params: normalizedParams(params),
    searchParams,
  });

export default Page;
