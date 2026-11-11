import { encodeSprite, type MsxTarget, type SpriteData, type SpriteSize } from "./hardware";
import { encodeMsx2ProjectSprite, type Msx2Sprite } from "./project";
import { encodePaletteRegisters } from "./palette";

function toIdentifier(name: string): string {
  const identifier = name.replace(/[^a-zA-Z0-9_]/g, "_");
  return /^[a-zA-Z_]/.test(identifier) ? identifier : `sprite_${identifier}`;
}

function formatArray(name: string, values: number[]): string {
  const rows: string[] = [];
  for (let offset = 0; offset < values.length; offset += 8) {
    rows.push(`    ${values.slice(offset, offset + 8).map((value) => `0x${value.toString(16).padStart(2, "0")}`).join(", ")}`);
  }
  return `const u8 ${name}[] = {\n${rows.join(",\n")}\n};`;
}

/** Emit MSXgl-friendly C arrays for one MSX2 Sprite Mode 2 sprite. */
export function exportSpriteC(name: string, sprite: SpriteData, size: SpriteSize, target: MsxTarget = "msx2"): string {
  const encoded = encodeSprite(sprite, size, target);
  const prefix = toIdentifier(name);
  const notes = target === "msx2"
    ? "/* V9938 color bytes: bit 7 EC, bit 6 CC (overlap color mix), bit 5 IC, bits 3-0 color. */"
    : "/* TMS9918A color byte: low nibble is sprite color. */";
  return [
    `/* ${size}x${size} ${target.toUpperCase()} sprite data. */`,
    formatArray(`${prefix}_pattern`, encoded.pattern),
    notes,
    formatArray(`${prefix}_colors`, encoded.colors),
  ].join("\n\n");
}

/** Export sprites in SAT priority order, including CC flags and palette bytes. */
export function exportMsx2ProjectC(sprites: Msx2Sprite[], size: SpriteSize, palette: number[]): string {
  const paletteData = encodePaletteRegisters(palette);
  const parts = [
    `/* ${size}x${size} V9938 Sprite Mode 2. Place sprites in this order at the same SAT position for the overlap preview. */`,
  ];
  sprites.forEach((sprite, index) => {
    const encoded = encodeMsx2ProjectSprite(sprite, size);
    const prefix = `${toIdentifier(sprite.name)}_${index}`;
    parts.push(
      `/* Sprite ${index}: ${sprite.name}. Color bytes: EC bit 7, CC priority-group/OR bit 6, IC no-conflict bit 5, color bits 3-0. */`,
      formatArray(`${prefix}_pattern`, encoded.pattern),
      formatArray(`${prefix}_colors`, encoded.colors),
    );
  });
  parts.push(
    "/* Palette port #2 bytes in P#0..P#15 order: first (R/B), then G. */",
    formatArray("sprite_palette", paletteData),
  );
  return parts.join("\n\n");
}
