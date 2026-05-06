import type { BreadcrumbList } from 'schema-dts';

export interface BreadcrumbInput {
  readonly name: string;
  readonly url: string;
}

export const breadcrumbJsonLd = (items: ReadonlyArray<BreadcrumbInput>): BreadcrumbList => ({
  '@type': 'BreadcrumbList',
  itemListElement: items.map((item, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: item.name,
    item: item.url,
  })),
});
