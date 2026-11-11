import {
  createMsx2Scanlines,
  encodeSprite,
  type Msx2Scanline,
  type EncodedSprite,
  type SpriteData,
  type SpritePixels,
  type SpriteSize,
} from "./hardware";
import { DEFAULT_PALETTE, V9938_PALETTE_SLOTS } from "./palette";

export interface Msx2Sprite {
  name: string;
  pixels: SpritePixels;
  scanlines: Msx2Scanline[];
}

export interface Msx2Project {
  format: "spritemate-msx";
  version: 1;
  target: "msx2-v9938-sm2";
  spriteSize: SpriteSize;
  /** Sixteen palette register values, each packed as a 9-bit RRR-GGG-BBB color. */
  palette: number[];
  sprites: Msx2Sprite[];
}

export function createMsx2Sprite(name: string, size: SpriteSize): Msx2Sprite {
  return {
    name,
    pixels: Array.from({ length: size }, () => Array<number>(size).fill(0)),
    scanlines: createMsx2Scanlines(size),
  };
}

export function createMsx2Project(size: SpriteSize = 16): Msx2Project {
  const base = createMsx2Sprite("sprite_0", size);
  const overlay = createMsx2Sprite("sprite_1", size);
  base.scanlines.forEach((line) => { line.color = 2; });
  overlay.scanlines.forEach((line) => {
    line.color = 4;
    line.overlapMix = true;
  });
  return {
    format: "spritemate-msx",
    version: 1,
    target: "msx2-v9938-sm2",
    spriteSize: size,
    palette: [...DEFAULT_PALETTE],
    sprites: [base, overlay],
  };
}

export function normalizeMsx2Palette(palette?: number[]): number[] {
  if (!palette) return [...DEFAULT_PALETTE];
  if (palette.length !== V9938_PALETTE_SLOTS || palette.some((color) => !Number.isInteger(color) || color < 0 || color > 511)) {
    throw new Error("Project palette must contain 16 V9938 colors (0–511).");
  }
  return [...palette];
}

/** Fill defaults for newly introduced per-line flags when loading old project JSON. */
export function normalizeMsx2Sprite(sprite: Partial<Msx2Sprite> & Pick<Msx2Sprite, "name" | "pixels">, size: SpriteSize): Msx2Sprite {
  const defaults = createMsx2Sprite(sprite.name, size);
  const scanlines = defaults.scanlines.map((line, index) => ({
    ...line,
    ...(sprite.scanlines?.[index] ?? {}),
  }));
  return { ...defaults, ...sprite, scanlines };
}

export function encodeMsx2ProjectSprite(sprite: Msx2Sprite, size: SpriteSize): EncodedSprite {
  const data: SpriteData = {
    pixels: sprite.pixels,
    color: sprite.scanlines[0]?.color ?? 15,
    lineColors: sprite.scanlines.map((line) => line.color),
    overlapMix: sprite.scanlines.map((line) => line.overlapMix),
    collisionInhibit: sprite.scanlines.map((line) => line.collisionInhibit),
    earlyClock: sprite.scanlines.map((line) => line.earlyClock),
  };
  return encodeSprite(data, size, "msx2");
}
