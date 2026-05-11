import { HotelImage } from '@cct/ui';
import { getTranslations } from 'next-intl/server';

import type { LocalisedGalleryImage } from '@/server/hotels/get-hotel-by-slug';

interface HotelGalleryProps {
  readonly locale: 'fr' | 'en';
  readonly cloudName: string;
  readonly hero: { readonly publicId: string; readonly alt: string } | null;
  readonly images: readonly LocalisedGalleryImage[];
}

/**
 * Media gallery for the hotel detail page — CDC §2 bloc 2.
 *
 * Layout:
 *   - Hero image (LCP candidate, `priority`, variant=`hero`).
 *   - Up to 6 secondary thumbnails in a responsive grid below the hero.
 *
 * The grid is intentionally a simple, no-JS layout for now (CDC §2 only
 * requires "carousel/grid"; a fully-fledged lightbox/swipeable carousel
 * will come in Phase 11 once we measure CLS/INP on real palaces).
 *
 * If `images` exceeds `MAX_THUMBNAILS`, surplus images are dropped from
 * the grid but still counted in the visible "+N" indicator, so the editor
 * can stage 12+ photos without breaking the page.
 *
 * Pure RSC — `<HotelImage>` is a forwardRef-based wrapper around
 * `next/image` but consumed read-only.
 */
const MAX_THUMBNAILS = 6;

export async function HotelGallery({
  locale,
  cloudName,
  hero,
  images,
}: HotelGalleryProps): Promise<React.ReactElement | null> {
  if (hero === null && images.length === 0) return null;

  const t = await getTranslations({ locale, namespace: 'hotelPage' });

  const thumbnails = images.slice(0, MAX_THUMBNAILS);
  const overflow = Math.max(0, images.length - MAX_THUMBNAILS);

  return (
    <section aria-labelledby="gallery-title" className="mb-10">
      <h2 id="gallery-title" className="sr-only">
        {t('sections.gallery')}
      </h2>

      {hero !== null ? (
        <figure className="relative aspect-[16/9] overflow-hidden rounded-lg">
          <HotelImage
            cloudName={cloudName}
            publicId={hero.publicId}
            alt={hero.alt}
            width={1600}
            height={900}
            variant="hero"
            priority
            className="h-full w-full"
          />
        </figure>
      ) : null}

      {thumbnails.length > 0 ? (
        <ul
          aria-label={t('gallery.thumbnailsLabel')}
          className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6"
        >
          {thumbnails.map((img, idx) => (
            <li key={img.publicId} className="relative aspect-square overflow-hidden rounded-md">
              <HotelImage
                cloudName={cloudName}
                publicId={img.publicId}
                alt={img.alt}
                width={400}
                height={400}
                variant="thumbnail"
                className="h-full w-full"
              />
              {idx === MAX_THUMBNAILS - 1 && overflow > 0 ? (
                <span
                  aria-hidden
                  className="absolute inset-0 flex items-center justify-center bg-black/55 text-base font-medium text-white"
                >
                  +{overflow}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
