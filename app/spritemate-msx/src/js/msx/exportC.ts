import { encodeSprite, type MsxTarget, type SpriteData, type SpriteSize } from "./hardware";
import { encodeMsx2ProjectSprite, type Msx2Animation, type Msx2Sprite } from "./project";
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
  animations: Msx2Animation[],
  spriteCount: 1 | 2,
  size: SpriteSize,
  palette: number[],
): string {
  if (!animations.length) throw new Error("Project must contain at least one animation.");
  const parts = [
    `/* ${animations.length} V9938 animation${animations.length === 1 ? "" : "s"} · ${size}x${size} · ${spriteCount} sprite${spriteCount === 1 ? "" : "s"} per frame. */`,
    "/* Advance each clip using duration_ms from its frame table; ping_pong is 1 for ping-pong playback. */",
    "typedef struct { u16 duration_ms; const u8* pattern0; const u8* colors0; const u8* pattern1; const u8* colors1; } SpriteAnimationFrame;",
    "typedef struct { const char* name; const SpriteAnimationFrame* frames; u8 frame_count; u8 ping_pong; } SpriteAnimation;",
  ];
  const animationTableRows: string[] = [];
  animations.forEach((animation, animationIndex) => {
    if (!animation.frames.length) throw new Error(`Animation ${animationIndex + 1} has no frames.`);
    if (animation.frameDurationsMs.length !== animation.frames.length) {
      throw new Error(`Animation ${animationIndex + 1} must have a duration for every frame.`);
    }
    const tableName = animations.length === 1 ? "sprite_animation_frames" : `sprite_animation_${animationIndex}_frames`;
    const frameRows: string[] = [];
    parts.push(`/* Animation ${animationIndex + 1}: ${animation.name} (${animation.playbackMode}). */`);
    animation.frames.forEach((sprites, frameIndex) => {
      if (sprites.length < spriteCount) throw new Error(`Animation ${animationIndex + 1}, frame ${frameIndex + 1} has too few sprites for this mode.`);
      const names: string[] = [];
      sprites.slice(0, spriteCount).forEach((sprite, spriteIndex) => {
        const encoded = encodeMsx2ProjectSprite(sprite, size);
        const prefix = `anim_a${String(animationIndex).padStart(2, "0")}_f${String(frameIndex).padStart(2, "0")}_${toIdentifier(sprite.name)}_${spriteIndex}`;
        const patternName = `${prefix}_pattern`;
        const colorsName = `${prefix}_colors`;
        parts.push(
          `/* ${animation.name}, frame ${frameIndex + 1}, Sprite ${spriteIndex}: ${sprite.name}. */`,
          formatArray(patternName, encoded.pattern),
          formatArray(colorsName, encoded.colors),
        );
        names.push(patternName, colorsName);
      });
      const absentOverlay = spriteCount === 1 ? "0, 0" : "";
      const pointerFields = spriteCount === 1 ? `${names.join(", ")}, ${absentOverlay}` : names.join(", ");
      frameRows.push(`    { ${animation.frameDurationsMs[frameIndex]}, ${pointerFields} }`);
    });
    parts.push(`const SpriteAnimationFrame ${tableName}[] = {\n${frameRows.join(",\n")}\n};`);
    const cName = `"${animation.name.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/[\r\n]/g, " ")}"`;
    animationTableRows.push(`    { ${cName}, ${tableName}, ${animation.frames.length}, ${animation.playbackMode === "pingpong" ? 1 : 0} }`);
  });
  parts.push(
    `const SpriteAnimation sprite_animations[] = {\n${animationTableRows.join(",\n")}\n};`,
    `const u8 sprite_animation_count = ${animations.length};`,
    `const u8 sprite_animation_frame_count = ${animations[0].frames.length};`,
    `/* Legacy default: use duration_ms in each frame entry for variable timing. */`,
    `const u16 sprite_animation_frame_duration_ms = ${animations[0].frameDurationsMs[0]};`,
    "/* Shared palette port #2 bytes in P#0..P#15 order: first (R/B), then G. */",
    formatArray("sprite_palette", encodePaletteRegisters(palette)),
  );
  return parts.join("\n\n");
}


function cleanComment(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function formatAsmBytes(values: number[]): string {
  const rows: string[] = [];
  for (let offset = 0; offset < values.length; offset += 8) {
    rows.push(`    db ${values.slice(offset, offset + 8).map((value) => `$${value.toString(16).padStart(2, "0")}`).join(", ")}`);
  }
  return rows.join("\n");
}

/** Export V9938 animation data as Z80 assembler definitions (db/dw syntax). */
export function exportMsx2AnimationAsm(
  animations: Msx2Animation[],
  spriteCount: 1 | 2,
  size: SpriteSize,
  palette: number[],
): string {
  if (!animations.length) throw new Error("Project must contain at least one animation.");
  const lines = [
    `; MSX SpriteMate · V9938 Sprite Mode 2 · ${size}x${size} · ${spriteCount} sprite(s) per frame`,
    "; V9938 color byte: bit 7 EC, bit 6 CC, bit 5 IC, bits 3-0 color code.",
    "; Frame layout: duration_ms (word), then pattern/color word pointers per sprite.",
    "",
    "sprite_palette:",
    formatAsmBytes(encodePaletteRegisters(palette)),
    "",
  ];
  const animationTableRows: string[] = [];
  animations.forEach((animation, animationIndex) => {
    if (!animation.frames.length || animation.frameDurationsMs.length !== animation.frames.length) {
      throw new Error(`Animation ${animationIndex + 1} must contain frames with a duration for each frame.`);
    }
    const tableName = `sprite_animation_${String(animationIndex).padStart(2, "0")}_frames`;
    lines.push(`; Animation ${animationIndex + 1}: ${cleanComment(animation.name)} (${animation.playbackMode})`);
    const frameRows: string[] = [];
    animation.frames.forEach((sprites, frameIndex) => {
      if (sprites.length < spriteCount) throw new Error(`Animation ${animationIndex + 1}, frame ${frameIndex + 1} has too few sprites for this mode.`);
      const dataLabels: string[] = [];
      sprites.slice(0, spriteCount).forEach((sprite, spriteIndex) => {
        const encoded = encodeMsx2ProjectSprite(sprite, size);
        const prefix = `anim_a${String(animationIndex).padStart(2, "0")}_f${String(frameIndex).padStart(2, "0")}_s${spriteIndex}`;
        const patternLabel = `${prefix}_pattern`;
        const colorLabel = `${prefix}_colors`;
        lines.push(`; ${cleanComment(animation.name)}, frame ${frameIndex + 1}, Sprite ${spriteIndex}: ${cleanComment(sprite.name)}`, `${patternLabel}:`, formatAsmBytes(encoded.pattern), `${colorLabel}:`, formatAsmBytes(encoded.colors), "");
        dataLabels.push(patternLabel, colorLabel);
      });
      if (spriteCount === 1) dataLabels.push("0", "0");
      frameRows.push(`    dw ${animation.frameDurationsMs[frameIndex]}, ${dataLabels.join(", ")} ; frame ${frameIndex + 1}`);
    });
    lines.push(`${tableName}:`, ...frameRows, "");
    animationTableRows.push(`    dw ${tableName}`, `    db ${animation.frames.length}, ${animation.playbackMode === "pingpong" ? 1 : 0} ; frame count, ping-pong`);
  });
  lines.push("sprite_animations:", ...animationTableRows, "sprite_animation_count:", `    db ${animations.length}`);
  return lines.join("\n");
}

/** Export a sequential MSX BASIC DATA stream containing all animation bytes. */
export function exportMsx2AnimationBasic(
  animations: Msx2Animation[],
  spriteCount: 1 | 2,
  size: SpriteSize,
  palette: number[],
): string {
  if (!animations.length) throw new Error("Project must contain at least one animation.");
  const lines: string[] = [];
  let lineNumber = 10;
  const addRem = (message: string) => lines.push(`${lineNumber++} REM ${cleanComment(message)}`);
  const addData = (values: number[]) => {
    for (let offset = 0; offset < values.length; offset += 12) {
      lines.push(`${lineNumber++} DATA ${values.slice(offset, offset + 12).join(",")}`);
    }
  };
  addRem(`MSX SpriteMate V9938 Sprite Mode 2 ${size}x${size}`);
  addRem("Read order: animation count, sprite count, sprite size; then per animation frame count and ping-pong flag.");
  addRem("Per frame: duration milliseconds low byte, high byte; then each sprite pattern bytes followed by color bytes.");
  addRem("The final 32 bytes are palette port #2 registers in P#0..P#15 order: R/B, then G.");
  addData([animations.length, spriteCount, size]);
  animations.forEach((animation, animationIndex) => {
    if (!animation.frames.length || animation.frameDurationsMs.length !== animation.frames.length) {
      throw new Error(`Animation ${animationIndex + 1} must contain frames with a duration for each frame.`);
    }
    addRem(`Animation ${animationIndex + 1}: ${animation.name} (${animation.playbackMode})`);
    addData([animation.frames.length, animation.playbackMode === "pingpong" ? 1 : 0]);
    animation.frames.forEach((sprites, frameIndex) => {
      if (sprites.length < spriteCount) throw new Error(`Animation ${animationIndex + 1}, frame ${frameIndex + 1} has too few sprites for this mode.`);
      const duration = animation.frameDurationsMs[frameIndex];
      addRem(`Animation ${animation.name}, frame ${frameIndex + 1}, duration ${duration} ms`);
      addData([duration & 0xff, (duration >> 8) & 0xff]);
      sprites.slice(0, spriteCount).forEach((sprite, spriteIndex) => {
        const encoded = encodeMsx2ProjectSprite(sprite, size);
        addRem(`Sprite ${spriteIndex}: ${sprite.name} pattern bytes`);
        addData(encoded.pattern);
        addRem(`Sprite ${spriteIndex}: V9938 color bytes (EC, CC, IC, color)`);
        addData(encoded.colors);
      });
    });
  });
  addRem("Palette port #2 registers: R/B, then G for each of 16 palette slots");
  addData(encodePaletteRegisters(palette));
  return lines.join("\n");
}
