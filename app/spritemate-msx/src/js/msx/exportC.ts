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

/** Export a frame sequence with shared palette data and a C frame table. */
export function exportMsx2AnimationC(
  frames: Msx2Sprite[][],
  spriteCount: 1 | 2,
  size: SpriteSize,
  palette: number[],
  frameDurationMs: number,
): string {
  if (!frames.length) throw new Error("Animation must contain at least one frame.");
  const parts = [
    `/* ${frames.length} frame V9938 animation · ${size}x${size} · ${spriteCount} sprite${spriteCount === 1 ? "" : "s"}. */`,
    `/* Advance one entry in sprite_animation_frames every ${frameDurationMs} ms. */`,
  ];
  const tableRows: string[] = [];
  frames.forEach((sprites, frameIndex) => {
    if (sprites.length < spriteCount) throw new Error(`Frame ${frameIndex + 1} has too few sprites for this mode.`);
    const names: string[] = [];
    sprites.slice(0, spriteCount).forEach((sprite, spriteIndex) => {
      const encoded = encodeMsx2ProjectSprite(sprite, size);
      const prefix = `anim_f${String(frameIndex).padStart(2, "0")}_${toIdentifier(sprite.name)}_${spriteIndex}`;
      const patternName = `${prefix}_pattern`;
      const colorsName = `${prefix}_colors`;
      parts.push(
        `/* Animation frame ${frameIndex + 1}, Sprite ${spriteIndex}: ${sprite.name}. */`,
        formatArray(patternName, encoded.pattern),
        formatArray(colorsName, encoded.colors),
      );
      names.push(patternName, colorsName);
    });
    tableRows.push(`    { ${names.join(", ")} }`);
  });
  const fields = spriteCount === 1
    ? "    const u8* pattern0; const u8* colors0;"
    : "    const u8* pattern0; const u8* colors0; const u8* pattern1; const u8* colors1;";
  parts.push(
    `typedef struct {\n${fields}\n} SpriteAnimationFrame;`,
    `const SpriteAnimationFrame sprite_animation_frames[] = {\n${tableRows.join(",\n")}\n};`,
    `const u8 sprite_animation_frame_count = ${frames.length};`,
    `const u16 sprite_animation_frame_duration_ms = ${frameDurationMs};`,
    "/* Shared palette port #2 bytes in P#0..P#15 order: first (R/B), then G. */",
    formatArray("sprite_palette", encodePaletteRegisters(palette)),
  );
  return parts.join("\n\n");
}
