/** MSX sprite hardware profiles and byte encoders.
 *
 * Pattern data is MSB-first, one bit per pixel. Color 0 denotes a transparent
 * pixel. V9938 Sprite Mode 2 uses a color byte for each sprite scanline.
 */
export type MsxTarget = "msx1" | "msx2";
export type SpriteSize = 8 | 16;

export interface HardwareProfile {
  target: MsxTarget;
  label: string;
  maxSpritesPerScanline: number;
  colorsPerSpriteLine: number;
  scanlineColors: boolean;
}

export const HARDWARE_PROFILES: Record<MsxTarget, HardwareProfile> = {
  msx1: {
    target: "msx1",
    label: "MSX1 (TMS9918A)",
    maxSpritesPerScanline: 4,
    colorsPerSpriteLine: 1,
    scanlineColors: false,
  },
  msx2: {
    target: "msx2",
    label: "MSX2 (V9938 Sprite Mode 2)",
    maxSpritesPerScanline: 8,
    colorsPerSpriteLine: 1,
    scanlineColors: true,
  },
};

export type SpritePixels = number[][];

export interface SpriteData {
  pixels: SpritePixels;
  /** Sprite foreground color (MSX palette index 0–15; zero is transparent). */
  color: number;
  /** Optional foreground color per row, for V9938 Sprite Mode 2. */
  lineColors?: number[];
  /** V9938 CC bit (bit 6): joins a priority group; same-priority overlaps OR color codes. */
  overlapMix?: boolean[];
  /** V9938 IC bit (bit 5): this sprite line does not conflict with other sprites. */
  collisionInhibit?: boolean[];
  /** V9938 EC bit (bit 7): shift this scanline left by 32 dots. */
  earlyClock?: boolean[];
}

export interface EncodedSprite {
  /** Pattern bytes in VDP order; 16×16 patterns are four consecutive 8×8 blocks. */
  pattern: number[];
  /** MSX1 color byte, or V9938 color-table bytes with EC/CC/IC bits. */
  colors: number[];
}

/** Persistent MSX2 scanline controls with defaults for older project files. */
export interface Msx2Scanline {
  color: number;
  overlapMix: boolean;
  collisionInhibit: boolean;
  earlyClock: boolean;
}

export function createMsx2Scanlines(size: SpriteSize, color = 15): Msx2Scanline[] {
  return Array.from({ length: size }, () => ({
    color,
    overlapMix: false,
    collisionInhibit: false,
    earlyClock: false,
  }));
}

/** Pack one V9938 color-table line: EC CC IC 0 CCCC. */
export function encodeV9938ColorLine(line: Msx2Scanline): number {
  if (!Number.isInteger(line.color) || line.color < 0 || line.color > 15) {
    throw new Error("V9938 sprite color must be an index from 0 to 15.");
  }
  return (line.earlyClock ? 0x80 : 0)
    | (line.overlapMix ? 0x40 : 0)
    | (line.collisionInhibit ? 0x20 : 0)
    | line.color;
}

export function validateSprite(sprite: SpriteData, size: SpriteSize, target: MsxTarget): string[] {
  const errors: string[] = [];
  if (sprite.pixels.length !== size || sprite.pixels.some((row) => row.length !== size)) {
    errors.push(`Expected a ${size}×${size} pixel grid.`);
    return errors;
  }
  if (!Number.isInteger(sprite.color) || sprite.color < 0 || sprite.color > 15) {
    errors.push("Sprite color must be an MSX palette index from 0 to 15.");
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const pixel = sprite.pixels[y][x];
      if (pixel !== 0 && pixel !== 1) {
        errors.push(`Pixel (${x}, ${y}) must be transparent (0) or set (1).`);
      }
    }
  }
  if (target === "msx2" && sprite.lineColors && sprite.lineColors.length !== size) {
    errors.push(`MSX2 scanline color table must have ${size} entries.`);
  }
  if (target === "msx2" && sprite.lineColors?.some((c) => !Number.isInteger(c) || c < 0 || c > 15)) {
    errors.push("MSX2 scanline colors must be MSX palette indices from 0 to 15.");
  }
  if (target === "msx2" && [sprite.overlapMix, sprite.collisionInhibit, sprite.earlyClock].some((flags) => flags && flags.length !== size)) {
    errors.push(`MSX2 scanline flag arrays must have ${size} entries.`);
  }
  return [...new Set(errors)];
}

/** Encode a sprite pattern in VDP byte order (leftmost pixel is bit 7). */
export function encodeSprite(sprite: SpriteData, size: SpriteSize, target: MsxTarget): EncodedSprite {
  const errors = validateSprite(sprite, size, target);
  if (errors.length) throw new Error(errors.join(" "));

  const pattern: number[] = [];
  const blocksPerSide = size / 8;
  for (let blockY = 0; blockY < blocksPerSide; blockY++) {
    for (let blockX = 0; blockX < blocksPerSide; blockX++) {
      for (let row = 0; row < 8; row++) {
        const y = blockY * 8 + row;
        let value = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = blockX * 8 + bit;
          if (sprite.pixels[y][x] !== 0) value |= 0x80 >> bit;
        }
        pattern.push(value);
      }
    }
  }

  const colors = target === "msx1"
    ? [sprite.color & 0x0f]
    : Array.from({ length: size }, (_, y) => {
        const color = (sprite.lineColors?.[y] ?? sprite.color) & 0x0f;
        return encodeV9938ColorLine({
          color,
          earlyClock: sprite.earlyClock?.[y] ?? false,
          overlapMix: sprite.overlapMix?.[y] ?? false,
          collisionInhibit: sprite.collisionInhibit?.[y] ?? false,
        });
      });
  return { pattern, colors };
}
