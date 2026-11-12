import { colorIndexToCss, colorIndexToHex, packRgb3, unpackRgb3 } from "./palette";
import { exportMsx2AnimationC } from "./exportC";
import {
  createMsx2Project,
  normalizeMsx2Palette,
  normalizeMsx2Sprite,
  type Msx2Project,
} from "./project";
import type { SpriteSize } from "./hardware";

const canvas = document.querySelector<HTMLCanvasElement>("#sprite-canvas")!;
const context = canvas.getContext("2d")!;
const sizePicker = document.querySelector<HTMLSelectElement>("#sprite-size")!;
const modePicker = document.querySelector<HTMLSelectElement>("#sprite-mode")!;
const rowsElement = document.querySelector<HTMLTableSectionElement>("#scanline-rows")!;
const paletteSlotsElement = document.querySelector<HTMLDivElement>("#palette-slots")!;
const ccMapElement = document.querySelector<HTMLDivElement>("#cc-map-grid")!;
const output = document.querySelector<HTMLElement>("#export-output code")!;
const status = document.querySelector<HTMLElement>("#export-status")!;
const canvasStatus = document.querySelector<HTMLElement>("#canvas-status")!;
const baseRowGuide = document.querySelector<HTMLDivElement>("#base-row-guide")!;
const overlayRowGuide = document.querySelector<HTMLDivElement>("#overlay-row-guide")!;
const previewCanvas = document.querySelector<HTMLCanvasElement>("#overlap-preview")!;
const previewContext = previewCanvas.getContext("2d")!;
const overlapFormula = document.querySelector<HTMLElement>("#overlap-formula")!;
const overlapSwatch = document.querySelector<HTMLElement>("#overlap-swatch")!;
const overlapColor = document.querySelector<HTMLElement>("#overlap-color")!;
const previewTitle = document.querySelector<HTMLElement>("#preview-title")!;
const previewHint = document.querySelector<HTMLElement>("#preview-hint")!;
const frameStrip = document.querySelector<HTMLDivElement>("#frame-strip")!;
const playButton = document.querySelector<HTMLButtonElement>("#animation-play")!;
const frameDuration = document.querySelector<HTMLInputElement>("#frame-duration")!;
const frameDurationValue = document.querySelector<HTMLOutputElement>("#frame-duration-value")!;
const onionSkin = document.querySelector<HTMLInputElement>("#onion-skin")!;
const onionOpacity = document.querySelector<HTMLInputElement>("#onion-opacity")!;
const onionOpacityValue = document.querySelector<HTMLOutputElement>("#onion-opacity-value")!;
const animationFrameLabel = document.querySelector<HTMLElement>("#animation-frame-label")!;
const playbackModePicker = document.querySelector<HTMLSelectElement>("#animation-playback-mode")!;
const layerButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".layer-button"));
const picker = document.querySelector<HTMLDialogElement>("#palette-picker")!;
const rgbCube = document.querySelector<HTMLDivElement>("#rgb-cube")!;
const pickerSlotNumber = document.querySelector<HTMLElement>("#picker-slot-number")!;
const pickerSwatch = document.querySelector<HTMLElement>("#picker-swatch")!;
const pickerHex = document.querySelector<HTMLElement>("#picker-hex")!;
const channels = {
  r: document.querySelector<HTMLInputElement>("#red-slider")!,
  g: document.querySelector<HTMLInputElement>("#green-slider")!,
  b: document.querySelector<HTMLInputElement>("#blue-slider")!,
};
const channelOutputs = {
  r: document.querySelector<HTMLOutputElement>("#red-value")!,
  g: document.querySelector<HTMLOutputElement>("#green-value")!,
  b: document.querySelector<HTMLOutputElement>("#blue-value")!,
};
let project: Msx2Project;
let selectedRow = 0;
let selectedPaletteSlot = 1;
let selectedLayer = 0;
let drawing = false;
type EditorSettings = {
  spriteSize: SpriteSize;
  spriteMode: "single" | "pair";
  onionSkinEnabled: boolean;
  onionOpacity: number;
  frameDurationMs: number;
  playbackMode: "loop" | "pingpong";
};
const settingsKey = "spritemate-msx2-editor-settings";
function readEditorSettings(): Partial<EditorSettings> {
  try {
    const value = JSON.parse(localStorage.getItem(settingsKey) || "null") as Partial<EditorSettings> | null;
    if (!value || typeof value !== "object") return {};
    return {
      ...(value.spriteSize === 8 || value.spriteSize === 16 ? { spriteSize: value.spriteSize } : {}),
      ...(value.spriteMode === "single" || value.spriteMode === "pair" ? { spriteMode: value.spriteMode } : {}),
      ...(typeof value.onionSkinEnabled === "boolean" ? { onionSkinEnabled: value.onionSkinEnabled } : {}),
      ...(Number.isFinite(value.onionOpacity) ? { onionOpacity: Math.max(10, Math.min(60, Math.round(value.onionOpacity! / 5) * 5)) } : {}),
      ...(Number.isFinite(value.frameDurationMs) ? { frameDurationMs: Math.max(80, Math.min(1000, Math.round(value.frameDurationMs! / 20) * 20)) } : {}),
      ...(value.playbackMode === "loop" || value.playbackMode === "pingpong" ? { playbackMode: value.playbackMode } : {}),
    };
  } catch { return {}; }
}
const savedEditorSettings = readEditorSettings();
project = createMsx2Project(savedEditorSettings.spriteSize ?? 16);
sizePicker.value = String(project.spriteSize);
let spriteMode: "single" | "pair" = savedEditorSettings.spriteMode ?? "pair";
let animationFrames = [project.sprites];
let currentFrameIndex = 0;
let previewFrameIndex = 0;
let frameDurationMs = savedEditorSettings.frameDurationMs ?? 180;
let playbackTimer: number | null = null;
let playbackMode: "loop" | "pingpong" = savedEditorSettings.playbackMode ?? "loop";
let playbackDirection: 1 | -1 = 1;
onionSkin.checked = savedEditorSettings.onionSkinEnabled ?? false;
onionOpacity.value = String(savedEditorSettings.onionOpacity ?? 25);
let onionOpacityValuePercent = Number(onionOpacity.value);
modePicker.value = spriteMode;
frameDuration.value = String(frameDurationMs);
frameDurationValue.textContent = `${frameDurationMs} ms`;
onionOpacityValue.textContent = `${onionOpacityValuePercent}%`;
playbackModePicker.value = playbackMode;

function saveEditorSettings(): void {
  const settings: EditorSettings = {
    spriteSize: project.spriteSize,
    spriteMode,
    onionSkinEnabled: onionSkin.checked,
    onionOpacity: onionOpacityValuePercent,
    frameDurationMs,
    playbackMode,
  };
  try { localStorage.setItem(settingsKey, JSON.stringify(settings)); } catch { /* Storage can be disabled. */ }
}

const layoutKey = "spritemate-msx2-window-layout";
const panels = Array.from(document.querySelectorAll<HTMLElement>(".movable-panel"));

function updateCollapseButton(panel: HTMLElement, collapsed: boolean): void {
  const button = panel.querySelector<HTMLButtonElement>(".window-collapse");
  if (!button) return;
  button.textContent = collapsed ? "+" : "−";
  button.setAttribute("aria-expanded", String(!collapsed));
  button.setAttribute("aria-label", `${collapsed ? "Expand" : "Collapse"} ${panel.querySelector("h2")?.textContent || "panel"}`);
  button.title = collapsed ? "Expand panel" : "Collapse panel";
}

function saveWindowLayout(): void {
  if (window.innerWidth <= 960) return;
  const layout = Object.fromEntries(panels.map((panel) => [panel.dataset.panel, {
    left: panel.offsetLeft,
    top: panel.offsetTop,
    width: panel.offsetWidth,
    height: panel.classList.contains("collapsed")
      ? Number(panel.dataset.expandedHeight) || panel.offsetHeight
      : panel.offsetHeight,
    zIndex: Number(panel.style.zIndex) || 0,
    collapsed: panel.classList.contains("collapsed"),
  }]));
  try { localStorage.setItem(layoutKey, JSON.stringify(layout)); } catch { /* Storage can be disabled. */ }
}

function setupWindowLayout(): void {
  for (const panel of panels) {
    const handle = panel.querySelector<HTMLElement>(".window-handle");
    if (!handle || handle.querySelector(".window-collapse")) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "window-collapse";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const collapsed = !panel.classList.contains("collapsed");
      if (collapsed) panel.dataset.expandedHeight = String(panel.offsetHeight);
      panel.classList.toggle("collapsed", collapsed);
      updateCollapseButton(panel, collapsed);
      saveWindowLayout();
    });
    handle.append(button);
  }

  let saved: Record<string, { left: number; top: number; width: number; height: number; zIndex?: number; collapsed?: boolean }> = {};
  try { saved = JSON.parse(localStorage.getItem(layoutKey) || "{}"); } catch { /* Use default positions. */ }
  // Keep existing window positions when adding the preview window. Move only
  // the previous default export window so it does not cover the new preview.
  if (!saved.preview && saved.export?.left === 0 && saved.export.top === 762) {
    saved.export = { ...saved.export, top: 987 };
  }
  if (saved.palette && saved.palette.top === 0 && saved.palette.height < 540) {
    saved.palette = { ...saved.palette, height: 540 };
    if (saved.scanlines?.top === 316) saved.scanlines = { ...saved.scanlines, top: 556 };
    if (saved.export?.top === 987) saved.export = { ...saved.export, top: 1242 };
  }
  if (saved.preview?.left === 0 && saved.preview.top === 686 && saved.preview.height === 260) {
    saved.preview = { ...saved.preview, height: 285 };
    if (saved.export?.left === 0 && saved.export.top === 962) {
      saved.export = { ...saved.export, top: 987 };
    }
  }
  if (!saved["cc-map"] && saved.export && (saved.export.top === 987 || saved.export.top === 1242)) {
    saved.export = { ...saved.export, top: 1563 };
  }
  if (saved.preview?.left === 0 && saved.preview.top === 686 && saved.preview.height === 285) {
    saved.preview = { ...saved.preview, height: 420 };
  }
  if (saved["cc-map"]?.left === 0 && saved["cc-map"].top === 987) {
    saved["cc-map"] = { ...saved["cc-map"], top: 1122 };
  }
  if (saved.export?.left === 0 && saved.export.top === 1563) {
    saved.export = { ...saved.export, top: 1698 };
  }
  if (window.innerWidth > 960) {
    for (const panel of panels) {
      const position = saved[panel.dataset.panel || ""];
      if (!position || ![position.left, position.top, position.width, position.height].every(Number.isFinite)) continue;
      panel.style.width = `${Math.min(Math.max(position.width, 320), Math.max(320, panel.parentElement!.clientWidth))}px`;
      panel.style.height = `${Math.max(position.height, 150)}px`;
      panel.style.left = `${Math.max(0, Math.min(position.left, panel.parentElement!.clientWidth - panel.offsetWidth))}px`;
      panel.style.top = `${Math.max(0, Math.min(position.top, panel.parentElement!.clientHeight - 45))}px`;
      if (Number.isFinite(position.zIndex) && position.zIndex! > 0) panel.style.zIndex = String(position.zIndex);
      panel.classList.toggle("collapsed", Boolean(position.collapsed));
      updateCollapseButton(panel, Boolean(position.collapsed));
    }
  }

  let topLayer = Math.max(2, ...panels.map((panel) => Number(panel.style.zIndex) || 0));
  for (const panel of panels) {
    const handle = panel.querySelector<HTMLElement>(".window-handle")!;
    panel.addEventListener("pointerdown", () => {
      panel.style.zIndex = String(++topLayer);
      saveWindowLayout();
    });
    handle.addEventListener("pointerdown", (event) => {
      if (window.innerWidth <= 960 || event.button !== 0 || (event.target as HTMLElement).closest("button, select, input, a, label")) return;
      event.preventDefault();
      const startX = event.clientX;
      const startY = event.clientY;
      const left = panel.offsetLeft;
      const top = panel.offsetTop;
      handle.setPointerCapture(event.pointerId);
      const move = (moveEvent: PointerEvent) => {
        const maxLeft = Math.max(0, panel.parentElement!.clientWidth - panel.offsetWidth);
        const maxTop = Math.max(0, panel.parentElement!.clientHeight - 45);
        panel.style.left = `${Math.max(0, Math.min(left + moveEvent.clientX - startX, maxLeft))}px`;
        panel.style.top = `${Math.max(0, Math.min(top + moveEvent.clientY - startY, maxTop))}px`;
      };
      const stop = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", stop);
        handle.removeEventListener("pointercancel", stop);
        saveWindowLayout();
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", stop);
      handle.addEventListener("pointercancel", stop);
    });
  }
  const observer = new ResizeObserver(() => saveWindowLayout());
  panels.forEach((panel) => observer.observe(panel));
  window.addEventListener("pagehide", saveWindowLayout);
}

document.querySelector<HTMLButtonElement>("#reset-layout")!.addEventListener("click", () => {
  try { localStorage.removeItem(layoutKey); } catch { /* Storage can be disabled. */ }
  for (const panel of panels) {
    panel.style.left = "";
    panel.style.top = "";
    panel.style.width = "";
    panel.style.height = "";
    panel.style.zIndex = "";
    panel.classList.remove("collapsed");
    delete panel.dataset.expandedHeight;
    updateCollapseButton(panel, false);
  }
});
setupWindowLayout();

function activeSprite() {
  return project.sprites[selectedLayer];
}

function cloneFrame(frame: typeof project.sprites): typeof project.sprites {
  return frame.map((sprite) => ({
    name: sprite.name,
    pixels: sprite.pixels.map((row) => [...row]),
    scanlines: sprite.scanlines.map((line) => ({ ...line })),
  }));
}

function stopPlayback(): void {
  if (playbackTimer !== null) window.clearInterval(playbackTimer);
  playbackTimer = null;
  previewFrameIndex = currentFrameIndex;
  playbackDirection = 1;
  playButton.textContent = "Play";
  playButton.setAttribute("aria-pressed", "false");
}

function updateAnimationFrameLabel(): void {
  const previewIndex = playbackTimer === null ? currentFrameIndex : previewFrameIndex;
  animationFrameLabel.textContent = playbackTimer === null
    ? `Editing frame ${currentFrameIndex + 1} / ${animationFrames.length} · ${frameDurationMs} ms`
    : `Editing frame ${currentFrameIndex + 1} · Preview ${previewIndex + 1} / ${animationFrames.length} · ${frameDurationMs} ms · Playing`;
}

function renderFrameStrip(): void {
  if (frameStrip.childElementCount !== animationFrames.length) {
    frameStrip.replaceChildren();
    animationFrames.forEach((_, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "frame-button";
      button.textContent = String(index + 1).padStart(2, "0");
      button.addEventListener("click", () => {
        currentFrameIndex = index;
        project.sprites = animationFrames[index];
        // Keep playback running. The selected frame is edited on the main
        // canvas while the preview keeps following its independent playhead.
        render();
      });
      frameStrip.append(button);
    });
  }

  Array.from(frameStrip.querySelectorAll<HTMLButtonElement>(".frame-button")).forEach((button, index) => {
    const isEditing = index === currentFrameIndex;
    const isPlaying = playbackTimer !== null && index === previewFrameIndex;
    button.classList.toggle("editing", isEditing);
    button.classList.toggle("playing", isPlaying);
    button.setAttribute("aria-pressed", String(isEditing));
    button.setAttribute("aria-label", `Frame ${index + 1}${isEditing ? ", selected for editing" : ""}${isPlaying ? ", shown in preview" : ""}`);
    button.title = `Select frame ${index + 1} to edit${isPlaying ? " · currently in preview" : ""}`;
  });

  updateAnimationFrameLabel();
  playButton.disabled = animationFrames.length < 2;
  document.querySelector<HTMLButtonElement>("#frame-delete")!.disabled = animationFrames.length < 2;
  document.querySelector<HTMLButtonElement>("#frame-new")!.disabled = animationFrames.length >= 64;
  document.querySelector<HTMLButtonElement>("#frame-duplicate")!.disabled = animationFrames.length >= 64;
}

function addAnimationFrame(blank: boolean): void {
  if (animationFrames.length >= 64) return;
  stopPlayback();
  const sprites = blank ? createMsx2Project(project.spriteSize).sprites : cloneFrame(project.sprites);
  animationFrames.splice(currentFrameIndex + 1, 0, sprites);
  currentFrameIndex++;
  project.sprites = sprites;
  render();
}

function deleteAnimationFrame(): void {
  if (animationFrames.length < 2) return;
  stopPlayback();
  animationFrames.splice(currentFrameIndex, 1);
  currentFrameIndex = Math.min(currentFrameIndex, animationFrames.length - 1);
  project.sprites = animationFrames[currentFrameIndex];
  render();
}

function togglePlayback(): void {
  if (playbackTimer !== null) {
    stopPlayback();
    renderFrameStrip();
    renderPreview();
    return;
  }
  if (animationFrames.length < 2) return;
  previewFrameIndex = currentFrameIndex;
  playButton.textContent = "Pause";
  playButton.setAttribute("aria-pressed", "true");
  // Advance immediately so Play has visible feedback without waiting for the
  // first frame interval, then keep looping at the selected frame duration.
  advancePreview();
  playbackTimer = window.setInterval(advancePreview, frameDurationMs);
  renderFrameStrip();
  renderPreview();
}

function advancePreview(): void {
  if (playbackMode === "loop") {
    previewFrameIndex = (previewFrameIndex + 1) % animationFrames.length;
  } else {
    let nextIndex = previewFrameIndex + playbackDirection;
    if (nextIndex >= animationFrames.length) {
      playbackDirection = -1;
      nextIndex = animationFrames.length - 2;
    } else if (nextIndex < 0) {
      playbackDirection = 1;
      nextIndex = 1;
    }
    previewFrameIndex = nextIndex;
  }
  renderFrameStrip();
  renderPreview();
}

function setSpriteMode(mode: "single" | "pair"): void {
  stopPlayback();
  spriteMode = mode;
  if (spriteMode === "single" && selectedLayer === 1) selectedLayer = 0;
  modePicker.value = spriteMode;
  render();
  saveEditorSettings();
}

function renderRowColorGuides(): void {
  const base = project.sprites[0];
  const overlay = project.sprites[1];
  const buildGuide = (element: HTMLDivElement, layer: 0 | 1) => {
    element.replaceChildren();
    element.style.gridTemplateRows = `repeat(${project.spriteSize}, minmax(0, 1fr))`;
    for (let y = 0; y < project.spriteSize; y++) {
      const slot = project.sprites[layer].scanlines[y].color;
      const baseSlot = base.scanlines[y].color;
      const overlayLine = overlay.scanlines[y];
      const ccResult = overlayLine.overlapMix ? baseSlot | overlayLine.color : baseSlot;
      const effectiveSlot = layer === 0 ? slot : overlayLine.color;
      const hasOverlap = slot !== 0 && overlayLine.color !== 0
        && base.pixels[y].some((pixel, x) => pixel !== 0 && overlay.pixels[y][x] !== 0);
      const cell = document.createElement("div");
      cell.className = `row-guide-cell${y === selectedRow ? " selected" : ""}`;
      cell.style.backgroundColor = colorIndexToCss(project.palette[ccResult]);
      cell.style.color = ccResult > 7 ? "#071018" : "#f2f5f8";
      cell.title = hasOverlap && overlayLine.overlapMix
        ? `Row ${y + 1}: sprites overlap; CC P${String(baseSlot).padStart(2, "0")} OR P${String(overlayLine.color).padStart(2, "0")} = P${String(ccResult).padStart(2, "0")} ${colorIndexToHex(project.palette[ccResult])}`
        : `Row ${y + 1}: Sprite ${layer} P${String(effectiveSlot).padStart(2, "0")}; CC result P${String(ccResult).padStart(2, "0")} ${colorIndexToHex(project.palette[ccResult])}`;
      const code = document.createElement("span");
      code.textContent = `P${String(effectiveSlot).padStart(2, "0")}`;
      const swatch = document.createElement("span");
      swatch.className = "row-guide-swatch";
      swatch.style.backgroundColor = colorIndexToCss(project.palette[effectiveSlot]);
      cell.append(code, swatch);
      element.append(cell);
    }
  };
  buildGuide(baseRowGuide, 0);
  buildGuide(overlayRowGuide, 1);
}

function download(filename: string, data: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderCanvas(): void {
  const size = project.spriteSize;
  const scale = 24;
  const selected = activeSprite();
  const guide = spriteMode === "pair" ? project.sprites[1 - selectedLayer] : selected;
  const previousFrame = currentFrameIndex > 0 ? animationFrames[currentFrameIndex - 1] : undefined;
  const nextFrame = currentFrameIndex < animationFrames.length - 1 ? animationFrames[currentFrameIndex + 1] : undefined;
  canvas.width = size * scale;
  canvas.height = size * scale;
  context.clearRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x * scale;
      const py = y * scale;
      context.fillStyle = (x + y) % 2 ? "#18212b" : "#202c38";
      context.fillRect(px, py, scale, scale);
      if (onionSkin.checked && previousFrame && frameHasPixel(previousFrame, x, y)) {
        context.globalAlpha = onionOpacityValuePercent / 100;
        context.fillStyle = "#5bbaff";
        context.fillRect(px + 3, py + 3, scale - 6, scale - 6);
        context.globalAlpha = 1;
      }
      if (onionSkin.checked && nextFrame && frameHasPixel(nextFrame, x, y)) {
        context.globalAlpha = onionOpacityValuePercent / 100;
        context.fillStyle = "#ff936a";
        context.fillRect(px + 3, py + 3, scale - 6, scale - 6);
        context.globalAlpha = 1;
      }
      const guidePixel = spriteMode === "pair" && guide.pixels[y][x] !== 0 && guide.scanlines[y].color !== 0;
      const selectedPixel = selected.pixels[y][x] !== 0 && selected.scanlines[y].color !== 0;
      if (guidePixel) {
        context.globalAlpha = 0.45;
        context.fillStyle = colorIndexToCss(project.palette[guide.scanlines[y].color]);
        context.fillRect(px + 2, py + 2, scale - 4, scale - 4);
        context.globalAlpha = 1;
      }
      if (selectedPixel) {
        const inset = guidePixel ? 4 : 2;
        const baseColor = project.sprites[0].scanlines[y].color;
        const overlayLine = project.sprites[1].scanlines[y];
        const overlapColor = overlayLine.overlapMix ? baseColor | overlayLine.color : baseColor;
        context.fillStyle = colorIndexToCss(project.palette[guidePixel ? overlapColor : selected.scanlines[y].color]);
        context.fillRect(px + inset, py + inset, scale - 2 * inset, scale - 2 * inset);
      }
      context.strokeStyle = "#384757";
      context.lineWidth = 1;
      context.strokeRect(px + 0.5, py + 0.5, scale, scale);
    }
  }
  context.fillStyle = "#dce8f2";
  context.fillRect(0, selectedRow * scale, canvas.width, 1);
  const line = selected.scanlines[selectedRow];
  canvasStatus.textContent = `Sprite ${selectedLayer} · row ${selectedRow + 1} · P${String(line.color).padStart(2, "0")} · ${colorIndexToHex(project.palette[line.color])}`;
  renderRowColorGuides();
}

function frameHasPixel(frame: typeof project.sprites, x: number, y: number): boolean {
  const base = frame[0];
  const overlay = frame[1];
  return (base.pixels[y][x] !== 0 && base.scanlines[y].color !== 0)
    || (spriteMode === "pair" && overlay.pixels[y][x] !== 0 && overlay.scanlines[y].color !== 0);
}

function renderPreview(): void {
  const previewSprites = animationFrames[playbackTimer === null ? currentFrameIndex : previewFrameIndex] || project.sprites;
  const size = project.spriteSize;
  const scale = 12;
  previewCanvas.width = size * scale;
  previewCanvas.height = size * scale;
  for (let y = 0; y < size; y++) {
    const base = previewSprites[0];
    const overlay = previewSprites[1];
    const baseColor = base.scanlines[y].color;
    const overlayColor = overlay.scanlines[y].color;
    for (let x = 0; x < size; x++) {
      let color = 0;
      const basePixel = base.pixels[y][x] !== 0 && baseColor !== 0;
      const overlayPixel = spriteMode === "pair" && overlay.pixels[y][x] !== 0 && overlayColor !== 0;
      if (basePixel && overlayPixel) color = overlay.scanlines[y].overlapMix ? baseColor | overlayColor : baseColor;
      else if (basePixel) color = baseColor;
      else if (overlayPixel) color = overlayColor;
      previewContext.fillStyle = color === 0
        ? ((x + y) % 2 ? "#18212b" : "#202c38")
        : colorIndexToCss(project.palette[color]);
      previewContext.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  const baseColor = previewSprites[0].scanlines[selectedRow].color;
  const overlayLine = previewSprites[1].scanlines[selectedRow];
  const result = spriteMode === "single" ? baseColor : overlayLine.overlapMix ? baseColor | overlayLine.color : baseColor;
  const code = (value: number) => `P${String(value).padStart(2, "0")}`;
  const bits = (value: number) => value.toString(2).padStart(4, "0");
  overlapFormula.textContent = spriteMode === "single"
    ? `Sprite 0 · ${code(baseColor)} (${bits(baseColor)})`
    : overlayLine.overlapMix
      ? `${code(baseColor)} (${bits(baseColor)}) OR ${code(overlayLine.color)} (${bits(overlayLine.color)}) = ${code(result)} (${bits(result)})`
      : `CC off · ${code(baseColor)} has priority on row ${selectedRow + 1}`;
  overlapSwatch.style.backgroundColor = colorIndexToCss(project.palette[result]);
  overlapColor.textContent = `${code(result)} · ${colorIndexToHex(project.palette[result])}`;
  const previewIndex = playbackTimer === null ? currentFrameIndex : previewFrameIndex;
  updateAnimationFrameLabel();
}

function renderOutput(): void {
  try {
    const source = exportMsx2AnimationC(
      animationFrames,
      spriteMode === "single" ? 1 : 2,
      project.spriteSize,
      project.palette,
      frameDurationMs,
    );
    const fragment = document.createDocumentFragment();
    const tokens = /(\/\*[\s\S]*?\*\/)|\b(const|u8)\b|\b0x[\da-fA-F]+\b|\b\d+\b/g;
    let cursor = 0;
    for (const match of source.matchAll(tokens)) {
      const index = match.index ?? 0;
      if (index > cursor) fragment.append(document.createTextNode(source.slice(cursor, index)));
      const token = match[0];
      const span = document.createElement("span");
      if (token.startsWith("/*")) {
        const activeFrameMarker = `/* Animation frame ${currentFrameIndex + 1}, Sprite 0:`;
        span.className = token.startsWith(activeFrameMarker)
          ? "syntax-comment current-frame-source"
          : "syntax-comment";
      } else {
        span.className = token === "const" || token === "u8" ? "syntax-keyword" : "syntax-number";
      }
      span.textContent = token;
      fragment.append(span);
      cursor = index + token.length;
    }
    if (cursor < source.length) fragment.append(document.createTextNode(source.slice(cursor)));
    output.replaceChildren(fragment);
    status.textContent = `Editing frame ${currentFrameIndex + 1}/${animationFrames.length} · ${project.spriteSize}×${project.spriteSize} · ${spriteMode === "single" ? "one sprite" : "sprite pair"}`;
  } catch (error) {
    output.textContent = "";
    status.textContent = error instanceof Error ? error.message : "Could not encode sprite.";
  }
}

function renderCcMap(): void {
  ccMapElement.replaceChildren();
  const corner = document.createElement("div");
  corner.className = "cc-map-corner";
  corner.textContent = "S0\\S1";
  corner.title = "Sprite 0 slot by Sprite 1 slot";
  ccMapElement.append(corner);

  for (let overlaySlot = 0; overlaySlot < project.palette.length; overlaySlot++) {
    const header = document.createElement("div");
    header.className = "cc-map-axis overlay-axis";
    header.textContent = `P${String(overlaySlot).padStart(2, "0")}`;
    header.style.backgroundColor = colorIndexToCss(project.palette[overlaySlot]);
    header.style.color = overlaySlot > 7 ? "#071018" : "#f2f5f8";
    header.title = `Sprite 1: P${String(overlaySlot).padStart(2, "0")} · ${overlaySlot.toString(2).padStart(4, "0")} · ${colorIndexToHex(project.palette[overlaySlot])}`;
    ccMapElement.append(header);
  }

  for (let baseSlot = 0; baseSlot < project.palette.length; baseSlot++) {
    const header = document.createElement("div");
    header.className = "cc-map-axis base-axis";
    header.textContent = `P${String(baseSlot).padStart(2, "0")}`;
    header.style.backgroundColor = colorIndexToCss(project.palette[baseSlot]);
    header.style.color = baseSlot > 7 ? "#071018" : "#f2f5f8";
    header.title = `Sprite 0: P${String(baseSlot).padStart(2, "0")} · ${baseSlot.toString(2).padStart(4, "0")} · ${colorIndexToHex(project.palette[baseSlot])}`;
    ccMapElement.append(header);
    for (let overlaySlot = 0; overlaySlot < project.palette.length; overlaySlot++) {
      const result = baseSlot | overlaySlot;
      const cell = document.createElement("div");
      cell.className = "cc-map-cell";
      cell.setAttribute("role", "gridcell");
      cell.textContent = `P${String(result).padStart(2, "0")}`;
      cell.style.backgroundColor = colorIndexToCss(project.palette[result]);
      cell.style.color = result > 7 ? "#071018" : "#f2f5f8";
      cell.title = `P${String(baseSlot).padStart(2, "0")} (${baseSlot.toString(2).padStart(4, "0")}) OR P${String(overlaySlot).padStart(2, "0")} (${overlaySlot.toString(2).padStart(4, "0")}) = P${String(result).padStart(2, "0")} (${result.toString(2).padStart(4, "0")}) · ${colorIndexToHex(project.palette[result])}`;
      ccMapElement.append(cell);
    }
  }
}

function renderPaletteSlots(): void {
  paletteSlotsElement.replaceChildren();
  project.palette.forEach((colorIndex, slot) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `palette-slot${slot === 0 ? " transparent-slot" : ""}`;
    button.title = `Edit V9938 palette slot ${slot}: ${colorIndexToHex(colorIndex)}`;

    const swatch = document.createElement("span");
    swatch.className = "palette-swatch";
    swatch.style.backgroundColor = colorIndexToCss(colorIndex);
    const meta = document.createElement("span");
    meta.className = "slot-meta";
    const id = document.createElement("span");
    id.className = "slot-id";
    id.textContent = `P${String(slot).padStart(2, "0")}${slot === 0 ? " · transparent" : ""}`;
    const bits = document.createElement("span");
    bits.className = "slot-bits";
    bits.textContent = slot.toString(2).padStart(4, "0");
    const hex = document.createElement("span");
    hex.className = "slot-hex";
    hex.textContent = colorIndexToHex(colorIndex);
    meta.append(id, bits, hex);
    button.append(swatch, meta);
    button.addEventListener("click", () => openPalettePicker(slot));
    paletteSlotsElement.append(button);
  });
  renderCcMap();
}

function renderRows(): void {
  rowsElement.replaceChildren();
  activeSprite().scanlines.forEach((activeLine, y) => {
    const baseLine = project.sprites[0].scanlines[y];
    const overlayLine = project.sprites[1].scanlines[y];
    const row = document.createElement("tr");
    if (y === selectedRow) row.classList.add("selected");
    row.addEventListener("click", () => {
      selectedRow = y;
      renderRows();
      renderCanvas();
      renderPreview();
    });

    const number = document.createElement("td");
    number.textContent = String(y).padStart(2, "0");
    row.append(number);

    const addColorCell = (spriteIndex: 0 | 1) => {
      const line = project.sprites[spriteIndex].scanlines[y];
      const colorCell = document.createElement("td");
      const colorControl = document.createElement("div");
      colorControl.className = "scanline-color";
      const color = document.createElement("select");
      color.className = "color-select";
      color.setAttribute("aria-label", `Palette slot for Sprite ${spriteIndex}, scanline ${y}`);
      for (let index = 0; index < project.palette.length; index++) {
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = `P${String(index).padStart(2, "0")}`;
        if (line.color === index) option.selected = true;
        color.append(option);
      }
      const swatch = document.createElement("span");
      swatch.className = "line-swatch";
      swatch.style.backgroundColor = colorIndexToCss(project.palette[line.color]);
      swatch.title = `Sprite ${spriteIndex} · P${String(line.color).padStart(2, "0")} · ${colorIndexToHex(project.palette[line.color])}`;
      color.addEventListener("click", (event) => event.stopPropagation());
      color.addEventListener("change", (event) => {
        line.color = Number((event.currentTarget as HTMLSelectElement).value);
        renderRows();
        renderCanvas();
        renderPreview();
        renderOutput();
      });
      colorControl.append(color, swatch);
      colorCell.append(colorControl);
      row.append(colorCell);
    };
    addColorCell(0);
    addColorCell(1);

    const addFlag = (line: typeof activeLine, key: "overlapMix" | "collisionInhibit" | "earlyClock", label: string) => {
      const cell = document.createElement("td");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "flag";
      checkbox.checked = line[key];
      checkbox.setAttribute("aria-label", `${label} for scanline ${y}`);
      checkbox.addEventListener("click", (event) => event.stopPropagation());
      checkbox.addEventListener("change", (event) => {
        line[key] = (event.currentTarget as HTMLInputElement).checked;
        renderRows();
        renderCanvas();
        renderRowColorGuides();
        renderPreview();
        renderOutput();
      });
      cell.append(checkbox);
      row.append(cell);
    };
    addFlag(overlayLine, "overlapMix", "CC overlap color mixing for Sprite 1");
    addFlag(activeLine, "collisionInhibit", `IC conflict inhibit for Sprite ${selectedLayer}`);
    addFlag(activeLine, "earlyClock", `EC early clock shift for Sprite ${selectedLayer}`);

    const mixCell = document.createElement("td");
    const mixCode = baseLine.color | overlayLine.color;
    if (overlayLine.overlapMix && baseLine.color !== 0 && overlayLine.color !== 0) {
      const mix = document.createElement("span");
      mix.className = "mix-swatch";
      mix.style.backgroundColor = colorIndexToCss(project.palette[mixCode]);
      mix.textContent = `P${String(mixCode).padStart(2, "0")}`;
      mix.title = `CC: P${String(baseLine.color).padStart(2, "0")} OR P${String(overlayLine.color).padStart(2, "0")} = P${String(mixCode).padStart(2, "0")} · ${colorIndexToHex(project.palette[mixCode])}`;
      mixCell.append(mix);
    } else {
      mixCell.textContent = "—";
      mixCell.className = "mix-empty";
    }
    row.append(mixCell);
    rowsElement.append(row);
  });
}

function updatePickerFromIndex(colorIndex: number): void {
  const rgb = unpackRgb3(colorIndex);
  channels.r.value = String(rgb.r);
  channels.g.value = String(rgb.g);
  channels.b.value = String(rgb.b);
  channelOutputs.r.value = String(rgb.r);
  channelOutputs.g.value = String(rgb.g);
  channelOutputs.b.value = String(rgb.b);
  pickerSwatch.style.backgroundColor = colorIndexToCss(colorIndex);
  pickerHex.textContent = colorIndexToHex(colorIndex);
  rgbCube.querySelectorAll<HTMLButtonElement>(".color-choice.selected").forEach((button) => button.classList.remove("selected"));
  rgbCube.querySelector<HTMLButtonElement>(`.color-choice[data-color="${colorIndex}"]`)?.classList.add("selected");
}

function applyPickerRgb(): void {
  const rgb = {
    r: Number(channels.r.value),
    g: Number(channels.g.value),
    b: Number(channels.b.value),
  };
  const colorIndex = packRgb3(rgb);
  project.palette[selectedPaletteSlot] = colorIndex;
  updatePickerFromIndex(colorIndex);
  renderPaletteSlots();
  renderRows();
  renderCanvas();
  renderPreview();
  renderOutput();
}

function buildRgbCube(): void {
  rgbCube.replaceChildren();
  for (let r = 0; r < 8; r++) {
    const group = document.createElement("section");
    group.className = "rgb-group";
    const heading = document.createElement("div");
    heading.className = "rgb-group-title";
    heading.textContent = `RED ${r}`;
    const grid = document.createElement("div");
    grid.className = "rgb-grid";
    for (let g = 0; g < 8; g++) {
      for (let b = 0; b < 8; b++) {
        const colorIndex = packRgb3({ r, g, b });
        const button = document.createElement("button");
        button.type = "button";
        button.className = "color-choice";
        button.dataset.color = String(colorIndex);
        button.style.backgroundColor = colorIndexToCss(colorIndex);
        button.title = `R${r} G${g} B${b} · ${colorIndexToHex(colorIndex)} · ${colorIndex}`;
        button.setAttribute("aria-label", button.title);
        button.addEventListener("click", () => {
          project.palette[selectedPaletteSlot] = colorIndex;
          updatePickerFromIndex(colorIndex);
          renderPaletteSlots();
          renderRows();
          renderCanvas();
          renderPreview();
          renderOutput();
        });
        grid.append(button);
      }
    }
    group.append(heading, grid);
    rgbCube.append(group);
  }
}

function openPalettePicker(slot: number): void {
  selectedPaletteSlot = slot;
  pickerSlotNumber.textContent = String(slot).padStart(2, "0");
  updatePickerFromIndex(project.palette[slot]);
  picker.showModal();
}

function render(): void {
  document.body.classList.toggle("single-sprite", spriteMode === "single");
  previewTitle.textContent = spriteMode === "single" ? "Sprite preview" : "Overlap preview";
  previewHint.textContent = spriteMode === "single"
    ? "Single-sprite animation preview. The second sprite is retained if you switch back to pair mode."
    : "The color codes are OR'ed where both sprite pixels overlap and CC is set on sprite 1.";
  modePicker.value = spriteMode;
  layerButtons.forEach((button, index) => {
    button.classList.toggle("active", index === selectedLayer);
    button.setAttribute("aria-pressed", String(index === selectedLayer));
  });
  renderPaletteSlots();
  renderRows();
  renderCanvas();
  renderPreview();
  renderFrameStrip();
  renderOutput();
}

function drawAt(event: PointerEvent): void {
  const bounds = canvas.getBoundingClientRect();
  const x = Math.floor((event.clientX - bounds.left) / bounds.width * project.spriteSize);
  const y = Math.floor((event.clientY - bounds.top) / bounds.height * project.spriteSize);
  if (x < 0 || y < 0 || x >= project.spriteSize || y >= project.spriteSize) return;
  selectedRow = y;
  const erasing = event.button === 2 || (event.buttons & 2) !== 0 || event.shiftKey;
  activeSprite().pixels[y][x] = erasing ? 0 : 1;
  renderRows();
  renderCanvas();
  renderPreview();
  renderOutput();
}

for (const channel of Object.values(channels)) {
  channel.addEventListener("input", applyPickerRgb);
}
buildRgbCube();
document.querySelector<HTMLButtonElement>("#close-picker")!.addEventListener("click", () => picker.close());
layerButtons.forEach((button, index) => button.addEventListener("click", () => {
  selectedLayer = index;
  render();
}));
modePicker.addEventListener("change", () => setSpriteMode(modePicker.value as "single" | "pair"));
playButton.addEventListener("click", togglePlayback);
playbackModePicker.addEventListener("change", () => {
  playbackMode = playbackModePicker.value as "loop" | "pingpong";
  playbackDirection = 1;
  renderFrameStrip();
  renderPreview();
  saveEditorSettings();
});
document.querySelector<HTMLButtonElement>("#frame-new")!.addEventListener("click", () => addAnimationFrame(true));
document.querySelector<HTMLButtonElement>("#frame-duplicate")!.addEventListener("click", () => addAnimationFrame(false));
document.querySelector<HTMLButtonElement>("#frame-delete")!.addEventListener("click", deleteAnimationFrame);
frameDuration.addEventListener("input", () => {
  frameDurationMs = Number(frameDuration.value);
  frameDurationValue.textContent = `${frameDurationMs} ms`;
  if (playbackTimer !== null) {
    window.clearInterval(playbackTimer);
    playbackTimer = window.setInterval(advancePreview, frameDurationMs);
  }
  renderFrameStrip();
  renderPreview();
  renderOutput();
  saveEditorSettings();
});
onionSkin.addEventListener("change", () => {
  renderCanvas();
  saveEditorSettings();
});
onionOpacity.addEventListener("input", () => {
  onionOpacityValuePercent = Number(onionOpacity.value);
  onionOpacityValue.textContent = `${onionOpacityValuePercent}%`;
  renderCanvas();
  saveEditorSettings();
});

canvas.addEventListener("pointerdown", (event) => {
  drawing = true;
  canvas.setPointerCapture(event.pointerId);
  drawAt(event);
});
canvas.addEventListener("pointermove", (event) => {
  if (drawing && event.buttons) drawAt(event);
});
canvas.addEventListener("pointerup", () => { drawing = false; });
canvas.addEventListener("pointercancel", () => { drawing = false; });
canvas.addEventListener("contextmenu", (event) => event.preventDefault());

sizePicker.addEventListener("change", () => {
  stopPlayback();
  const size = Number(sizePicker.value) as SpriteSize;
  const palette = project.palette;
  project = createMsx2Project(size);
  project.palette = palette;
  animationFrames = [project.sprites];
  currentFrameIndex = 0;
  selectedLayer = 0;
  selectedRow = 0;
  render();
  saveEditorSettings();
});

document.querySelector<HTMLButtonElement>("#save-project")!.addEventListener("click", () => {
  project.spriteMode = spriteMode;
  project.animationFrames = animationFrames;
  project.frameDurationMs = frameDurationMs;
  project.currentFrameIndex = currentFrameIndex;
  project.playbackMode = playbackMode;
  project.onionSkinEnabled = onionSkin.checked;
  project.onionOpacity = onionOpacityValuePercent;
  download("sprite-animation.msxproj", JSON.stringify(project, null, 2), "application/json");
});

document.querySelector<HTMLButtonElement>("#export-c")!.addEventListener("click", () => {
  download("sprite-animation.h", exportMsx2AnimationC(animationFrames, spriteMode === "single" ? 1 : 2, project.spriteSize, project.palette, frameDurationMs), "text/x-c");
});

document.querySelector<HTMLInputElement>("#project-file")!.addEventListener("change", async (event) => {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const loaded = JSON.parse(await file.text()) as Partial<Msx2Project>;
    if (loaded.format !== "spritemate-msx" || loaded.target !== "msx2-v9938-sm2" || (loaded.spriteSize !== 8 && loaded.spriteSize !== 16)) {
      throw new Error("This is not a supported Spritemate MSX2 project.");
    }
    const size = loaded.spriteSize;
    if (!Array.isArray(loaded.sprites) || !loaded.sprites.length) throw new Error("Project has no sprites.");
    const normalizeFrame = (rawSprites: unknown): typeof project.sprites => {
      if (!Array.isArray(rawSprites) || rawSprites.length < 1 || rawSprites.length > 2) {
        throw new Error("Each animation frame must contain one or two sprites.");
      }
      const sprites = rawSprites.map((sprite) => normalizeMsx2Sprite(sprite as Msx2Project["sprites"][number], size));
      if (sprites.some((sprite) => sprite.pixels.length !== size || sprite.pixels.some((row) => !Array.isArray(row) || row.length !== size))) {
        throw new Error("Project sprite dimensions do not match the selected size.");
      }
      if (sprites.length === 1) sprites.push(createMsx2Project(size).sprites[1]);
      return sprites;
    };
    const sourceFrames = Array.isArray(loaded.animationFrames) && loaded.animationFrames.length
      ? loaded.animationFrames
      : [loaded.sprites];
    if (sourceFrames.length > 64) throw new Error("Animations can contain up to 64 frames.");
    animationFrames = sourceFrames.map(normalizeFrame);
    currentFrameIndex = Math.max(0, Math.min(
      Number.isInteger(loaded.currentFrameIndex) ? loaded.currentFrameIndex! : 0,
      animationFrames.length - 1,
    ));
    const loadedFrameDuration = Number(loaded.frameDurationMs);
    frameDurationMs = Number.isFinite(loadedFrameDuration)
      ? Math.round(Math.max(80, Math.min(1000, loadedFrameDuration)) / 20) * 20
      : savedEditorSettings.frameDurationMs ?? 180;
    frameDuration.value = String(frameDurationMs);
    frameDurationValue.textContent = `${frameDurationMs} ms`;
    spriteMode = loaded.spriteMode === "single" || loaded.spriteMode === "pair"
      ? loaded.spriteMode
      : loaded.sprites.length === 1 ? "single" : "pair";
    modePicker.value = spriteMode;
    playbackMode = loaded.playbackMode === "loop" || loaded.playbackMode === "pingpong"
      ? loaded.playbackMode
      : savedEditorSettings.playbackMode ?? "loop";
    playbackModePicker.value = playbackMode;
    onionSkin.checked = typeof loaded.onionSkinEnabled === "boolean"
      ? loaded.onionSkinEnabled
      : savedEditorSettings.onionSkinEnabled ?? false;
    onionOpacityValuePercent = Number.isFinite(loaded.onionOpacity)
      ? Math.max(10, Math.min(60, Math.round(loaded.onionOpacity! / 5) * 5))
      : savedEditorSettings.onionOpacity ?? 25;
    onionOpacity.value = String(onionOpacityValuePercent);
    onionOpacityValue.textContent = `${onionOpacityValuePercent}%`;
    project = {
      format: "spritemate-msx",
      version: 1,
      target: "msx2-v9938-sm2",
      spriteSize: size,
      palette: normalizeMsx2Palette(loaded.palette),
      sprites: animationFrames[currentFrameIndex],
    };
    sizePicker.value = String(size);
    selectedLayer = 0;
    selectedRow = 0;
    stopPlayback();
    render();
    saveEditorSettings();
    status.textContent = `Loaded ${file.name}`;
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "Could not open project.");
  } finally {
    input.value = "";
  }
});

render();
