/** V9938 programmable palette: 16 slots, each storing 3-bit RGB. */
export const V9938_COLOR_COUNT = 512;
export const V9938_PALETTE_SLOTS = 16;

export interface Rgb3 {
  r: number;
  g: number;
  b: number;
}

/** Default V9938 palette from the Yamaha V9938 technical data book. */
export const V9938_DEFAULT_PALETTE: Rgb3[] = [
  { r: 0, g: 0, b: 0 }, // 0: transparent / black
  { r: 0, g: 0, b: 0 }, // 1: black
  { r: 1, g: 6, b: 1 }, // 2: medium green
  { r: 3, g: 7, b: 3 }, // 3: light green
  { r: 1, g: 1, b: 7 }, // 4: dark blue
  { r: 2, g: 3, b: 7 }, // 5: light blue
  { r: 5, g: 1, b: 1 }, // 6: dark red
  { r: 2, g: 6, b: 7 }, // 7: cyan
  { r: 7, g: 1, b: 1 }, // 8: medium red
  { r: 7, g: 3, b: 3 }, // 9: light red
  { r: 6, g: 6, b: 1 }, // 10: dark yellow
  { r: 6, g: 6, b: 4 }, // 11: light yellow
  { r: 1, g: 4, b: 1 }, // 12: dark green
  { r: 6, g: 2, b: 5 }, // 13: magenta
  { r: 5, g: 5, b: 5 }, // 14: gray
  { r: 7, g: 7, b: 7 }, // 15: white
];

/** Pack a V9938 hardware color into the editor's 9-bit RRR-GGG-BBB index. */
export function packRgb3(color: Rgb3): number {
  for (const [component, value] of Object.entries(color)) {
    if (!Number.isInteger(value) || value < 0 || value > 7) {
      throw new Error(`${component.toUpperCase()} must be an integer from 0 to 7.`);
    }
  }
  return (color.r << 6) | (color.g << 3) | color.b;
}

export function unpackRgb3(colorIndex: number): Rgb3 {
  if (!Number.isInteger(colorIndex) || colorIndex < 0 || colorIndex >= V9938_COLOR_COUNT) {
    throw new Error("V9938 color index must be from 0 to 511.");
  }
  return {
    r: (colorIndex >> 6) & 7,
    g: (colorIndex >> 3) & 7,
    b: colorIndex & 7,
  };
}

function expand3(value: number): number {
  return Math.round(value * 255 / 7);
}

export function colorIndexToCss(colorIndex: number): string {
  const { r, g, b } = unpackRgb3(colorIndex);
  return `rgb(${expand3(r)}, ${expand3(g)}, ${expand3(b)})`;
}

export function colorIndexToHex(colorIndex: number): string {
  const { r, g, b } = unpackRgb3(colorIndex);
  return `#${[r, g, b].map(expand3).map((value) => value.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/** Convert RGB values to the two V9938 palette-port bytes: 0RGB0BBB, 00000GGG. */
export function encodePaletteRegisters(palette: number[]): number[] {
  if (palette.length !== V9938_PALETTE_SLOTS) {
    throw new Error(`Expected ${V9938_PALETTE_SLOTS} V9938 palette entries.`);
  }
  return palette.flatMap((colorIndex) => {
    const { r, g, b } = unpackRgb3(colorIndex);
    return [(r << 4) | b, g];
  });
}

export const DEFAULT_PALETTE = V9938_DEFAULT_PALETTE.map(packRgb3);
