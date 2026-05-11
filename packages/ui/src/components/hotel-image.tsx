/**
 * HotelImage — `next/image` wrapper specialised for ConciergeTravel hotel media.
 *
 * Skill: performance-engineering, responsive-ui-architecture.
 *
 * - Accepts either a Cloudinary `publicId` (preferred — eligible to
 *   `f_auto,q_auto,c_fill,g_auto` transformations) or a raw `src` (used as
 *   a fallback for legacy media).
 * - Defaults are tuned for hotel hero and card placements:
 *     - `sizes` is responsive-aware (`(max-width: 768px) 100vw, 50vw`).
 *     - LCP candidates pass `priority` to opt in to high-fetch-priority.
 *     - All other instances are `loading="lazy"` and `decoding="async"`.
 * - The `cloudName` is **passed in by the consumer**, not read from `env`,
 *   so `@cct/ui` stays env-free and the build doesn't need Cloudinary
 *   credentials to render Storybook / tests.
 *
 * Usage:
 *   ```tsx
 *   <HotelImage
 *     cloudName="conciergetravel"
 *     publicId="hotels/ritz-paris/hero"
 *     alt="Façade de l'hôtel Ritz Paris"
 *     width={1600}
 *     height={900}
 *     priority
 *   />
 *   ```
 */
import NextImage, { type ImageProps as NextImageProps } from 'next/image';
import * as React from 'react';

import { cn } from '../lib/cn';

const CLOUDINARY_BASE = 'https://res.cloudinary.com';
const DEFAULT_TRANSFORMS = 'f_auto,q_auto,c_fill,g_auto';

export type HotelImageVariant = 'hero' | 'card' | 'thumbnail';

interface HotelImageBaseProps {
  readonly alt: string;
  readonly width: number;
  readonly height: number;
  readonly variant?: HotelImageVariant;
  readonly priority?: boolean;
  readonly className?: string;
  readonly sizes?: string;
  readonly transforms?: string;
}

interface HotelImagePublicIdProps extends HotelImageBaseProps {
  readonly cloudName: string;
  readonly publicId: string;
  readonly src?: never;
}

interface HotelImageRawSrcProps extends HotelImageBaseProps {
  readonly src: string;
  readonly cloudName?: never;
  readonly publicId?: never;
}

export type HotelImageProps = HotelImagePublicIdProps | HotelImageRawSrcProps;

const DEFAULT_SIZES: Record<HotelImageVariant, string> = {
  hero: '(max-width: 768px) 100vw, 75vw',
  card: '(max-width: 768px) 100vw, 33vw',
  thumbnail: '96px',
};

/**
 * Build the Cloudinary delivery URL. Exposed for unit testing.
 *
 * @example
 *   buildCloudinarySrc({
 *     cloudName: 'conciergetravel',
 *     publicId: 'hotels/ritz-paris/hero',
 *   })
 *   // → https://res.cloudinary.com/conciergetravel/image/upload/f_auto,q_auto,c_fill,g_auto/hotels/ritz-paris/hero
 */
export function buildCloudinarySrc(input: {
  readonly cloudName: string;
  readonly publicId: string;
  readonly transforms?: string;
}): string {
  const transforms = input.transforms ?? DEFAULT_TRANSFORMS;
  const cloudName = encodeURIComponent(input.cloudName);
  // The public ID may contain slashes (e.g. `hotels/ritz-paris/hero`) —
  // these are path segments in the Cloudinary URL and must be preserved.
  const publicIdSafe = input.publicId.split('/').map(encodeURIComponent).join('/');
  return `${CLOUDINARY_BASE}/${cloudName}/image/upload/${transforms}/${publicIdSafe}`;
}

export const HotelImage = React.forwardRef<HTMLImageElement, HotelImageProps>(
  (props, ref): React.ReactElement => {
    const {
      alt,
      width,
      height,
      variant = 'card',
      priority = false,
      className,
      sizes,
      transforms,
    } = props;

    const src =
      'src' in props && props.src !== undefined
        ? props.src
        : buildCloudinarySrc({
            cloudName: props.cloudName,
            publicId: props.publicId,
            ...(transforms !== undefined ? { transforms } : {}),
          });

    const finalSizes = sizes ?? DEFAULT_SIZES[variant];

    // Cast through `unknown` is forbidden by lint rules, so we relax the
    // prop spread by listing the exact props we care about. `next/image`
    // accepts both `src: string` and `priority: boolean` directly.
    const nextProps: NextImageProps = {
      src,
      alt,
      width,
      height,
      priority,
      sizes: finalSizes,
      loading: priority ? 'eager' : 'lazy',
      decoding: 'async',
      className: cn('object-cover', className),
    };

    return <NextImage ref={ref} {...nextProps} />;
  },
);

HotelImage.displayName = 'HotelImage';
