import { colorIndexToCss, colorIndexToHex, packRgb3, unpackRgb3 } from "./palette";
import { exportMsx2ProjectC } from "./exportC";
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
let project: Msx2Project = createMsx2Project(16);
let selectedRow = 0;
let selectedPaletteSlot = 1;
let selectedLayer = 0;
let drawing = false;

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

  let saved: Record<string, { left: number; top: number; width: number; height: number; collapsed?: boolean }> = {};
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
  if (window.innerWidth > 960) {
    for (const panel of panels) {
      const position = saved[panel.dataset.panel || ""];
      if (!position || ![position.left, position.top, position.width, position.height].every(Number.isFinite)) continue;
      panel.style.width = `${Math.min(Math.max(position.width, 320), Math.max(320, panel.parentElement!.clientWidth))}px`;
      panel.style.height = `${Math.max(position.height, 150)}px`;
      panel.style.left = `${Math.max(0, Math.min(position.left, panel.parentElement!.clientWidth - panel.offsetWidth))}px`;
      panel.style.top = `${Math.max(0, Math.min(position.top, panel.parentElement!.clientHeight - 45))}px`;
      panel.classList.toggle("collapsed", Boolean(position.collapsed));
      updateCollapseButton(panel, Boolean(position.collapsed));
    }
  }

  let topLayer = 2;
  for (const panel of panels) {
    const handle = panel.querySelector<HTMLElement>(".window-handle")!;
    panel.addEventListener("pointerdown", () => { panel.style.zIndex = String(++topLayer); });
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
  const guide = project.sprites[1 - selectedLayer];
  canvas.width = size * scale;
  canvas.height = size * scale;
  context.clearRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x * scale;
      const py = y * scale;
      context.fillStyle = (x + y) % 2 ? "#18212b" : "#202c38";
      context.fillRect(px, py, scale, scale);
      const guidePixel = guide.pixels[y][x] !== 0 && guide.scanlines[y].color !== 0;
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

function renderPreview(): void {
  const size = project.spriteSize;
  const scale = 12;
  previewCanvas.width = size * scale;
  previewCanvas.height = size * scale;
  for (let y = 0; y < size; y++) {
    const base = project.sprites[0];
    const overlay = project.sprites[1];
    const baseColor = base.scanlines[y].color;
    const overlayColor = overlay.scanlines[y].color;
    for (let x = 0; x < size; x++) {
      let color = 0;
      const basePixel = base.pixels[y][x] !== 0 && baseColor !== 0;
      const overlayPixel = overlay.pixels[y][x] !== 0 && overlayColor !== 0;
      if (basePixel && overlayPixel) color = overlay.scanlines[y].overlapMix ? baseColor | overlayColor : baseColor;
      else if (basePixel) color = baseColor;
      else if (overlayPixel) color = overlayColor;
      previewContext.fillStyle = color === 0
        ? ((x + y) % 2 ? "#18212b" : "#202c38")
        : colorIndexToCss(project.palette[color]);
      previewContext.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  const baseColor = project.sprites[0].scanlines[selectedRow].color;
  const overlayLine = project.sprites[1].scanlines[selectedRow];
  const result = overlayLine.overlapMix ? baseColor | overlayLine.color : baseColor;
  const code = (value: number) => `P${String(value).padStart(2, "0")}`;
  const bits = (value: number) => value.toString(2).padStart(4, "0");
  overlapFormula.textContent = overlayLine.overlapMix
    ? `${code(baseColor)} (${bits(baseColor)}) OR ${code(overlayLine.color)} (${bits(overlayLine.color)}) = ${code(result)} (${bits(result)})`
    : `CC off · ${code(baseColor)} has priority on row ${selectedRow + 1}`;
  overlapSwatch.style.backgroundColor = colorIndexToCss(project.palette[result]);
  overlapColor.textContent = `${code(result)} · ${colorIndexToHex(project.palette[result])}`;
}

function renderOutput(): void {
  try {
    const source = exportMsx2ProjectC(project.sprites, project.spriteSize, project.palette);
    const fragment = document.createDocumentFragment();
    const tokens = /(\/\*[\s\S]*?\*\/)|\b(const|u8)\b|\b0x[\da-fA-F]+\b|\b\d+\b/g;
    let cursor = 0;
    for (const match of source.matchAll(tokens)) {
      const index = match.index ?? 0;
      if (index > cursor) fragment.append(document.createTextNode(source.slice(cursor, index)));
      const token = match[0];
      const span = document.createElement("span");
      span.className = token.startsWith("/*") ? "syntax-comment" : token === "const" || token === "u8" ? "syntax-keyword" : "syntax-number";
      span.textContent = token;
      fragment.append(span);
      cursor = index + token.length;
    }
    if (cursor < source.length) fragment.append(document.createTextNode(source.slice(cursor)));
    output.replaceChildren(fragment);
    status.textContent = `${project.spriteSize}×${project.spriteSize} · two sprites and 16-slot palette data`;
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
  layerButtons.forEach((button, index) => {
    button.classList.toggle("active", index === selectedLayer);
    button.setAttribute("aria-pressed", String(index === selectedLayer));
  });
  renderPaletteSlots();
  renderRows();
  renderCanvas();
  renderPreview();
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
  const size = Number(sizePicker.value) as SpriteSize;
  const palette = project.palette;
  project = createMsx2Project(size);
  project.palette = palette;
  selectedLayer = 0;
  selectedRow = 0;
  render();
});

document.querySelector<HTMLButtonElement>("#save-project")!.addEventListener("click", () => {
  download("sprite-pair.msxproj", JSON.stringify(project, null, 2), "application/json");
});

document.querySelector<HTMLButtonElement>("#export-c")!.addEventListener("click", () => {
  download("sprite-pair.h", exportMsx2ProjectC(project.sprites, project.spriteSize, project.palette), "text/x-c");
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
    const sprites = loaded.sprites.slice(0, 2).map((sprite) => normalizeMsx2Sprite(sprite, size));
    if (sprites.some((sprite) => sprite.pixels.length !== size || sprite.pixels.some((row) => row.length !== size))) {
      throw new Error("Project sprite dimensions do not match the selected size.");
    }
    if (sprites.length === 1) sprites.push(createMsx2Project(size).sprites[1]);
    project = {
      format: "spritemate-msx",
      version: 1,
      target: "msx2-v9938-sm2",
      spriteSize: size,
      palette: normalizeMsx2Palette(loaded.palette),
      sprites,
    };
    sizePicker.value = String(size);
    selectedLayer = 0;
    selectedRow = 0;
    render();
    status.textContent = `Loaded ${file.name}`;
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "Could not open project.");
  } finally {
    input.value = "";
  }
});

render();
