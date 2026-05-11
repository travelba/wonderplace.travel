import type { BreadcrumbList } from 'schema-dts';

export type BreadcrumbListNode = Exclude<BreadcrumbList, string>;

export interface BreadcrumbInput {
  readonly name: string;
  readonly url: string;
}

export const breadcrumbJsonLd = (items: ReadonlyArray<BreadcrumbInput>): BreadcrumbListNode => ({
  '@type': 'BreadcrumbList',
  itemListElement: items.map((item, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: item.name,
    item: item.url,
  })),
});
