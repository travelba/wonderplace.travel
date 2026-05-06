import type { Metadata } from 'next';
import { generatePageMetadata, RootPage } from '@payloadcms/next/views';
import config from '@payload-config';

type Args = {
  params: Promise<{ segments?: string[] }>;
  searchParams: Promise<Record<string, string | string[]>>;
};

export const generateMetadata = async ({ params, searchParams }: Args): Promise<Metadata> =>
  generatePageMetadata({ config, params, searchParams });

const Page = async ({ params, searchParams }: Args) =>
  RootPage({ config, params, searchParams });

export default Page;
