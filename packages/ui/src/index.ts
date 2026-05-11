/**
 * @cct/ui — design system primitives.
 * Token-driven so the entire visual identity is restylable by overriding
 * `tokens.css` (cf. responsive-ui-architecture skill).
 */
export * from './lib/cn';
export { Button, type ButtonProps } from './components/button';
export {
  HotelImage,
  buildCloudinarySrc,
  type HotelImageProps,
  type HotelImageVariant,
} from './components/hotel-image';
