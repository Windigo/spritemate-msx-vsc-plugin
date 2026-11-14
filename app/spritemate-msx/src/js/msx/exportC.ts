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

/** Export MSX1 TMS9918A animation patterns and one fixed-palette color per sprite. */
export function exportMsx1Animation(
  animations: Msx2Animation[],
  spriteCount: 1 | 2,
  size: SpriteSize,
  format: "c" | "asm" | "basic",
  magnification: 1 | 2 = 1,
): string {
  if (!animations.length) throw new Error("Project must contain at least one animation.");
  animations.forEach((animation, animationIndex) => {
    if (!animation.frames.length || animation.frameDurationsMs.length !== animation.frames.length) {
      throw new Error(`Animation ${animationIndex + 1} must contain frames with a duration for each frame.`);
    }
    animation.frames.forEach((sprites, frameIndex) => {
      if (sprites.length < spriteCount) throw new Error(`Animation ${animationIndex + 1}, frame ${frameIndex + 1} has too few sprites for this mode.`);
    });
  });
  if (format === "c") {
    const parts = [
      `/* MSX1 TMS9918A · ${size}x${size} patterns · ${magnification}x magnification · ${spriteCount} sprite(s) per frame. */`,
      "/* SAT color byte: bit 7 Early Clock, bits 3-0 color; color 0 is transparent. */",
      "/* Hardware limits: 32 sprites total, at most 4 on a scanline. Set sprite size/magnification in VDP register 1. */",
      "typedef struct { u16 duration_ms; const u8* pattern0; u8 color0; const u8* pattern1; u8 color1; } Msx1SpriteFrame;",
      "typedef struct { const char* name; const Msx1SpriteFrame* frames; u8 frame_count; u8 ping_pong; } Msx1SpriteAnimation;",
      `static const u8 sprite_size = ${size}; /* configure VDP register 1 */`,
      `static const u8 sprite_count = ${spriteCount};`,
      `static const u8 sprite_magnification = ${magnification}; /* configure VDP register 1 */`,
    ];
    const animationRows: string[] = [];
    animations.forEach((animation, animationIndex) => {
      const tableName = animations.length === 1 ? "sprite_animation_frames" : `sprite_animation_${animationIndex}_frames`;
      const frameRows: string[] = [];
      animation.frames.forEach((sprites, frameIndex) => {
        const fields: string[] = [];
        sprites.slice(0, spriteCount).forEach((sprite, spriteIndex) => {
          const encoded = encodeSprite({ pixels: sprite.pixels, color: sprite.scanlines[0]?.color ?? 1, earlyClockGlobal: sprite.msx1EarlyClock }, size, "msx1");
          const prefix = `anim_a${String(animationIndex).padStart(2, "0")}_f${String(frameIndex).padStart(2, "0")}_s${spriteIndex}`;
          const patternName = `${prefix}_pattern`;
          const colorName = `${prefix}_color`;
          parts.push(
            `/* ${cleanComment(animation.name)}, frame ${frameIndex + 1}, Sprite ${spriteIndex}. */`,
            formatArray(patternName, encoded.pattern).replace("const u8 ", "static const u8 "),
            `#define ${colorName} ${encoded.colors[0]}`,
          );
          fields.push(patternName, colorName);
        });
        if (spriteCount === 1) fields.push("0", "0");
        frameRows.push(`    { ${animation.frameDurationsMs[frameIndex]}, ${fields.join(", ")} }`);
      });
      parts.push(`static const Msx1SpriteFrame ${tableName}[] = {\n${frameRows.join(",\n")}\n};`);
      const name = `"${cleanComment(animation.name).replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
      animationRows.push(`    { ${name}, ${tableName}, ${animation.frames.length}, ${animation.playbackMode === "pingpong" ? 1 : 0} }`);
    });
    parts.push(`static const Msx1SpriteAnimation sprite_animations[] = {\n${animationRows.join(",\n")}\n};`, `static const u8 sprite_animation_count = ${animations.length};`);
    return parts.join("\n\n");
  }
  if (format === "asm") {
    const lines = [
      `; MSX1 TMS9918A · ${size}x${size} sprite patterns · ${magnification}x magnification · ${spriteCount} sprite(s) per frame`,
      "; SAT color byte: bit 7 Early Clock, bits 3-0 color; color 0 is transparent.",
      "; VDP limits: 32 sprites total, at most 4 sprites on each scanline.",
      "; Set sprite size and magnification in VDP register 1.",
      `sprite_size: db ${size}`,
      `sprite_magnification: db ${magnification}`,
      "",
    ];
    const animationRows: string[] = [];
    animations.forEach((animation, animationIndex) => {
      const tableName = `sprite_animation_${String(animationIndex).padStart(2, "0")}_frames`;
      lines.push(`; Animation ${animationIndex + 1}: ${cleanComment(animation.name)} (${animation.playbackMode})`);
      animation.frames.forEach((sprites, frameIndex) => {
        const frameLabel = `anim_a${String(animationIndex).padStart(2, "0")}_f${String(frameIndex).padStart(2, "0")}`;
        lines.push(`${frameLabel}:`, `    dw ${animation.frameDurationsMs[frameIndex]}`);
        sprites.slice(0, spriteCount).forEach((sprite, spriteIndex) => {
          const encoded = encodeSprite({ pixels: sprite.pixels, color: sprite.scanlines[0]?.color ?? 1, earlyClockGlobal: sprite.msx1EarlyClock }, size, "msx1");
          const prefix = `${frameLabel}_s${spriteIndex}`;
          lines.push(`    dw ${prefix}_pattern`, `    db ${encoded.colors[0]} ; SAT color: bit 7 EC, bits 3-0 color`, `${prefix}_pattern:`, formatAsmBytes(encoded.pattern));
        });
        if (spriteCount === 1) lines.push("    dw 0", "    db 0");
      });
      lines.push(`${tableName}:`, `    dw ${animation.frames.map((_, frameIndex) => `anim_a${String(animationIndex).padStart(2, "0")}_f${String(frameIndex).padStart(2, "0")}`).join(", ")}`, `    db ${animation.frames.length}, ${animation.playbackMode === "pingpong" ? 1 : 0} ; frame count, ping-pong`, "");
      animationRows.push(`    dw ${tableName}`);
    });
    lines.push("sprite_animations:", ...animationRows, "sprite_animation_count:", `    db ${animations.length}`);
    return lines.join("\n");
  }
  const lines: string[] = [];
  let lineNumber = 10;
  const addRem = (message: string) => lines.push(`${lineNumber++} REM ${cleanComment(message)}`);
  const addData = (values: number[]) => {
    for (let offset = 0; offset < values.length; offset += 12) lines.push(`${lineNumber++} DATA ${values.slice(offset, offset + 12).join(",")}`);
  };
  addRem(`MSX1 TMS9918A sprites ${size}x${size}; ${magnification}x magnification; pattern bytes and one SAT color byte per sprite.`);
  addRem("SAT color byte: bit 7 Early Clock, bits 3-0 color. Color 0 is transparent. Max 32 sprites total and 4 per scanline.");
  addRem("Set sprite size and magnification in VDP register 1.");
  addData([animations.length, spriteCount, size, magnification]);
  animations.forEach((animation, animationIndex) => {
    addRem(`Animation ${animationIndex + 1}: ${animation.name} (${animation.playbackMode})`);
    addData([animation.frames.length, animation.playbackMode === "pingpong" ? 1 : 0]);
    animation.frames.forEach((sprites, frameIndex) => {
      const duration = animation.frameDurationsMs[frameIndex];
      addData([duration & 0xff, (duration >> 8) & 0xff]);
      sprites.slice(0, spriteCount).forEach((sprite, spriteIndex) => {
        const encoded = encodeSprite({ pixels: sprite.pixels, color: sprite.scanlines[0]?.color ?? 1, earlyClockGlobal: sprite.msx1EarlyClock }, size, "msx1");
        addRem(`Animation ${animation.name}, frame ${frameIndex + 1}, Sprite ${spriteIndex} pattern`);
        addData(encoded.pattern);
        addData(encoded.colors);
      });
    });
  });
  return lines.join("\n");
}

/** Emit a standalone MSXgl player source file for an exported MSX2 Sprite Mode 2 data header. */
export function exportMsx2PreviewC(
  size: SpriteSize,
  spriteCount: 1 | 2,
  animationIndex = 0,
): string {
  const secondPatternIndex = size === 16 ? 4 : 1;
  return `/*
 * MSX SpriteMate animation preview for MSX2 V9938 Sprite Mode 2.
 * This standalone preview program uses MSXgl, including its print module.
 * Add "print" to LibModules and enable PRINT_USE_BITMAP in msxgl_config.h.
 * Save beside sprite-animation.h and build it for Machine = "2".
 * Controls: Left/Right select animations, Space pauses/resumes, Escape restarts.
 */
#include "msxgl.h"
#include "sprite-animation.h"
#include "font/font_mgl_sample8.h"

/* Starts with the animation selected in SpriteMate, from its first frame. */
#define PREVIEW_ANIMATION_INDEX ${animationIndex}
/* Sprite positions can be adjusted here. */
#define PREVIEW_SPRITE_X 112
#define PREVIEW_SPRITE_Y 80

static const u8 g_PreviewSpriteSize = ${size};
static const u8 g_SecondPatternIndex = ${secondPatternIndex};
static const u16 g_FrameTickMs = 20; /* MSX2 default is 50 Hz. */
static const VADDR g_SpritePatternTable = 0x17000L;
static const VADDR g_SpriteAttributeTable = 0x17A00L;
static u8 g_SpriteColorBuffer[16];

static const SpriteAnimation* g_Animation;
static u8 g_AnimationIndex = PREVIEW_ANIMATION_INDEX;
static u8 g_FrameIndex = 0;
static u8 g_PingPongReverse = 0;
static u16 g_FrameTimeLeft = 0;
static u8 g_PreviousLeft = 0;
static u8 g_PreviousRight = 0;
static u8 g_PreviousSpace = 0;
static u8 g_PreviousEscape = 0;
static u8 g_IsPaused = 0;

static void SetSprite(u8 index, u8 shape, const u8* pattern, const u8* colors)
{
    for (u8 y = 0; y < 16; ++y)
        g_SpriteColorBuffer[y] = y < g_PreviewSpriteSize ? colors[y] : 0;
    if (g_PreviewSpriteSize == 16)
    {
        /* VDP 16x16 pattern order is top-left, bottom-left, top-right, bottom-right. */
        VDP_LoadSpritePattern(pattern, shape, 1);
        VDP_LoadSpritePattern(pattern + 16, shape + 1, 1);
        VDP_LoadSpritePattern(pattern + 8, shape + 2, 1);
        VDP_LoadSpritePattern(pattern + 24, shape + 3, 1);
    }
    else VDP_LoadSpritePattern(pattern, shape, 1);
    VDP_SetSpriteExMultiColor(index, PREVIEW_SPRITE_X, PREVIEW_SPRITE_Y, shape, g_SpriteColorBuffer);
}

static void ShowFrame(const SpriteAnimationFrame* frame)
{
    SetSprite(0, 0, frame->pattern0, frame->colors0);

    if (${spriteCount} > 1)
    {
        SetSprite(1, g_SecondPatternIndex, frame->pattern1, frame->colors1);
    }
    else
    {
        VDP_HideSprite(1);
    }
}

static void AdvanceFrame(void)
{
    if (g_Animation->frame_count < 2)
        return;

    if (!g_Animation->ping_pong)
    {
        g_FrameIndex = (g_FrameIndex + 1) % g_Animation->frame_count;
    }
    else if (!g_PingPongReverse)
    {
        if (g_FrameIndex + 1 >= g_Animation->frame_count)
        {
            g_PingPongReverse = 1;
            --g_FrameIndex;
        }
        else ++g_FrameIndex;
    }
    else if (g_FrameIndex == 0)
    {
        g_PingPongReverse = 0;
        ++g_FrameIndex;
    }
    else --g_FrameIndex;
}

static void DrawPlaybackStatus(void)
{
    Print_SetPosition(0, 10);
    Print_DrawText(g_IsPaused ? "PAUSED - SPACE TO RESUME   " : "ARROWS SELECT  SPACE PAUSE ");
}

static void DrawAnimationInfo(void)
{
    Print_SetPosition(0, 0);
    Print_DrawText("                                ");
    Print_SetPosition(0, 0);
    Print_DrawText("ANIM ");
    Print_DrawInt(g_AnimationIndex + 1);
    Print_DrawText("/");
    Print_DrawInt(sprite_animation_count);
    Print_DrawText(" ");
    for (u8 i = 0; i < 21 && g_Animation->name[i]; ++i)
        Print_DrawChar(g_Animation->name[i]);
    DrawPlaybackStatus();
}

static void SelectAnimation(u8 index)
{
    g_AnimationIndex = index % sprite_animation_count;
    g_Animation = &sprite_animations[g_AnimationIndex];
    g_FrameIndex = 0;
    g_PingPongReverse = 0;
    ShowFrame(&g_Animation->frames[g_FrameIndex]);
    g_FrameTimeLeft = g_Animation->frames[g_FrameIndex].duration_ms;
    DrawAnimationInfo();
}

static void RestartAnimation(void)
{
    g_FrameIndex = 0;
    g_PingPongReverse = 0;
    ShowFrame(&g_Animation->frames[g_FrameIndex]);
    g_FrameTimeLeft = g_Animation->frames[g_FrameIndex].duration_ms;
}

void main(void)
{
    u8 spriteFlags = g_PreviewSpriteSize == 16 ? VDP_SPRITE_SIZE_16 : VDP_SPRITE_SIZE_8;
    if (sprite_animation_count == 0)
        while (TRUE) Halt();
    if (g_AnimationIndex >= sprite_animation_count)
        g_AnimationIndex = 0;

    VDP_SetMode(VDP_MODE_SCREEN5);
    VDP_ClearVRAM();
    VDP_SetBackdropColor(0);
    VDP_SetPaletteEntry(0, RGB16(0, 0, 0));
    VDP_SetPalette(sprite_palette + 2); /* Entries 1-15; palette slot 0 stays black. */
    VDP_EnableVBlank(TRUE);
    VDP_SetSpriteTables(g_SpritePatternTable, g_SpriteAttributeTable);
    VDP_SetSpriteFlag(spriteFlags);
    VDP_EnableSprite(TRUE);
    VDP_HideAllSprites();
    Print_SetBitmapFont(g_Font_MGL_Sample8);
    Print_SetColor(15, 0);

    SelectAnimation(g_AnimationIndex);
    while (TRUE)
    {
        Halt();
        {
            u8 left = Keyboard_IsKeyPressed(KEY_LEFT);
            u8 right = Keyboard_IsKeyPressed(KEY_RIGHT);
            u8 space = Keyboard_IsKeyPressed(KEY_SPACE);
            u8 escape = Keyboard_IsKeyPressed(KEY_ESC);
            u8 changedAnimation = FALSE;
            u8 restarted = FALSE;
            if (right && !g_PreviousRight)
            {
                SelectAnimation(g_AnimationIndex + 1);
                changedAnimation = TRUE;
            }
            else if (left && !g_PreviousLeft)
            {
                SelectAnimation(g_AnimationIndex == 0 ? sprite_animation_count - 1 : g_AnimationIndex - 1);
                changedAnimation = TRUE;
            }
            if (space && !g_PreviousSpace)
            {
                g_IsPaused = !g_IsPaused;
                DrawPlaybackStatus();
            }
            if (escape && !g_PreviousEscape)
            {
                RestartAnimation();
                restarted = TRUE;
            }
            g_PreviousLeft = left;
            g_PreviousRight = right;
            g_PreviousSpace = space;
            g_PreviousEscape = escape;

            if (!g_IsPaused && !changedAnimation && !restarted)
            {
                if (g_FrameTimeLeft <= g_FrameTickMs)
                {
                    AdvanceFrame();
                    ShowFrame(&g_Animation->frames[g_FrameIndex]);
                    g_FrameTimeLeft = g_Animation->frames[g_FrameIndex].duration_ms;
                }
                else g_FrameTimeLeft -= g_FrameTickMs;
            }
        }
    }
}
`;
}

const ASM_PREVIEW_FONT: Record<string, number[]> = {
  " ": [0, 0, 0, 0, 0], ":": [0, 4, 0, 4, 0], "/": [1, 2, 4, 8, 16], "-": [0, 0, 31, 0, 0], "_": [0, 0, 0, 0, 31], ".": [0, 0, 0, 0, 4],
  A: [14, 17, 17, 31, 17], B: [30, 17, 30, 17, 30], C: [14, 17, 16, 17, 14], D: [30, 17, 17, 17, 30], E: [31, 16, 30, 16, 31],
  F: [31, 16, 30, 16, 16], G: [14, 17, 23, 17, 15], H: [17, 17, 31, 17, 17], I: [14, 4, 4, 4, 14], J: [7, 2, 2, 18, 12],
  K: [17, 18, 28, 18, 17], L: [16, 16, 16, 16, 31], M: [17, 27, 21, 17, 17], N: [17, 25, 21, 19, 17], O: [14, 17, 17, 17, 14],
  P: [30, 17, 30, 16, 16], Q: [14, 17, 17, 21, 13], R: [30, 17, 30, 18, 17], S: [15, 16, 14, 1, 30], T: [31, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 14], V: [17, 17, 17, 10, 4], W: [17, 17, 21, 27, 17], X: [17, 10, 4, 10, 17], Y: [17, 10, 4, 4, 4], Z: [31, 2, 4, 8, 31],
  0: [14, 17, 19, 21, 14], 1: [4, 12, 4, 4, 14], 2: [14, 17, 2, 8, 31], 3: [30, 1, 6, 1, 30], 4: [2, 6, 10, 31, 2],
  5: [31, 16, 30, 1, 30], 6: [14, 16, 30, 17, 14], 7: [31, 1, 2, 4, 4], 8: [14, 17, 14, 17, 14], 9: [14, 17, 15, 1, 14],
};

function renderAsmPreviewTextRow(text: string): number[][] {
  const chars = text.toUpperCase().replace(/[^A-Z0-9 :/_.-]/g, " ").padEnd(32, " ").slice(0, 32);
  return Array.from({ length: 5 }, (_, row) => {
    const bytes: number[] = [];
    for (const char of chars) {
      const glyph = ASM_PREVIEW_FONT[char] ?? ASM_PREVIEW_FONT[" "];
      const bit = (column: number) => (glyph[row] & (1 << (4 - column))) !== 0;
      bytes.push(bit(0) ? 0x0f : 0, (bit(1) ? 0xf0 : 0) | (bit(2) ? 0x0f : 0), (bit(3) ? 0xf0 : 0) | (bit(4) ? 0x0f : 0), 0);
    }
    return bytes;
  });
}

/** Emit a standalone SjASMPlus ROM preview for all clips in the MSX2 project. */
export function exportMsx2PreviewAsm(
  animations: Msx2Animation[],
  spriteCount: 1 | 2,
  size: SpriteSize,
  palette: number[],
  animationIndex = 0,
): string {
  if (!animations.length) throw new Error("Project must contain at least one animation.");
  if (animations.length > 255) throw new Error("SjASMPlus preview supports up to 255 animations.");
  animations.forEach((animation, index) => {
    if (animation.frames.length > 255) throw new Error(`Animation ${index + 1} exceeds the 255-frame preview limit.`);
    if (!animation.frames.length || animation.frameDurationsMs.length !== animation.frames.length) {
      throw new Error(`Animation ${index + 1} must contain frames with a duration for each frame.`);
    }
    animation.frames.forEach((sprites, frameIndex) => {
      if (sprites.length < spriteCount) throw new Error(`Animation ${index + 1}, frame ${frameIndex + 1} has too few sprites for this mode.`);
    });
  });
  if (animationIndex < 0 || animationIndex >= animations.length) animationIndex = 0;

  const spritePatternBytes = size === 16 ? 32 : 8;
  const secondPatternIndex = size === 16 ? 4 : 1;
  const paletteBytes = encodePaletteRegisters(palette);
  paletteBytes[0] = 0;
  paletteBytes[1] = 0;
  const lines = [
    "; MSX SpriteMate standalone MSX2 V9938 Sprite Mode 2 animation player.",
    "; SjASMPlus ROM; this player does not use MSXgl.",
    "; Build: sjasmplus --raw=sprite-animation-preview.rom sprite-animation-preview.asm",
    `; Starts with animation ${animationIndex + 1}/${animations.length}: ${cleanComment(animations[animationIndex].name)}.`,
    "; Left/Right: select animation. Space: pause/resume. Escape: restart current animation.",
    "; Screen 5, black background, white status text, 50 Hz frame timing.",
    "AnimationIndex equ $C000",
    "FrameIndex equ $C001",
    "FrameDirection equ $C002",
    "TicksRemaining equ $C003",
    "CurrentKeys equ $C004",
    "PreviousKeys equ $C005",
    "PressedKeys equ $C006",
    "IsPaused equ $C007",
    "SkipTick equ $C008",
    "",
    "        org $4000",
    '        db "AB"',
    "        dw Start, 0, 0, 0, 0, 0, 0",
    "",
    "Start:",
    "        ld a,5",
    "        call $005F                 ; BIOS CHGMOD: Screen 5",
    "        ld hl,$0000",
    "        ld bc,$6A00                ; clear 256x212 bitmap to palette index 0",
    "        xor a",
    "        call $0056                 ; BIOS FILVRM",
    "        xor a",
    "        out ($99),a",
    "        ld a,$87                    ; R#7: black backdrop/border",
    "        out ($99),a",
    "        ld a,($F3E0)",
    "        and $FC                    ; force 1x magnification and select sprite size",
    ...(size === 16 ? ["        or $02"] : []),
    "        out ($99),a",
    "        ld a,$81",
    "        out ($99),a",
    "        ld a,($FFE7)",
    "        and $FD                    ; enable sprites (clear R#8 SPD)",
    "        out ($99),a",
    "        ld a,$88",
    "        out ($99),a",
    "        ld a,$3C",
    "        out ($99),a",
    "        ld a,$86                    ; R#6: sprite patterns at VRAM $1E000",
    "        out ($99),a",
    "        ld a,$E7",
    "        out ($99),a",
    "        ld a,$85                    ; R#5: sprite attributes at VRAM $1F200",
    "        out ($99),a",
    "        ld a,$03",
    "        out ($99),a",
    "        ld a,$8B                    ; R#11: high SAT address bits",
    "        out ($99),a",
    "        xor a",
    "        out ($99),a",
    "        ld a,$90                    ; R#16: palette index 0",
    "        out ($99),a",
    "        ld hl,SpritePalette",
    "        ld b,32",
    "PaletteLoop:",
    "        ld a,(hl)",
    "        out ($9A),a",
    "        inc hl",
    "        djnz PaletteLoop",
    "        ld hl,SpriteAttributes",
    "        ld de,$3200                ; low 14 bits of VRAM address $1F200",
    `        ld bc,$${(spriteCount * 4 + 1).toString(16).padStart(4, "0")}`,
    "        ld a,$07",
    "        call WriteVRAM",
    "        ld hl,AnimationIndex",
    "        ld b,9",
    "        xor a",
    "ClearState:",
    "        ld (hl),a",
    "        inc hl",
    "        djnz ClearState",
    "        ld a," + animationIndex,
    "        call SelectAnimation",
    "        call DrawControls",
    "        ei",
    "",
    "MainLoop:",
    "        halt",
    "        call ReadControls",
    "        xor a",
    "        ld (SkipTick),a",
    "        ld a,(PressedKeys)",
    "        bit 1,a",
    "        jr z,CheckLeft",
    "        call SelectNextAnimation",
    "        jr ControlsDone",
    "CheckLeft:",
    "        ld a,(PressedKeys)",
    "        bit 0,a",
    "        jr z,CheckSpace",
    "        call SelectPreviousAnimation",
    "        jr ControlsDone",
    "CheckSpace:",
    "        ld a,(PressedKeys)",
    "        bit 2,a",
    "        jr z,CheckEscape",
    "        ld a,(IsPaused)",
    "        xor 1",
    "        ld (IsPaused),a",
    "        call DrawPauseStatus",
    "        ld a,1",
    "        ld (SkipTick),a",
    "CheckEscape:",
    "        ld a,(PressedKeys)",
    "        bit 3,a",
    "        jr z,ControlsDone",
    "        xor a",
    "        ld (FrameIndex),a",
    "        ld (FrameDirection),a",
    "        call ShowCurrentFrame",
    "        call LoadFrameDuration",
    "        ld a,1",
    "        ld (SkipTick),a",
    "ControlsDone:",
    "        ld a,(SkipTick)",
    "        or a",
    "        jr nz,MainLoop",
    "        ld a,(IsPaused)",
    "        or a",
    "        jr nz,MainLoop",
    "        ld a,(TicksRemaining)",
    "        dec a",
    "        ld (TicksRemaining),a",
    "        jr nz,MainLoop",
    "        call AdvanceFrame",
    "        call ShowCurrentFrame",
    "        call LoadFrameDuration",
    "        jp MainLoop",
    "",
    "ReadControls:",
    "        xor a",
    "        ld (CurrentKeys),a",
    "        ld a,8",
    "        call $0141                 ; BIOS SNSMAT, cursor keys and Space",
    "        bit 4,a",
    "        jr nz,NoLeftKey",
    "        ld a,(CurrentKeys)",
    "        or $01",
    "        ld (CurrentKeys),a",
    "NoLeftKey:",
    "        ld a,8",
    "        call $0141",
    "        bit 7,a",
    "        jr nz,NoRightKey",
    "        ld a,(CurrentKeys)",
    "        or $02",
    "        ld (CurrentKeys),a",
    "NoRightKey:",
    "        ld a,8",
    "        call $0141",
    "        bit 0,a",
    "        jr nz,NoSpaceKey",
    "        ld a,(CurrentKeys)",
    "        or $04",
    "        ld (CurrentKeys),a",
    "NoSpaceKey:",
    "        ld a,7",
    "        call $0141                 ; BIOS SNSMAT, Escape",
    "        bit 2,a",
    "        jr nz,NoEscapeKey",
    "        ld a,(CurrentKeys)",
    "        or $08",
    "        ld (CurrentKeys),a",
    "NoEscapeKey:",
    "        ld a,(PreviousKeys)",
    "        cpl",
    "        ld b,a",
    "        ld a,(CurrentKeys)",
    "        and b",
    "        ld (PressedKeys),a",
    "        ld a,(CurrentKeys)",
    "        ld (PreviousKeys),a",
    "        ret",
    "",
    "SelectNextAnimation:",
    "        ld a,(AnimationIndex)",
    "        inc a",
    `        cp ${animations.length}`,
    "        jr c,SelectAnimation",
    "        xor a",
    "        jp SelectAnimation",
    "SelectPreviousAnimation:",
    "        ld a,(AnimationIndex)",
    "        or a",
    "        jr nz,SelectPreviousDecrement",
    `        ld a,${animations.length - 1}`,
    "        jp SelectAnimation",
    "SelectPreviousDecrement:",
    "        dec a",
    "        jp SelectAnimation",
    "",
    "SelectAnimation:",
    "        ld (AnimationIndex),a",
    "        xor a",
    "        ld (FrameIndex),a",
    "        ld (FrameDirection),a",
    "        ld a,1",
    "        ld (SkipTick),a",
    "        call ShowCurrentFrame",
    "        call LoadFrameDuration",
    "        call DrawAnimationTitle",
    "        ret",
    "",
    "DrawAnimationTitle:",
    "        ld a,(AnimationIndex)",
  ];
  animations.forEach((_, animationIndex) => lines.push(`        cp ${animationIndex}`, `        jp z,DrawAnimationTitle${animationIndex}`));
  lines.push("        ret", "");
  animations.forEach((animation, animationIndex) => {
    lines.push(`DrawAnimationTitle${animationIndex}:`);
    const title = `ANIM ${animationIndex + 1}/${animations.length} ${animation.name}`;
    renderAsmPreviewTextRow(title).forEach((bytes, row) => {
      lines.push(`        ld hl,Title${animationIndex}Row${row}`, `        ld de,$${((row + 1) * 128).toString(16).padStart(4, "0")}`, "        ld bc,$0080", "        xor a", "        call WriteVRAM");
    });
    lines.push("        ret", "");
  });
  lines.push(
    "DrawControls:",
    "        ld hl,ControlsSelectRow0", "        ld de,$0480", "        ld bc,$0080", "        xor a", "        call WriteVRAM",
    "        ld hl,ControlsSelectRow1", "        ld de,$0500", "        ld bc,$0080", "        xor a", "        call WriteVRAM",
    "        ld hl,ControlsSelectRow2", "        ld de,$0580", "        ld bc,$0080", "        xor a", "        call WriteVRAM",
    "        ld hl,ControlsSelectRow3", "        ld de,$0600", "        ld bc,$0080", "        xor a", "        call WriteVRAM",
    "        ld hl,ControlsSelectRow4", "        ld de,$0680", "        ld bc,$0080", "        xor a", "        call WriteVRAM",
    "        jp DrawPauseStatus",
    "",
    "DrawPauseStatus:",
    "        ld a,(IsPaused)",
    "        or a",
    "        jp nz,DrawResumeText",
  );
  const addPauseRow = (prefix: string, text: string) => {
    lines.push(`${prefix}:`);
    renderAsmPreviewTextRow(text).forEach((bytes, row) => {
      lines.push(`        ld hl,${prefix}Row${row}`, `        ld de,$${((row + 17) * 128).toString(16).padStart(4, "0")}`, "        ld bc,$0080", "        xor a", "        call WriteVRAM");
    });
    lines.push("        ret", "");
  };
  lines.push("        jp DrawPauseText", "DrawResumeText:", "        jp DrawResumeTextRows", "");
  addPauseRow("DrawPauseText", "SPACE: PAUSE  ESC: RESTART");
  addPauseRow("DrawResumeTextRows", "SPACE: RESUME  ESC: RESTART");

  lines.push("ShowCurrentFrame:", "        ld a,(AnimationIndex)");
  animations.forEach((_, animationIndex) => lines.push(`        cp ${animationIndex}`, `        jp z,ShowCurrentFrame${animationIndex}`));
  lines.push("        ret", "");
  animations.forEach((animation, animationIndex) => {
    lines.push(`ShowCurrentFrame${animationIndex}:`, "        ld a,(FrameIndex)");
    animation.frames.forEach((_, frameIndex) => lines.push(`        cp ${frameIndex}`, `        jp z,ShowFrame${animationIndex}_${frameIndex}`));
    lines.push("        ret", "");
  });

  lines.push("LoadFrameDuration:", "        ld a,(AnimationIndex)");
  animations.forEach((_, animationIndex) => lines.push(`        cp ${animationIndex}`, `        jp z,LoadFrameDuration${animationIndex}`));
  lines.push("        ret", "");
  animations.forEach((animation, animationIndex) => {
    lines.push(`LoadFrameDuration${animationIndex}:`, "        ld a,(FrameIndex)");
    animation.frameDurationsMs.forEach((duration, frameIndex) => {
      const ticks = Math.max(1, Math.min(255, Math.ceil(duration / 20)));
      lines.push(`        cp ${frameIndex}`, `        jp z,LoadDuration${animationIndex}_${frameIndex}`);
    });
    lines.push("        ret", "");
    animation.frameDurationsMs.forEach((duration, frameIndex) => {
      const ticks = Math.max(1, Math.min(255, Math.ceil(duration / 20)));
      lines.push(`LoadDuration${animationIndex}_${frameIndex}:`, `        ld a,${ticks}`, "        ld (TicksRemaining),a", "        ret", "");
    });
  });

  lines.push("AdvanceFrame:", "        ld a,(AnimationIndex)");
  animations.forEach((_, animationIndex) => lines.push(`        cp ${animationIndex}`, `        jp z,AdvanceFrame${animationIndex}`));
  lines.push("        ret", "");
  animations.forEach((animation, animationIndex) => {
    const frameCount = animation.frames.length;
    lines.push(`AdvanceFrame${animationIndex}:`);
    if (frameCount <= 1) {
      lines.push("        ret", "");
      return;
    }
    if (animation.playbackMode === "pingpong") {
      lines.push(
        "        ld a,(FrameDirection)",
        "        or a",
        `        jr nz,AdvanceFrame${animationIndex}Reverse`,
        "        ld a,(FrameIndex)",
        "        inc a",
        `        cp ${frameCount}`,
        `        jr c,AdvanceFrame${animationIndex}Store`,
        "        ld a,1",
        "        ld (FrameDirection),a",
        "        ld a,(FrameIndex)",
        "        dec a",
        `        jr AdvanceFrame${animationIndex}Store`,
        `AdvanceFrame${animationIndex}Reverse:`,
        "        ld a,(FrameIndex)",
        "        or a",
        `        jr z,AdvanceFrame${animationIndex}TurnForward`,
        "        dec a",
        `        jr AdvanceFrame${animationIndex}Store`,
        `AdvanceFrame${animationIndex}TurnForward:`,
        "        xor a",
        "        ld (FrameDirection),a",
        "        ld a,1",
        `AdvanceFrame${animationIndex}Store:`,
        "        ld (FrameIndex),a",
        "        ret",
        "",
      );
    } else {
      lines.push(
        "        ld a,(FrameIndex)",
        "        inc a",
        `        cp ${frameCount}`,
        `        jr c,AdvanceFrame${animationIndex}Store`,
        "        xor a",
        `AdvanceFrame${animationIndex}Store:`,
        "        ld (FrameIndex),a",
        "        ret",
        "",
      );
    }
  });

  lines.push(
    "WriteVRAM:",
    "        out ($99),a",
    "        ld a,$8E                    ; select VDP R#14 VRAM bank",
    "        out ($99),a",
    "        ld a,e",
    "        out ($99),a",
    "        ld a,d",
    "        and $3F",
    "        or $40                    ; set VRAM write address",
    "        out ($99),a",
    "WriteVRAMLoop:",
    "        ld a,(hl)",
    "        out ($98),a",
    "        inc hl",
    "        dec bc",
    "        ld a,b",
    "        or c",
    "        jr nz,WriteVRAMLoop",
    "        ret",
    "",
  );

  animations.forEach((animation, animationIndex) => {
    animation.frames.forEach((sprites, frameIndex) => {
      lines.push(`; Animation ${animationIndex + 1}: ${cleanComment(animation.name)}, frame ${frameIndex + 1}.`, `ShowFrame${animationIndex}_${frameIndex}:`);
      const frameData: string[] = [];
      sprites.slice(0, spriteCount).forEach((sprite, spriteIndex) => {
        const encoded = encodeMsx2ProjectSprite(sprite, size);
        const prefix = `Anim${animationIndex}Frame${frameIndex}Sprite${spriteIndex}`;
        const pattern = size === 16
          ? [...encoded.pattern.slice(0, 8), ...encoded.pattern.slice(16, 24), ...encoded.pattern.slice(8, 16), ...encoded.pattern.slice(24, 32)]
          : encoded.pattern.slice(0, 8);
        const patternAddress = 0x2000 + spriteIndex * spritePatternBytes;
        const colorAddress = 0x3000 + spriteIndex * 16;
        lines.push(
          `        ld hl,${prefix}Pattern`, `        ld de,$${patternAddress.toString(16).padStart(4, "0")}`,
          `        ld bc,$${pattern.length.toString(16).padStart(4, "0")}`, "        ld a,$07", "        call WriteVRAM",
          `        ld hl,${prefix}Colors`, `        ld de,$${colorAddress.toString(16).padStart(4, "0")}`,
          "        ld bc,$0010", "        ld a,$07", "        call WriteVRAM",
        );
        frameData.push(`${prefix}Pattern:`, formatAsmBytes(pattern), `${prefix}Colors:`, formatAsmBytes(encoded.colors.slice(0, 16)), "");
      });
      lines.push("        ret", "", ...frameData, "");
    });
  });

  lines.push("SpritePalette:", formatAsmBytes(paletteBytes), "", "SpriteAttributes:", `        db 80,112,0,0${spriteCount === 2 ? `, 80,112,${secondPatternIndex},0` : ""},216`, "");
  animations.forEach((animation, animationIndex) => {
    const titleRows = renderAsmPreviewTextRow(`ANIM ${animationIndex + 1}/${animations.length} ${animation.name}`);
    titleRows.forEach((bytes, row) => lines.push(`Title${animationIndex}Row${row}:`, formatAsmBytes(bytes)));
  });
  renderAsmPreviewTextRow("ARROWS: CHANGE ANIM").forEach((bytes, row) => lines.push(`ControlsSelectRow${row}:`, formatAsmBytes(bytes)));
  renderAsmPreviewTextRow("SPACE: PAUSE  ESC: RESTART").forEach((bytes, row) => lines.push(`DrawPauseTextRow${row}:`, formatAsmBytes(bytes)));
  renderAsmPreviewTextRow("SPACE: RESUME  ESC: RESTART").forEach((bytes, row) => lines.push(`DrawResumeTextRowsRow${row}:`, formatAsmBytes(bytes)));
  lines.push("", "        ds $C000-$,$FF");
  return lines.join("\n");
}

/** Emit a standalone MSXgl player source file for an exported MSX1 data header. */
export function exportMsx1PreviewC(size: SpriteSize, magnification: 1 | 2, animationIndex = 0): string {
  return `/*
 * MSX SpriteMate animation preview for MSX1 TMS9918A.
 * This standalone preview program uses MSXgl, including its print module.
 * Add "print" to LibModules in the MSXgl project configuration.
 * For MSX1, enable PRINT_USE_TEXT and disable PRINT_USE_BITMAP, PRINT_USE_VRAM,
 * and PRINT_USE_SPRITE in msxgl_config.h; set PRINT_COLOR_NUM to 1.
 * Save beside sprite-animation.h and build it as an MSX1 ROM with MSXgl.
 * Controls: Left/Right select animations, Space pauses/resumes, Escape restarts.
 */
#include "msxgl.h"
#include "sprite-animation.h"
#include "font/font_mgl_sample8.h"

/* Starts with the animation selected in SpriteMate, from its first frame. */
#define PREVIEW_ANIMATION_INDEX ${animationIndex}
/* Sprite positions can be adjusted here. */
#define PREVIEW_SPRITE_X 112
#define PREVIEW_SPRITE_Y 72

static const u8 g_PreviewSpriteSize = ${size};
static const u8 g_PreviewMagnification = ${magnification};
static const u8 g_SecondPatternIndex = ${size === 16 ? 4 : 1};
static const u16 g_FrameTickMs = 20; /* MSX1 default is 50 Hz. */

static const Msx1SpriteAnimation* g_Animation;
static u8 g_AnimationIndex = PREVIEW_ANIMATION_INDEX;
static u8 g_FrameIndex = 0;
static u8 g_PingPongReverse = 0;
static u16 g_FrameTimeLeft = 0;
static u8 g_PreviousLeft = 0;
static u8 g_PreviousRight = 0;
static u8 g_PreviousSpace = 0;
static u8 g_PreviousEscape = 0;
static u8 g_IsPaused = 0;

static void LoadSpritePattern(const u8* pattern, u8 firstIndex)
{
    if (g_PreviewSpriteSize == 16)
    {
        /* Data is exported left-to-right, top-to-bottom. TMS9918A stores
           16x16 pattern blocks as top-left, bottom-left, top-right, bottom-right. */
        VDP_LoadSpritePattern(pattern, firstIndex, 1);
        VDP_LoadSpritePattern(pattern + 16, firstIndex + 1, 1);
        VDP_LoadSpritePattern(pattern + 8, firstIndex + 2, 1);
        VDP_LoadSpritePattern(pattern + 24, firstIndex + 3, 1);
    }
    else
    {
        VDP_LoadSpritePattern(pattern, firstIndex, 1);
    }
}

static void ShowFrame(const Msx1SpriteFrame* frame)
{
    LoadSpritePattern(frame->pattern0, 0);
    VDP_SetSpriteSM1(0, PREVIEW_SPRITE_X, PREVIEW_SPRITE_Y, 0, frame->color0);

    if (sprite_count > 1)
    {
        LoadSpritePattern(frame->pattern1, g_SecondPatternIndex);
        VDP_SetSpriteSM1(1, PREVIEW_SPRITE_X, PREVIEW_SPRITE_Y,
                         g_SecondPatternIndex, frame->color1);
    }
    else
    {
        VDP_HideSprite(1);
    }
}

static void AdvanceFrame(void)
{
    if (g_Animation->frame_count < 2)
        return;

    if (!g_Animation->ping_pong)
    {
        g_FrameIndex = (g_FrameIndex + 1) % g_Animation->frame_count;
    }
    else if (!g_PingPongReverse)
    {
        if (g_FrameIndex + 1 >= g_Animation->frame_count)
        {
            g_PingPongReverse = 1;
            --g_FrameIndex;
        }
        else
        {
            ++g_FrameIndex;
        }
    }
    else if (g_FrameIndex == 0)
    {
        g_PingPongReverse = 0;
        ++g_FrameIndex;
    }
    else
    {
        --g_FrameIndex;
    }
}

static void DrawPlaybackStatus(void);

static void DrawAnimationInfo(void)
{
    Print_SetPosition(0, 0);
    Print_DrawText("                                ");
    Print_SetPosition(0, 0);
    Print_DrawText("ANIM ");
    Print_DrawInt(g_AnimationIndex + 1);
    Print_DrawText("/");
    Print_DrawInt(sprite_animation_count);
    Print_DrawText(" ");
    for (u8 i = 0; i < 21 && g_Animation->name[i]; ++i)
        Print_DrawChar(g_Animation->name[i]);
    DrawPlaybackStatus();
}

static void DrawPlaybackStatus(void)
{
    Print_SetPosition(0, 1);
    Print_DrawText(g_IsPaused ? "PAUSED - SPACE TO RESUME   " : "ARROWS SELECT  SPACE PAUSE ");
}

static void SelectAnimation(u8 index)
{
    g_AnimationIndex = index % sprite_animation_count;
    g_Animation = &sprite_animations[g_AnimationIndex];
    g_FrameIndex = 0;
    g_PingPongReverse = 0;
    ShowFrame(&g_Animation->frames[g_FrameIndex]);
    g_FrameTimeLeft = g_Animation->frames[g_FrameIndex].duration_ms;
    DrawAnimationInfo();
}

static void RestartAnimation(void)
{
    g_FrameIndex = 0;
    g_PingPongReverse = 0;
    ShowFrame(&g_Animation->frames[g_FrameIndex]);
    g_FrameTimeLeft = g_Animation->frames[g_FrameIndex].duration_ms;
}

void main(void)
{
    u8 spriteFlags = g_PreviewSpriteSize == 16 ? VDP_SPRITE_SIZE_16 : VDP_SPRITE_SIZE_8;
    if (g_PreviewMagnification == 2)
        spriteFlags |= VDP_SPRITE_SCALE_2;

    if (sprite_animation_count == 0)
        while (TRUE) Halt();
    if (g_AnimationIndex >= sprite_animation_count)
        g_AnimationIndex = 0;

    VDP_SetMode(VDP_MODE_GRAPHIC1);
    VDP_ClearVRAM();
    VDP_SetBackdropColor(1); /* MSX1 fixed palette color 1: black. */
    VDP_EnableVBlank(TRUE);
    VDP_SetSpriteTables(0x3800, 0x1B00);
    VDP_SetSpriteFlag(spriteFlags);
    VDP_HideAllSprites();
    Print_SetTextFont(g_Font_MGL_Sample8, 0);
    Print_SetColor(15, 1);

    SelectAnimation(g_AnimationIndex);
    while (TRUE)
    {
        Halt();
        {
            u8 left = Keyboard_IsKeyPressed(KEY_LEFT);
            u8 right = Keyboard_IsKeyPressed(KEY_RIGHT);
            u8 space = Keyboard_IsKeyPressed(KEY_SPACE);
            u8 escape = Keyboard_IsKeyPressed(KEY_ESC);
            u8 changedAnimation = FALSE;
            u8 restarted = FALSE;
            if (right && !g_PreviousRight)
            {
                SelectAnimation(g_AnimationIndex + 1);
                changedAnimation = TRUE;
            }
            else if (left && !g_PreviousLeft)
            {
                SelectAnimation(g_AnimationIndex == 0 ? sprite_animation_count - 1 : g_AnimationIndex - 1);
                changedAnimation = TRUE;
            }
            if (space && !g_PreviousSpace)
            {
                g_IsPaused = !g_IsPaused;
                DrawPlaybackStatus();
            }
            if (escape && !g_PreviousEscape)
            {
                RestartAnimation();
                restarted = TRUE;
            }
            g_PreviousLeft = left;
            g_PreviousRight = right;
            g_PreviousSpace = space;
            g_PreviousEscape = escape;
            if (changedAnimation || restarted || g_IsPaused)
                continue;
        }
        if (g_FrameTimeLeft > g_FrameTickMs)
        {
            g_FrameTimeLeft -= g_FrameTickMs;
        }
        else
        {
            AdvanceFrame();
            ShowFrame(&g_Animation->frames[g_FrameIndex]);
            g_FrameTimeLeft = g_Animation->frames[g_FrameIndex].duration_ms;
        }
    }
}
`;
}
