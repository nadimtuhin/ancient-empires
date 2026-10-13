/**
 * The original art is drawn in blue. Other looks come from rewriting every
 * "blue-dominant" colour, exactly like the J2ME game patched its PNG palettes.
 *
 *   red:  (r, g, b) -> (b, g / 2, r)   e.g. (40, 80, 200) -> (200, 40, 40)
 *   grey: (r, g, b) -> (b, b, b)       used for units that already acted
 */
export type Tint = 'blue' | 'red' | 'grey';

export function tintColor(r: number, g: number, b: number, tint: Tint): [number, number, number] {
  const isBlueDominant = b > r && b > g;
  if (!isBlueDominant || tint === 'blue') return [r, g, b];
  if (tint === 'red') return [b, g >> 1, r];
  return [b, b, b];
}

/** Recolours RGBA pixel data in place. */
export function tintPixels(pixels: Uint8ClampedArray, tint: Tint): void {
  if (tint === 'blue') return;
  for (let i = 0; i < pixels.length; i += 4) {
    const [r, g, b] = tintColor(pixels[i], pixels[i + 1], pixels[i + 2], tint);
    pixels[i] = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
  }
}
