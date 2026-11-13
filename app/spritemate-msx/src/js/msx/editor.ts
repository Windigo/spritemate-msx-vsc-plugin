import { colorIndexToCss, colorIndexToHex, DEFAULT_PALETTE, MSX1_PALETTE, packRgb3, unpackRgb3 } from "./palette";
import { exportMsx1Animation, exportMsx2AnimationAsm, exportMsx2AnimationBasic, exportMsx2AnimationC } from "./exportC";
import {
  createMsx2Project,
  normalizeMsx2Palette,
  normalizeMsx2Sprite,
  type Msx2Animation,
  type Msx2Project,
} from "./project";
import type { SpriteSize } from "./hardware";

declare const __SPRITEMATE_VERSION__: string;
declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

const canvas = document.querySelector<HTMLCanvasElement>("#sprite-canvas")!;
const context = canvas.getContext("2d")!;
const sizePicker = document.querySelector<HTMLSelectElement>("#sprite-size")!;
const targetPicker = document.querySelector<HTMLSelectElement>("#sprite-target")!;
const magnificationPicker = document.querySelector<HTMLSelectElement>("#sprite-magnification")!;
const msx1ColorSettings = document.querySelector<HTMLDivElement>("#msx1-color-settings")!;
const modePicker = document.querySelector<HTMLSelectElement>("#sprite-mode")!;
const previewSizePicker = document.querySelector<HTMLSelectElement>("#preview-size")!;
const editorVersion = document.querySelector<HTMLElement>("#editor-version")!;
const customEditorMode = document.querySelector<HTMLMetaElement>('meta[name="msxsm-custom-editor"]')?.content === "true";
const vscodeApi = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : null;
const rowsElement = document.querySelector<HTMLTableSectionElement>("#scanline-rows")!;
const paletteSlotsElement = document.querySelector<HTMLDivElement>("#palette-slots")!;
const ccMapElement = document.querySelector<HTMLDivElement>("#cc-map-grid")!;
const output = document.querySelector<HTMLElement>("#export-output code")!;
const exportFormat = document.querySelector<HTMLSelectElement>("#export-format")!;
const exportLanguage = document.querySelector<HTMLElement>("#export-language")!;
const exportSelectedButton = document.querySelector<HTMLButtonElement>("#export-selected")!;
const baseRowGuide = document.querySelector<HTMLDivElement>("#base-row-guide")!;
const overlayRowGuide = document.querySelector<HTMLDivElement>("#overlay-row-guide")!;
const previewCanvas = document.querySelector<HTMLCanvasElement>("#overlap-preview")!;
const previewContext = previewCanvas.getContext("2d")!;
const animationTracks = document.querySelector<HTMLDivElement>("#animation-tracks")!;
const playButton = document.querySelector<HTMLButtonElement>("#animation-play")!;
const frameDuration = document.querySelector<HTMLInputElement>("#frame-duration")!;
const frameDurationValue = document.querySelector<HTMLOutputElement>("#frame-duration-value")!;
const uniformFrameDurationToggle = document.querySelector<HTMLInputElement>("#duration-all-frames")!;
const onionSkin = document.querySelector<HTMLInputElement>("#onion-skin")!;
const onionOpacity = document.querySelector<HTMLInputElement>("#onion-opacity")!;
const onionOpacityValue = document.querySelector<HTMLOutputElement>("#onion-opacity-value")!;
const animationFrameLabel = document.querySelector<HTMLElement>("#animation-frame-label")!;
const playbackModePicker = document.querySelector<HTMLSelectElement>("#animation-playback-mode")!;
const infoDialog = document.querySelector<HTMLDialogElement>("#info-dialog")!;
const helpDialog = document.querySelector<HTMLDialogElement>("#help-dialog")!;
const topbarMenu = document.querySelector<HTMLDetailsElement>("#topbar-menu")!;
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
editorVersion.textContent = `v${__SPRITEMATE_VERSION__}`;
document.title = `MSX SpriteMate v${__SPRITEMATE_VERSION__}`;
let selectedRow = 0;
let selectedPaletteSlot = 1;
let selectedLayer = 0;
let drawing = false;
type EditorSettings = {
  target: "msx1" | "msx2";
  magnification: 1 | 2;
  previewSize: 0.75 | 1 | 1.5;
  uniformFrameDuration: boolean;
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
      ...(value.target === "msx1" || value.target === "msx2" ? { target: value.target } : {}),
      ...(value.magnification === 1 || value.magnification === 2 ? { magnification: value.magnification } : {}),
      ...(value.previewSize === 0.75 || value.previewSize === 1 || value.previewSize === 1.5 ? { previewSize: value.previewSize } : {}),
      ...(typeof value.uniformFrameDuration === "boolean" ? { uniformFrameDuration: value.uniformFrameDuration } : {}),
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
let msxTarget: "msx1" | "msx2" = savedEditorSettings.target ?? "msx2";
let previewSize: 0.75 | 1 | 1.5 = savedEditorSettings.previewSize ?? 1;
let msx2Palette = [...project.palette];
project.target = msxTarget === "msx1" ? "msx1-tms9918a" : "msx2-v9938-sm2";
project.magnification = savedEditorSettings.magnification ?? 1;
magnificationPicker.value = String(project.magnification);
previewSizePicker.value = String(previewSize);
project.palette = msxTarget === "msx1" ? [...MSX1_PALETTE] : [...DEFAULT_PALETTE];
targetPicker.value = msxTarget;
sizePicker.value = String(project.spriteSize);
let spriteMode: "single" | "pair" = savedEditorSettings.spriteMode ?? "pair";
let animationFrames = [project.sprites];
let currentFrameIndex = 0;
let previewFrameIndex = 0;
let frameDurationMs = savedEditorSettings.frameDurationMs ?? 180;
let frameDurationsMs = [frameDurationMs];
let playbackTimer: number | null = null;
let isPlaying = false;
let playbackMode: "loop" | "pingpong" = savedEditorSettings.playbackMode ?? "loop";
let animations: Msx2Animation[] = [{ name: "Animation 1", frames: animationFrames, frameDurationsMs, uniformFrameDuration: savedEditorSettings.uniformFrameDuration ?? false, playbackMode }];
let activeAnimationIndex = 0;
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
    target: msxTarget,
    magnification: project.magnification ?? 1,
    previewSize,
    uniformFrameDuration: animations[activeAnimationIndex]?.uniformFrameDuration === true,
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
const panelsLayoutKey = `${layoutKey}-panels`;
const panels = Array.from(document.querySelectorAll<HTMLElement>(".movable-panel")).filter((panel) => panel.dataset.panel !== "export");
const codePanel = document.querySelector<HTMLElement>(".export-panel")!;
const desktopWorkspaceKey = "spritemate-desktop-panel-tabs";
const desktopActiveWorkspaceKey = "spritemate-desktop-active-tab";
type WindowLayoutEntry = { left: number; top: number; width: number; height: number; zIndex?: number; collapsed?: boolean };
type WindowLayout = Record<string, WindowLayoutEntry>;
function readWindowLayout(workspace: "work" | "panels" = "work"): WindowLayout {
  const key = workspace === "panels" ? panelsLayoutKey : layoutKey;
  try {
    const stored = localStorage.getItem(key);
    if (stored !== null) return JSON.parse(stored) as WindowLayout;
    if (workspace === "panels") return readWindowLayout("work");
  } catch { /* Fall back to the legacy layout if the workspace has none. */ }
  return {};
}

function writeWindowLayout(workspace: "work" | "panels", layout: WindowLayout): void {
  const key = workspace === "panels" ? panelsLayoutKey : layoutKey;
  try { localStorage.setItem(key, JSON.stringify(layout)); } catch { /* Storage can be disabled. */ }
}

function capturePanelLayout(panel: HTMLElement): WindowLayoutEntry {
  return {
    left: panel.offsetLeft,
    top: panel.offsetTop,
    width: panel.offsetWidth || Number.parseFloat(panel.style.width) || 320,
    height: panel.classList.contains("collapsed")
      ? Number(panel.dataset.expandedHeight) || panel.offsetHeight || Number.parseFloat(panel.style.height) || 150
      : panel.offsetHeight || Number.parseFloat(panel.style.height) || 150,
    zIndex: Number(panel.style.zIndex) || 0,
    collapsed: panel.classList.contains("collapsed"),
  };
}

function applyPanelLayout(panel: HTMLElement, position: WindowLayoutEntry): void {
  panel.style.width = `${Math.max(position.width, 320)}px`;
  panel.style.height = `${Math.max(position.height, 150)}px`;
  panel.style.left = `${Math.max(position.left, 0)}px`;
  panel.style.top = `${Math.max(position.top, 0)}px`;
  if (Number.isFinite(position.zIndex) && position.zIndex! > 0) panel.style.zIndex = String(position.zIndex);
  panel.classList.toggle("collapsed", Boolean(position.collapsed));
  updateCollapseButton(panel, Boolean(position.collapsed));
}

function restoreWorkspaceLayout(workspace: "work" | "panels"): void {
  if (window.innerWidth <= 960) return;
  const layout = readWindowLayout(workspace);
  for (const panel of panels) {
    if (panel.dataset.workspace !== workspace || panel.parentElement?.hidden === true) continue;
    const position = layout[panel.dataset.panel || ""];
    const parent = panel.parentElement;
    if (!parent || !position || ![position.left, position.top, position.width, position.height].every(Number.isFinite)) continue;
    applyPanelLayout(panel, position);
    const maxLeft = Math.max(0, parent.clientWidth - panel.offsetWidth);
    const maxTop = Math.max(0, parent.clientHeight - 45);
    panel.style.left = `${Math.max(0, Math.min(position.left, maxLeft))}px`;
    panel.style.top = `${Math.max(0, Math.min(position.top, maxTop))}px`;
  }
}
let movePanelToTab: ((panel: HTMLElement, tab: "work" | "panels") => void) | null = null;
let workspaceLayoutTransition = false;

function updateCollapseButton(panel: HTMLElement, collapsed: boolean): void {
  const button = panel.querySelector<HTMLButtonElement>(".window-collapse");
  if (!button) return;
  button.textContent = collapsed ? "+" : "−";
  button.setAttribute("aria-expanded", String(!collapsed));
  button.setAttribute("aria-label", `${collapsed ? "Expand" : "Collapse"} ${panel.querySelector("h2")?.textContent || "panel"}`);
  button.title = collapsed ? "Expand panel" : "Collapse panel";
}

function updateMoveButtonLabel(button: HTMLButtonElement, destination: string): void {
  const arrow = document.createElement("span");
  arrow.className = "move-tab-arrow";
  arrow.textContent = "↑";
  const label = document.createElement("span");
  label.textContent = destination;
  button.replaceChildren(arrow, label);
}

function saveWindowLayout(): void {
  if (window.innerWidth <= 960 || workspaceLayoutTransition) return;
  let workspace: "work" | "panels";
  try { workspace = localStorage.getItem(desktopActiveWorkspaceKey) === "panels" ? "panels" : "work"; }
  catch { workspace = "work"; }
  const layout = readWindowLayout(workspace);
  const visiblePanels = panels.filter((panel) => panel.dataset.workspace === workspace && panel.parentElement?.hidden !== true);
  for (const panel of visiblePanels) layout[panel.dataset.panel || ""] = capturePanelLayout(panel);
  writeWindowLayout(workspace, layout);
}

function setupWindowLayout(): void {
  const workWorkspace = panels[0]?.parentElement as HTMLElement;
  if (workWorkspace) {
    const toolbar = document.createElement("div");
    toolbar.className = "workspace-toolbar";
    workWorkspace.closest("main")?.before(toolbar);

    const settingsBar = document.createElement("section");
    settingsBar.className = "workspace-settings-bar";
    settingsBar.setAttribute("aria-label", "Editor settings");
    const settingsTitle = document.createElement("strong");
    settingsTitle.textContent = "Settings";
    settingsBar.append(settingsTitle);
    const editorPanel = panels.find((panel) => panel.dataset.panel === "editor");
    editorPanel?.querySelectorAll<HTMLElement>(".panel-heading .size-picker").forEach((control) => settingsBar.append(control));
    toolbar.append(settingsBar);

    const tabsRow = document.createElement("div");
    tabsRow.className = "workspace-tabs-row";
    const tabBar = document.createElement("nav");
    tabBar.className = "desktop-tab-bar";
    tabBar.setAttribute("aria-label", "Editor workspaces");
    const workTab = document.createElement("button");
    const panelsTab = document.createElement("button");
    const codeTab = document.createElement("button");
    workTab.type = panelsTab.type = codeTab.type = "button";
    workTab.className = "desktop-tab-button";
    panelsTab.className = "desktop-tab-button";
    codeTab.className = "desktop-tab-button";
    workTab.textContent = "Work";
    panelsTab.textContent = "Panels";
    codeTab.textContent = "Code";
    workTab.dataset.workspace = "work";
    panelsTab.dataset.workspace = "panels";
    codeTab.dataset.workspace = "code";
    tabBar.append(workTab, panelsTab, codeTab);
    tabsRow.append(tabBar);
    const resetButton = document.querySelector<HTMLButtonElement>("#reset-layout");
    if (resetButton) tabsRow.append(resetButton);
    toolbar.append(tabsRow);
    const panelsWorkspace = document.createElement("section");
    panelsWorkspace.className = "workspace desktop-panels-workspace";
    panelsWorkspace.setAttribute("aria-label", "Panels workspace");
    const codeWorkspace = document.createElement("section");
    codeWorkspace.className = "workspace desktop-code-workspace";
    codeWorkspace.setAttribute("aria-label", "Code workspace");
    workWorkspace.after(panelsWorkspace, codeWorkspace);
    codePanel.classList.remove("movable-panel", "panel");
    codePanel.querySelector(".window-handle")?.classList.remove("window-handle");
    codeWorkspace.append(codePanel);
    const workspaces = { work: workWorkspace, panels: panelsWorkspace, code: codeWorkspace };
    let placement: Record<string, "work" | "panels" | "code"> = {};
    try { placement = JSON.parse(localStorage.getItem(desktopWorkspaceKey) || "{}"); } catch { /* Use the work tab defaults. */ }
    try {
      if (localStorage.getItem(panelsLayoutKey) === null) {
        const legacyLayout = readWindowLayout("work");
        const migratedPanelsLayout: WindowLayout = {};
        for (const panel of panels) {
          const panelKey = panel.dataset.panel || "";
          if (placement[panelKey] === "panels" && legacyLayout[panelKey]) migratedPanelsLayout[panelKey] = legacyLayout[panelKey];
        }
        writeWindowLayout("panels", migratedPanelsLayout);
      }
    } catch { /* Keep default panel positions if storage is unavailable. */ }
    const savePlacement = () => {
      for (const panel of panels) {
        const panelKey = panel.dataset.panel || "";
        const tab = panel.dataset.workspace;
        if (tab === "work" || tab === "panels") placement[panelKey] = tab;
      }
      try { localStorage.setItem(desktopWorkspaceKey, JSON.stringify(placement)); } catch { /* Storage can be disabled. */ }
    };
    for (const panel of panels) {
      const panelKey = panel.dataset.panel || "";
      const savedTab = placement[panelKey];
      const tab = savedTab === "panels" ? "panels" : panelKey === "export" ? "code" : "work";
      panel.dataset.workspace = tab;
      placement[panelKey] = tab;
      workspaces[tab].append(panel);
    }
    delete placement.export;
    localStorage.setItem(desktopWorkspaceKey, JSON.stringify(placement));
    const tabs = { work: workTab, panels: panelsTab, code: codeTab };
    const showTab = (tab: "work" | "panels" | "code") => {
      Object.entries(workspaces).forEach(([name, workspace]) => {
        workspace.hidden = name !== tab;
        tabs[name as keyof typeof tabs].classList.toggle("active", name === tab);
        tabs[name as keyof typeof tabs].setAttribute("aria-selected", String(name === tab));
      });
      try { localStorage.setItem(desktopActiveWorkspaceKey, tab); } catch { /* Storage can be disabled. */ }
      savePlacement();
    };
    movePanelToTab = (panel, tab) => {
      const panelKey = panel.dataset.panel || "";
      const targetLayout = readWindowLayout(tab);
      const savedTargetPosition = targetLayout[panelKey];
      const nextPosition = savedTargetPosition ?? capturePanelLayout(panel);
      workspaces[tab].append(panel);
      panel.dataset.workspace = tab;
      applyPanelLayout(panel, nextPosition);
      if (!savedTargetPosition) {
        targetLayout[panelKey] = nextPosition;
        writeWindowLayout(tab, targetLayout);
      }
      placement[panelKey] = tab;
      savePlacement();
      const moveButton = panel.querySelector<HTMLButtonElement>(".window-move-tab");
      if (moveButton) {
        const destination = tab === "work" ? "Panels" : "Work";
        updateMoveButtonLabel(moveButton, destination);
        moveButton.title = `Move panel to ${destination} tab`;
        moveButton.setAttribute("aria-label", moveButton.title);
      }
      saveWindowLayout();
    };
    const activateTab = (tab: "work" | "panels" | "code") => {
      saveWindowLayout();
      workspaceLayoutTransition = true;
      showTab(tab);
      // Wait until the newly visible workspace has a real layout size before
      // restoring its positions. ResizeObserver can fire during this transition;
      // saveWindowLayout is paused so the old tab geometry cannot overwrite it.
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        if (tab !== "code") restoreWorkspaceLayout(tab);
        workspaceLayoutTransition = false;
        saveWindowLayout();
      }));
    };
    workTab.addEventListener("click", () => activateTab("work"));
    panelsTab.addEventListener("click", () => activateTab("panels"));
    codeTab.addEventListener("click", () => activateTab("code"));
    let savedWorkspace = "work";
    try {
      const value = localStorage.getItem(desktopActiveWorkspaceKey);
      if (value === "work" || value === "panels" || value === "code") savedWorkspace = value;
    } catch { /* Start in Work if storage is unavailable. */ }
    showTab(savedWorkspace as "work" | "panels" | "code");
    window.addEventListener("pagehide", savePlacement);
    panels.forEach((panel) => {
      const handle = panel.querySelector<HTMLElement>(".window-handle");
      if (!handle) return;
      let actions = handle.querySelector<HTMLDivElement>(".window-actions");
      if (!actions) {
        actions = document.createElement("div");
        actions.className = "window-actions";
        handle.append(actions);
      }
      const moveButton = document.createElement("button");
      moveButton.type = "button";
      moveButton.className = "window-move-tab";
      const updateMoveButton = () => {
        const panelKey = panel.dataset.panel || "";
        const current = placement[panelKey] ?? "work";
        const destination = current === "work" ? "panels" : "work";
        const destinationLabel = destination === "work" ? "Work" : "Panels";
        updateMoveButtonLabel(moveButton, destinationLabel);
        moveButton.title = `Move panel to ${destinationLabel} tab`;
        moveButton.setAttribute("aria-label", moveButton.title);
      };
      moveButton.addEventListener("click", (event) => {
        event.stopPropagation();
        const panelKey = panel.dataset.panel || "";
        const current = placement[panelKey] ?? "work";
        const destinationTab = current === "work" ? "panels" : "work";
        movePanelToTab?.(panel, destinationTab);
      });
      actions.append(moveButton);
      updateMoveButton();
    });
  }

  for (const panel of panels) {
    const handle = panel.querySelector<HTMLElement>(".window-handle");
    if (!handle) continue;
    let actions = handle.querySelector<HTMLDivElement>(".window-actions");
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "window-actions";
      handle.append(actions);
    }
    if (!actions.querySelector(".window-collapse")) {
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
      actions.append(button);
    }
    updateCollapseButton(panel, panel.classList.contains("collapsed"));
  }

  const saved = readWindowLayout("work");
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
  if (saved["cc-map"]?.left === 0 && saved["cc-map"].top === 1122) {
    saved["cc-map"] = { ...saved["cc-map"], top: 987 };
  }
  if (saved.export?.left === 0 && saved.export.top === 1563) {
    saved.export = { ...saved.export, top: 1698 };
  }
  if (window.innerWidth > 960) {
    for (const panel of panels) {
      if (panel.parentElement?.hidden === true) continue;
      const workspace = panel.dataset.workspace === "panels" ? "panels" : "work";
      const positions = workspace === "panels" ? readWindowLayout("panels") : saved;
      const position = positions[panel.dataset.panel || ""];
      if (!position || ![position.left, position.top, position.width, position.height].every(Number.isFinite)) continue;
      applyPanelLayout(panel, position);
      panel.style.width = `${Math.min(Math.max(position.width, 320), Math.max(320, panel.parentElement!.clientWidth))}px`;
      panel.style.left = `${Math.max(0, Math.min(position.left, panel.parentElement!.clientWidth - panel.offsetWidth))}px`;
      panel.style.top = `${Math.max(0, Math.min(position.top, panel.parentElement!.clientHeight - 45))}px`;
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
        const dropTab = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest<HTMLElement>(".desktop-tab-button[data-workspace]");
        document.querySelectorAll(".desktop-tab-button.drop-target").forEach((tab) => tab.classList.remove("drop-target"));
        dropTab?.classList.add("drop-target");
      };
      const stop = (upEvent: PointerEvent) => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", stop);
        handle.removeEventListener("pointercancel", stop);
        const dropTab = document.elementFromPoint(upEvent.clientX, upEvent.clientY)?.closest<HTMLElement>(".desktop-tab-button[data-workspace]");
        document.querySelectorAll(".desktop-tab-button.drop-target").forEach((tab) => tab.classList.remove("drop-target"));
        const destination = dropTab?.dataset.workspace;
        if (destination === "work" || destination === "panels") movePanelToTab?.(panel, destination);
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
  let workspace: "work" | "panels";
  try { workspace = localStorage.getItem(desktopActiveWorkspaceKey) === "panels" ? "panels" : "work"; }
  catch { workspace = "work"; }
  const visiblePanels = panels.filter((panel) => panel.dataset.workspace === workspace
    && panel.parentElement?.hidden !== true
    && getComputedStyle(panel).display !== "none");
  const layout = readWindowLayout(workspace);
  for (const panel of visiblePanels) {
    panel.style.left = "";
    panel.style.top = "";
    panel.style.width = "";
    panel.style.height = "";
    panel.style.zIndex = "";
    panel.classList.remove("collapsed");
    delete panel.dataset.expandedHeight;
    updateCollapseButton(panel, false);
  }
  const panelWorkspace = visiblePanels[0]?.parentElement;
  if (panelWorkspace && window.innerWidth > 960 && visiblePanels.length > 0) {
    const columns = visiblePanels.length === 1 ? 1 : 2;
    const gap = 16;
    const columnWidth = Math.max(320, Math.floor((panelWorkspace.clientWidth - gap * (columns - 1)) / columns));
    const columnTops = Array<number>(columns).fill(0);
    for (const panel of visiblePanels) {
      const column = columnTops.indexOf(Math.min(...columnTops));
      panel.style.width = `${columnWidth}px`;
      panel.style.left = `${column * (columnWidth + gap)}px`;
      panel.style.top = `${columnTops[column]}px`;
      columnTops[column] += panel.offsetHeight + gap;
      layout[panel.dataset.panel || ""] = capturePanelLayout(panel);
    }
  } else {
    for (const panel of visiblePanels) delete layout[panel.dataset.panel || ""];
  }
  if (codePanel.parentElement?.hidden !== true) {
    codePanel.scrollTop = 0;
    codePanel.querySelector("pre")?.scrollTo(0, 0);
  }
  writeWindowLayout(workspace, layout);
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
    msx1EarlyClock: sprite.msx1EarlyClock === true,
  }));
}

function stopPlayback(): void {
  if (playbackTimer !== null) window.clearTimeout(playbackTimer);
  playbackTimer = null;
  isPlaying = false;
  previewFrameIndex = currentFrameIndex;
  playbackDirection = 1;
  playButton.textContent = "Play";
  playButton.setAttribute("aria-pressed", "false");
}

function updateAnimationFrameLabel(): void {
  const animationName = animations[activeAnimationIndex]?.name ?? "Animation";
  const editingDuration = frameDurationsMs[currentFrameIndex] ?? frameDurationMs;
  animationFrameLabel.textContent = isPlaying
    ? `${animationName} · Editing ${currentFrameIndex + 1} (${editingDuration} ms) · Preview ${previewFrameIndex + 1}/${animationFrames.length} (${frameDurationsMs[previewFrameIndex] ?? frameDurationMs} ms) · Playing`
    : `${animationName} · Editing frame ${currentFrameIndex + 1}/${animationFrames.length} · ${editingDuration} ms`;
}

const frameDragType = "application/x-spritemate-msx-frame";

function renderFrameStrip(): void {
  const needsRebuild = animationTracks.childElementCount !== animations.length
    || animations.some((animation, index) =>
      animationTracks.children[index]?.querySelectorAll(".frame-button").length !== animation.frames.length);

  if (needsRebuild) {
    animationTracks.replaceChildren();
    animations.forEach((animation, animationIndex) => {
      const track = document.createElement("section");
      track.className = "animation-track";
      track.dataset.animationIndex = String(animationIndex);
      const heading = document.createElement("div");
      heading.className = "animation-track-heading";
      heading.addEventListener("click", (event) => {
        if ((event.target as HTMLElement).closest("input, button")) return;
        activateAnimation(animationIndex);
      });

      const name = document.createElement("input");
      name.className = "animation-name";
      name.type = "text";
      name.maxLength = 32;
      name.setAttribute("aria-label", `Animation ${animationIndex + 1} name`);
      name.addEventListener("change", () => {
        animation.name = name.value.trim().slice(0, 32) || `Animation ${animationIndex + 1}`;
        name.value = animation.name;
        updateAnimationFrameLabel();
        renderOutput();
      });

      const animationActions = document.createElement("div");
      animationActions.className = "animation-management-actions";
      const frameActions = document.createElement("div");
      frameActions.className = "animation-frame-actions";
      const addButton = document.createElement("button");
      addButton.type = "button";
      addButton.dataset.action = "add-frame";
      addButton.className = "secondary";
      addButton.textContent = "+ Frame";
      addButton.title = `Add a blank frame to ${animation.name}`;
      addButton.addEventListener("click", () => {
        activateAnimation(animationIndex);
        addAnimationFrame(true);
      });
      const duplicateButton = document.createElement("button");
      duplicateButton.type = "button";
      duplicateButton.dataset.action = "duplicate-frame";
      duplicateButton.className = "secondary";
      duplicateButton.textContent = "Duplicate frame";
      duplicateButton.title = `Duplicate the selected frame in ${animation.name}`;
      duplicateButton.addEventListener("click", () => {
        activateAnimation(animationIndex);
        addAnimationFrame(false);
      });
      const duplicateAnimationButton = document.createElement("button");
      duplicateAnimationButton.type = "button";
      duplicateAnimationButton.dataset.action = "duplicate-animation";
      duplicateAnimationButton.className = "secondary";
      duplicateAnimationButton.textContent = "Duplicate";
      duplicateAnimationButton.title = `Duplicate ${animation.name}, including all frames and timing`;
      duplicateAnimationButton.addEventListener("click", () => duplicateAnimation(animationIndex));
      const moveLeftButton = document.createElement("button");
      moveLeftButton.type = "button";
      moveLeftButton.dataset.action = "move-left";
      moveLeftButton.className = "secondary";
      moveLeftButton.textContent = "←";
      moveLeftButton.setAttribute("aria-label", "Move selected frame left");
      moveLeftButton.title = "Move selected frame left";
      moveLeftButton.addEventListener("click", () => {
        activateAnimation(animationIndex);
        moveAnimationFrame(-1);
      });
      const moveRightButton = document.createElement("button");
      moveRightButton.type = "button";
      moveRightButton.dataset.action = "move-right";
      moveRightButton.className = "secondary";
      moveRightButton.textContent = "→";
      moveRightButton.setAttribute("aria-label", "Move selected frame right");
      moveRightButton.title = "Move selected frame right";
      moveRightButton.addEventListener("click", () => {
        activateAnimation(animationIndex);
        moveAnimationFrame(1);
      });
      const deleteFrameButton = document.createElement("button");
      deleteFrameButton.type = "button";
      deleteFrameButton.dataset.action = "delete-frame";
      deleteFrameButton.className = "secondary";
      deleteFrameButton.textContent = "Delete frame";
      deleteFrameButton.addEventListener("click", () => {
        activateAnimation(animationIndex);
        deleteAnimationFrame();
      });
      const deleteAnimationButton = document.createElement("button");
      deleteAnimationButton.type = "button";
      deleteAnimationButton.dataset.action = "delete-animation";
      deleteAnimationButton.className = "secondary animation-remove";
      deleteAnimationButton.textContent = "Delete";
      deleteAnimationButton.setAttribute("aria-label", `Delete ${animation.name} animation`);
      deleteAnimationButton.title = `Delete ${animation.name} animation`;
      deleteAnimationButton.addEventListener("click", () => deleteAnimation(animationIndex));
      animationActions.append(duplicateAnimationButton, deleteAnimationButton);
      frameActions.append(addButton, duplicateButton, moveLeftButton, moveRightButton, deleteFrameButton);
      heading.append(name, animationActions);

      const strip = document.createElement("div");
      strip.className = "frame-strip";
      strip.setAttribute("role", "group");
      strip.setAttribute("aria-label", `${animation.name} frames`);
      animation.frames.forEach((_, frameIndex) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "frame-button";
        button.draggable = true;
        button.addEventListener("click", () => activateAnimation(animationIndex, frameIndex));
        button.addEventListener("dragstart", (event) => {
          if (!event.dataTransfer) return;
          event.dataTransfer.setData(frameDragType, JSON.stringify({ animationIndex, frameIndex }));
          event.dataTransfer.effectAllowed = "copy";
          track.classList.add("drag-source");
        });
        button.addEventListener("dragend", () => {
          track.classList.remove("drag-source", "drop-target");
          animationTracks.querySelectorAll(".drop-target").forEach((target) => target.classList.remove("drop-target"));
        });
        strip.append(button);
      });
      track.addEventListener("dragover", (event) => {
        if (!event.dataTransfer?.types.includes(frameDragType) || animation.frames.length >= 64) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        track.classList.add("drop-target");
      });
      track.addEventListener("dragleave", (event) => {
        if (!track.contains(event.relatedTarget as Node | null)) track.classList.remove("drop-target");
      });
      track.addEventListener("drop", (event) => {
        event.preventDefault();
        track.classList.remove("drop-target");
        const transfer = event.dataTransfer?.getData(frameDragType);
        if (!transfer) return;
        try {
          const source = JSON.parse(transfer) as { animationIndex: number; frameIndex: number };
          copyFrameToAnimation(source.animationIndex, source.frameIndex, animationIndex);
        } catch {
          return;
        }
      });
      track.append(heading, frameActions, strip);
      animationTracks.append(track);
    });
  }

  Array.from(animationTracks.children).forEach((trackElement, animationIndex) => {
    const animation = animations[animationIndex];
    const track = trackElement as HTMLElement;
    const isActiveAnimation = animationIndex === activeAnimationIndex;
    track.classList.toggle("active", isActiveAnimation);
    const name = track.querySelector<HTMLInputElement>(".animation-name")!;
    if (document.activeElement !== name) name.value = animation.name;
    const action = (name: string) => track.querySelector<HTMLButtonElement>(`[data-action="${name}"]`)!;
    action("add-frame").disabled = animation.frames.length >= 64;
    action("duplicate-frame").disabled = animation.frames.length >= 64;
    action("duplicate-animation").disabled = animations.length >= 16;
    action("delete-frame").disabled = animation.frames.length < 2;
    action("delete-animation").disabled = animations.length < 2;
    action("move-left").disabled = !isActiveAnimation || currentFrameIndex === 0;
    action("move-right").disabled = !isActiveAnimation || currentFrameIndex === animation.frames.length - 1;
    track.classList.toggle("drop-full", animation.frames.length >= 64);
    const strip = track.querySelector<HTMLDivElement>(".frame-strip")!;
    strip.setAttribute("aria-label", `${animation.name} frames`);
    Array.from(strip.querySelectorAll<HTMLButtonElement>(".frame-button")).forEach((button, frameIndex) => {
      const isEditing = isActiveAnimation && frameIndex === currentFrameIndex;
      const isPreviewing = isPlaying && isActiveAnimation && frameIndex === previewFrameIndex;
      const duration = animation.frameDurationsMs[frameIndex];
      button.textContent = String(frameIndex + 1).padStart(2, "0");
      button.classList.toggle("editing", isEditing);
      button.classList.toggle("playing", isPreviewing);
      button.setAttribute("aria-pressed", String(isEditing));
      button.setAttribute("aria-label", `${animation.name}, frame ${frameIndex + 1}, ${duration} milliseconds${isEditing ? ", selected for editing" : ""}${isPreviewing ? ", shown in preview" : ""}`);
      button.title = `${animation.name} · frame ${frameIndex + 1} · ${duration} ms${isPreviewing ? " · currently in preview" : ""}`;
    });
  });

  updateAnimationFrameLabel();
  playButton.disabled = animationFrames.length < 2 && !isPlaying;
  document.querySelector<HTMLButtonElement>("#animation-new")!.disabled = animations.length >= 16;
}

function activateAnimation(animationIndex: number, frameIndex?: number): void {
  const animation = animations[animationIndex];
  if (!animation) return;
  if (animationIndex !== activeAnimationIndex) {
    stopPlayback();
    activeAnimationIndex = animationIndex;
    animationFrames = animation.frames;
    frameDurationsMs = animation.frameDurationsMs;
    playbackMode = animation.playbackMode;
    playbackModePicker.value = playbackMode;
    playbackDirection = 1;
  }
  currentFrameIndex = frameIndex ?? animation.currentFrameIndex ?? 0;
  currentFrameIndex = Math.max(0, Math.min(currentFrameIndex, animation.frames.length - 1));
  animation.currentFrameIndex = currentFrameIndex;
  project.sprites = animationFrames[currentFrameIndex];
  render();
}

function createAnimation(): void {
  if (animations.length >= 16) return;
  stopPlayback();
  const sprites = createMsx2Project(project.spriteSize).sprites;
  const animation: Msx2Animation = {
    name: `Animation ${animations.length + 1}`,
    frames: [sprites],
    frameDurationsMs: [frameDurationMs],
    uniformFrameDuration: animations[activeAnimationIndex]?.uniformFrameDuration === true,
    playbackMode,
    currentFrameIndex: 0,
  };
  animations.push(animation);
  activeAnimationIndex = animations.length - 1;
  animationFrames = animation.frames;
  frameDurationsMs = animation.frameDurationsMs;
  currentFrameIndex = 0;
  project.sprites = sprites;
  render();
}

function duplicateAnimation(animationIndex: number): void {
  if (animations.length >= 16) return;
  const source = animations[animationIndex];
  if (!source) return;
  stopPlayback();
  const baseName = `${source.name} copy`.slice(0, 32);
  let name = baseName;
  let suffix = 2;
  while (animations.some((animation) => animation.name === name)) {
    const ending = ` ${suffix++}`;
    name = `${baseName.slice(0, 32 - ending.length)}${ending}`;
  }
  const duplicate: Msx2Animation = {
    name,
    frames: source.frames.map(cloneFrame),
    frameDurationsMs: [...source.frameDurationsMs],
    uniformFrameDuration: source.uniformFrameDuration === true,
    playbackMode: source.playbackMode,
    currentFrameIndex: 0,
  };
  animations.splice(animationIndex + 1, 0, duplicate);
  activeAnimationIndex = animationIndex + 1;
  animationFrames = duplicate.frames;
  frameDurationsMs = duplicate.frameDurationsMs;
  playbackMode = duplicate.playbackMode;
  playbackModePicker.value = playbackMode;
  currentFrameIndex = 0;
  project.sprites = duplicate.frames[0];
  render();
}

function copyFrameToAnimation(sourceAnimationIndex: number, sourceFrameIndex: number, targetAnimationIndex: number): void {
  const sourceAnimation = animations[sourceAnimationIndex];
  const targetAnimation = animations[targetAnimationIndex];
  if (!sourceAnimation || !targetAnimation || sourceAnimationIndex === targetAnimationIndex || targetAnimation.frames.length >= 64) return;
  const sourceFrame = sourceAnimation.frames[sourceFrameIndex];
  if (!sourceFrame) return;
  stopPlayback();
  targetAnimation.frames.push(cloneFrame(sourceFrame));
  const copiedDuration = targetAnimation.uniformFrameDuration
    ? targetAnimation.frameDurationsMs[0] ?? frameDurationMs
    : sourceAnimation.frameDurationsMs[sourceFrameIndex] ?? frameDurationMs;
  targetAnimation.frameDurationsMs.push(copiedDuration);
  targetAnimation.currentFrameIndex = targetAnimation.frames.length - 1;
  activateAnimation(targetAnimationIndex, targetAnimation.currentFrameIndex);
}

function deleteAnimation(animationIndex: number): void {
  if (animations.length < 2 || !animations[animationIndex]) return;
  stopPlayback();
  animations.splice(animationIndex, 1);
  if (animationIndex < activeAnimationIndex) activeAnimationIndex--;
  else if (animationIndex === activeAnimationIndex) activeAnimationIndex = Math.min(animationIndex, animations.length - 1);
  const active = animations[activeAnimationIndex];
  animationFrames = active.frames;
  frameDurationsMs = active.frameDurationsMs;
  playbackMode = active.playbackMode;
  playbackModePicker.value = playbackMode;
  currentFrameIndex = Math.max(0, Math.min(active.currentFrameIndex ?? 0, active.frames.length - 1));
  project.sprites = active.frames[currentFrameIndex];
  render();
}

function addAnimationFrame(blank: boolean): void {
  if (animationFrames.length >= 64) return;
  const wasPlaying = isPlaying;
  const insertIndex = currentFrameIndex + 1;
  const sprites = blank ? createMsx2Project(project.spriteSize).sprites : cloneFrame(project.sprites);
  animationFrames.splice(insertIndex, 0, sprites);
  frameDurationsMs.splice(insertIndex, 0, frameDurationMs);
  if (wasPlaying && previewFrameIndex >= insertIndex) previewFrameIndex++;
  currentFrameIndex = insertIndex;
  animations[activeAnimationIndex].currentFrameIndex = currentFrameIndex;
  project.sprites = sprites;
  if (wasPlaying) schedulePreviewAdvance();
  render();
}

function deleteAnimationFrame(): void {
  if (animationFrames.length < 2) return;
  const wasPlaying = isPlaying;
  const deletedIndex = currentFrameIndex;
  animationFrames.splice(deletedIndex, 1);
  frameDurationsMs.splice(deletedIndex, 1);
  currentFrameIndex = Math.min(deletedIndex, animationFrames.length - 1);
  if (wasPlaying) {
    if (previewFrameIndex === deletedIndex) previewFrameIndex = currentFrameIndex;
    else if (previewFrameIndex > deletedIndex) previewFrameIndex--;
    previewFrameIndex = Math.min(previewFrameIndex, animationFrames.length - 1);
  }
  animations[activeAnimationIndex].currentFrameIndex = currentFrameIndex;
  project.sprites = animationFrames[currentFrameIndex];
  if (wasPlaying) schedulePreviewAdvance();
  render();
}

function moveAnimationFrame(direction: -1 | 1): void {
  const previousIndex = currentFrameIndex;
  const nextIndex = previousIndex + direction;
  if (nextIndex < 0 || nextIndex >= animationFrames.length) return;
  const wasPlaying = isPlaying;
  const previousPreviewIndex = previewFrameIndex;
  const [frame] = animationFrames.splice(previousIndex, 1);
  animationFrames.splice(nextIndex, 0, frame);
  const [duration] = frameDurationsMs.splice(previousIndex, 1);
  frameDurationsMs.splice(nextIndex, 0, duration);

  const remapMovedIndex = (index: number): number => {
    if (index === previousIndex) return nextIndex;
    if (direction < 0 && index === nextIndex) return index + 1;
    if (direction > 0 && index === nextIndex) return index - 1;
    return index;
  };
  currentFrameIndex = nextIndex;
  previewFrameIndex = remapMovedIndex(previousPreviewIndex);
  animations[activeAnimationIndex].currentFrameIndex = currentFrameIndex;
  project.sprites = frame;
  if (wasPlaying) schedulePreviewAdvance();
  render();
}

function togglePlayback(): void {
  if (isPlaying) {
    stopPlayback();
    renderFrameStrip();
    renderPreview();
    return;
  }
  if (animationFrames.length < 2) return;
  isPlaying = true;
  previewFrameIndex = currentFrameIndex;
  playButton.textContent = "Pause";
  playButton.setAttribute("aria-pressed", "true");
  // Advance immediately so Play has visible feedback without waiting for the
  // first frame interval, then keep looping at the selected frame duration.
  advancePreview();
  schedulePreviewAdvance();
  renderFrameStrip();
  renderPreview();
}

function schedulePreviewAdvance(): void {
  if (!isPlaying) return;
  if (playbackTimer !== null) window.clearTimeout(playbackTimer);
  const duration = frameDurationsMs[previewFrameIndex] ?? frameDurationMs;
  playbackTimer = window.setTimeout(() => {
    playbackTimer = null;
    advancePreview();
    schedulePreviewAdvance();
  }, duration);
}

function advancePreview(): void {
  if (animationFrames.length < 2) {
    previewFrameIndex = 0;
    renderFrameStrip();
    renderPreview();
    return;
  }
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

function setTarget(target: "msx1" | "msx2"): void {
  if (target === msxTarget) return;
  stopPlayback();
  if (msxTarget === "msx2") msx2Palette = [...project.palette];
  msxTarget = target;
  project.target = target === "msx1" ? "msx1-tms9918a" : "msx2-v9938-sm2";
  project.palette = target === "msx1" ? [...MSX1_PALETTE] : [...msx2Palette];
  targetPicker.value = target;
  render();
  saveEditorSettings();
}

function setSpriteColor(spriteIndex: 0 | 1, color: number): void {
  const frames = animations[activeAnimationIndex]?.frames ?? animationFrames;
  frames.forEach((frame) => frame[spriteIndex]?.scanlines.forEach((line) => { line.color = color; }));
  render();
}

function setSpriteEarlyClock(spriteIndex: 0 | 1, enabled: boolean): void {
  const frames = animations[activeAnimationIndex]?.frames ?? animationFrames;
  frames.forEach((frame) => { if (frame[spriteIndex]) frame[spriteIndex].msx1EarlyClock = enabled; });
  render();
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
      const slot = project.sprites[layer].scanlines[msxTarget === "msx1" ? 0 : y].color;
      const baseSlot = base.scanlines[msxTarget === "msx1" ? 0 : y].color;
      const overlayLine = overlay.scanlines[msxTarget === "msx1" ? 0 : y];
      const ccResult = msxTarget === "msx2" && overlayLine.overlapMix ? baseSlot | overlayLine.color : baseSlot;
      const effectiveSlot = layer === 0 ? slot : overlayLine.color;
      const hasOverlap = slot !== 0 && overlayLine.color !== 0
        && base.pixels[y].some((pixel, x) => pixel !== 0 && overlay.pixels[y][x] !== 0);
      const cell = document.createElement("div");
      cell.className = `row-guide-cell${y === selectedRow ? " selected" : ""}`;
      const guideBackground = msxTarget === "msx1" ? effectiveSlot : ccResult;
      cell.style.backgroundColor = colorIndexToCss(project.palette[guideBackground]);
      cell.style.color = guideBackground > 7 ? "#071018" : "#f2f5f8";
      cell.title = msxTarget === "msx1"
        ? `Sprite ${layer} color P${String(effectiveSlot).padStart(2, "0")} · fixed TMS9918A palette`
        : hasOverlap && overlayLine.overlapMix
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
      const guideColor = guide.scanlines[msxTarget === "msx1" ? 0 : y].color;
      const selectedColor = selected.scanlines[msxTarget === "msx1" ? 0 : y].color;
      const guidePixel = spriteMode === "pair" && guide.pixels[y][x] !== 0 && guideColor !== 0;
      const selectedPixel = selected.pixels[y][x] !== 0 && selectedColor !== 0;
      if (guidePixel) {
        context.globalAlpha = 0.45;
        context.fillStyle = colorIndexToCss(project.palette[guideColor]);
        context.fillRect(px + 2, py + 2, scale - 4, scale - 4);
        context.globalAlpha = 1;
      }
      if (selectedPixel) {
        const inset = guidePixel ? 4 : 2;
        const baseColor = project.sprites[0].scanlines[msxTarget === "msx1" ? 0 : y].color;
        const overlayLine = project.sprites[1].scanlines[msxTarget === "msx1" ? 0 : y];
        const overlapColor = msxTarget === "msx2" && overlayLine.overlapMix ? baseColor | overlayLine.color : baseColor;
        context.fillStyle = colorIndexToCss(project.palette[guidePixel ? overlapColor : selectedColor]);
        context.fillRect(px + inset, py + inset, scale - 2 * inset, scale - 2 * inset);
        if (msxTarget === "msx1" && selectedLayer === 1 && guidePixel) {
          context.strokeStyle = "#77a8ff";
          context.lineWidth = Math.max(2, Math.round(scale * 0.12));
          context.strokeRect(px + 2.5, py + 2.5, scale - 5, scale - 5);
        }
      }
      context.strokeStyle = "#384757";
      context.lineWidth = 1;
      context.strokeRect(px + 0.5, py + 0.5, scale, scale);
    }
  }
  context.fillStyle = "#dce8f2";
  context.fillRect(0, selectedRow * scale, canvas.width, 1);
  renderRowColorGuides();
}

function frameHasPixel(frame: typeof project.sprites, x: number, y: number): boolean {
  const base = frame[0];
  const overlay = frame[1];
  return (base.pixels[y][x] !== 0 && base.scanlines[msxTarget === "msx1" ? 0 : y].color !== 0)
    || (spriteMode === "pair" && overlay.pixels[y][x] !== 0 && overlay.scanlines[msxTarget === "msx1" ? 0 : y].color !== 0);
}

function renderPreview(): void {
  const previewSprites = animationFrames[isPlaying ? previewFrameIndex : currentFrameIndex] || project.sprites;
  const size = project.spriteSize;
  const scale = 8;
  const magnification = msxTarget === "msx1" ? project.magnification ?? 1 : 1;
  const displayScale = scale * magnification;
  previewCanvas.style.setProperty("--preview-size", `${size * displayScale * previewSize}px`);
  previewCanvas.width = size * displayScale;
  previewCanvas.height = size * displayScale;
  for (let y = 0; y < size; y++) {
    const base = previewSprites[0];
    const overlay = previewSprites[1];
    const baseColor = base.scanlines[msxTarget === "msx1" ? 0 : y].color;
    const overlayColor = overlay.scanlines[msxTarget === "msx1" ? 0 : y].color;
    for (let x = 0; x < size; x++) {
      let color = 0;
      const basePixel = base.pixels[y][x] !== 0 && baseColor !== 0;
      const overlayPixel = spriteMode === "pair" && overlay.pixels[y][x] !== 0 && overlayColor !== 0;
      if (basePixel && overlayPixel) color = msxTarget === "msx2" && overlay.scanlines[y].overlapMix ? baseColor | overlayColor : baseColor;
      else if (basePixel) color = baseColor;
      else if (overlayPixel) color = overlayColor;
      previewContext.fillStyle = color === 0
        ? ((x + y) % 2 ? "#18212b" : "#202c38")
        : colorIndexToCss(project.palette[color]);
      previewContext.fillRect(x * displayScale, y * displayScale, displayScale, displayScale);
    }
  }
  updateAnimationFrameLabel();
}

function getGeneratedSource(): string {
  const spriteCount = spriteMode === "single" ? 1 : 2;
  if (msxTarget === "msx1") return exportMsx1Animation(animations, spriteCount, project.spriteSize, exportFormat.value as "c" | "asm" | "basic", project.magnification ?? 1);
  if (exportFormat.value === "asm") return exportMsx2AnimationAsm(animations, spriteCount, project.spriteSize, project.palette);
  if (exportFormat.value === "basic") return exportMsx2AnimationBasic(animations, spriteCount, project.spriteSize, project.palette);
  return exportMsx2AnimationC(animations, spriteCount, project.spriteSize, project.palette);
}

function updateExportFormatUi(): void {
  const format = exportFormat.value;
  const labels = {
    c: { language: msxTarget === "msx1" ? "MSX1 / C" : "MSXGL / C", button: "Export C data", extension: ".h" },
    asm: { language: "Z80 ASSEMBLY", button: "Export ASM data", extension: ".asm" },
    basic: { language: "MSX BASIC DATA", button: "Export BASIC data", extension: ".bas" },
  } as const;
  const selected = labels[format as keyof typeof labels] ?? labels.c;
  exportLanguage.textContent = selected.language;
  exportSelectedButton.textContent = selected.button;
  exportSelectedButton.dataset.extension = selected.extension;
}

function renderOutput(): void {
  try {
    const source = getGeneratedSource();
    const format = exportFormat.value;
    const tokensByFormat = {
      c: /(\/\*[\s\S]*?\*\/)|\b(?:const|u8|typedef|struct)\b|\b0x[\da-fA-F]+\b|\b\d+\b/g,
      asm: /(;[^\n]*)|^[A-Za-z_][\w]*:|\b(?:db|dw|org|equ|include|macro|endm)\b|\$[\da-fA-F]+\b|\b\d+\b/gim,
      basic: /(^(?:\s*\d+\s+REM\b.*))|^\s*\d+|\b(?:DATA|READ|RESTORE)\b|&H[\da-fA-F]+\b|\b\d+\b/gim,
    } as const;
    const fragment = document.createDocumentFragment();
    const tokens = tokensByFormat[format as keyof typeof tokensByFormat] ?? tokensByFormat.c;
    const activeAnimationName = animations[activeAnimationIndex]?.name ?? "";
    const activeFrameMarkers = {
      c: `/* ${activeAnimationName}, frame ${currentFrameIndex + 1}, Sprite 0:`,
      asm: `; ${activeAnimationName}, frame ${currentFrameIndex + 1}, Sprite 0:`,
      basic: `REM Animation ${activeAnimationName}, frame ${currentFrameIndex + 1},`,
    };
    const activeFrameMarker = activeFrameMarkers[format as keyof typeof activeFrameMarkers] ?? activeFrameMarkers.c;
    let cursor = 0;
    for (const match of source.matchAll(tokens)) {
      const index = match.index ?? 0;
      if (index > cursor) fragment.append(document.createTextNode(source.slice(cursor, index)));
      const token = match[0];
      const span = document.createElement("span");
      const isComment = token.startsWith("/*") || token.startsWith(";") || /^\s*\d+\s+REM\b/i.test(token);
      const isCurrentFrame = isComment && (format === "basic"
        ? token.toLowerCase().includes(activeFrameMarker.toLowerCase())
        : token.startsWith(activeFrameMarker));
      if (isComment) {
        span.className = isCurrentFrame ? "syntax-comment current-frame-source" : "syntax-comment";
      } else if (token.endsWith(":")) {
        span.className = "syntax-label";
      } else if (/^(?:const|u8|typedef|struct|db|dw|org|equ|include|macro|endm|DATA|READ|RESTORE)$/i.test(token)) {
        span.className = "syntax-keyword";
      } else {
        span.className = "syntax-number";
      }
      span.textContent = token;
      fragment.append(span);
      cursor = index + token.length;
    }
    if (cursor < source.length) fragment.append(document.createTextNode(source.slice(cursor)));
    output.replaceChildren(fragment);
  } catch (error) {
    output.textContent = error instanceof Error ? `Export error: ${error.message}` : "Export error: Could not encode sprite.";
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
    button.title = msxTarget === "msx1"
      ? `Fixed TMS9918A palette slot ${slot}: ${colorIndexToHex(colorIndex)}`
      : `Edit V9938 palette slot ${slot}: ${colorIndexToHex(colorIndex)}`;
    button.disabled = msxTarget === "msx1";

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
    if (msxTarget === "msx2") button.addEventListener("click", () => openPalettePicker(slot));
    paletteSlotsElement.append(button);
  });
  renderCcMap();
}

function renderRows(): void {
  rowsElement.replaceChildren();
  msx1ColorSettings.replaceChildren();
  if (msxTarget === "msx1") {
    const colorNames = ["Transparent", "Black", "Medium green", "Light green", "Dark blue", "Light blue", "Dark red", "Cyan", "Medium red", "Light red", "Dark yellow", "Light yellow", "Dark green", "Magenta", "Gray", "White"];
    const spriteCount = spriteMode === "single" ? 1 : 2;
    for (let spriteIndex = 0; spriteIndex < spriteCount; spriteIndex++) {
      const sprite = project.sprites[spriteIndex];
      const colorIndex = sprite.scanlines[0]?.color ?? 0;
      const group = document.createElement("section");
      group.className = "msx1-sprite-settings";
      const heading = document.createElement("div");
      heading.className = "msx1-sprite-settings-heading";
      const title = document.createElement("strong");
      title.textContent = `Sprite ${spriteIndex}`;
      const swatch = document.createElement("span");
      swatch.className = "msx1-color-swatch";
      swatch.style.backgroundColor = colorIndexToCss(MSX1_PALETTE[colorIndex] ?? MSX1_PALETTE[0]);
      heading.append(title, swatch);
      const controls = document.createElement("div");
      controls.className = "msx1-sprite-controls";
      const colorLabel = document.createElement("label");
      colorLabel.className = "msx1-color-control";
      const colorCaption = document.createElement("span");
      colorCaption.textContent = "Color";
      const select = document.createElement("select");
      select.setAttribute("aria-label", `MSX1 color for Sprite ${spriteIndex} across its entire shape`);
      for (let index = 0; index < colorNames.length; index++) {
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = `P${String(index).padStart(2, "0")} · ${colorNames[index]}`;
        option.selected = colorIndex === index;
        select.append(option);
      }
      select.addEventListener("change", () => {
        const nextColor = Number(select.value);
        swatch.style.backgroundColor = colorIndexToCss(MSX1_PALETTE[nextColor] ?? MSX1_PALETTE[0]);
        setSpriteColor(spriteIndex as 0 | 1, nextColor);
      });
      colorLabel.append(colorCaption, select);
      const earlyClockLabel = document.createElement("label");
      earlyClockLabel.className = "msx1-early-clock";
      const earlyClock = document.createElement("input");
      earlyClock.type = "checkbox";
      earlyClock.checked = sprite.msx1EarlyClock === true;
      earlyClock.setAttribute("aria-label", `Early Clock for Sprite ${spriteIndex}, shift left 32 pixels`);
      earlyClock.addEventListener("change", () => setSpriteEarlyClock(spriteIndex as 0 | 1, earlyClock.checked));
      const earlyClockText = document.createElement("span");
      earlyClockText.textContent = "Early Clock";
      const earlyClockHint = document.createElement("small");
      earlyClockHint.textContent = "Shift left 32 px";
      earlyClockLabel.append(earlyClock, earlyClockText, earlyClockHint);
      controls.append(colorLabel, earlyClockLabel);
      group.append(heading, controls);
      msx1ColorSettings.append(group);
    }
    const note = document.createElement("p");
    note.className = "hint msx1-sprite-note";
    note.textContent = "Each sprite keeps one color for its full height. Sprite 0 has priority where sprites overlap; Early Clock shifts a sprite 32 pixels left.";
    msx1ColorSettings.append(note);
    return;
  }
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
  if (msxTarget === "msx1") return;
  selectedPaletteSlot = slot;
  pickerSlotNumber.textContent = String(slot).padStart(2, "0");
  updatePickerFromIndex(project.palette[slot]);
  picker.showModal();
}

function render(): void {
  document.body.classList.toggle("msx1", msxTarget === "msx1");
  targetPicker.value = msxTarget;
  magnificationPicker.value = String(project.magnification ?? 1);
  modePicker.options[1].textContent = msxTarget === "msx1" ? "Sprite pair · separate colors" : "Sprite pair + CC";
  layerButtons[0].textContent = msxTarget === "msx1" ? "Sprite 0 · first priority" : "Sprite 0 · base";
  layerButtons[1].textContent = msxTarget === "msx1" ? "Sprite 1 · independent" : "Sprite 1 · CC overlay";
  document.querySelector<HTMLElement>("#preview-target-label")!.textContent = msxTarget === "msx1" ? "TMS9918A RESULT" : "V9938 RESULT";
  document.querySelector<HTMLElement>("#palette-target-label")!.textContent = msxTarget === "msx1" ? "TMS9918A FIXED PALETTE" : "V9938 PALETTE";
  document.querySelector<HTMLElement>("#palette-count")!.textContent = msxTarget === "msx1" ? "16 slots · fixed colors" : "16 slots · 512 colors";
  document.querySelector<HTMLElement>("#palette-hint")!.textContent = msxTarget === "msx1"
    ? "The TMS9918A has 16 fixed colors. Sprite color 0 is transparent; choose each sprite's color in Sprite data."
    : "The 4 bits are the sprite color code used by CC OR. Click a slot to edit its RGB color.";
  document.querySelector<HTMLElement>("#sprite-data-title")!.textContent = msxTarget === "msx1" ? "Sprite colors" : "Scanline settings";
  document.querySelector<HTMLElement>("#sprite-data-label")!.textContent = msxTarget === "msx1" ? "TMS9918A SPRITE DATA" : "SPRITE DATA";
  if (animations[activeAnimationIndex]) animations[activeAnimationIndex].currentFrameIndex = currentFrameIndex;
  frameDurationMs = frameDurationsMs[currentFrameIndex] ?? frameDurationMs;
  frameDuration.value = String(frameDurationMs);
  frameDurationValue.textContent = `${frameDurationMs} ms`;
  uniformFrameDurationToggle.checked = animations[activeAnimationIndex]?.uniformFrameDuration === true;
  document.body.classList.toggle("single-sprite", spriteMode === "single");
  modePicker.value = spriteMode;
  updateExportFormatUi();
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
document.querySelector<HTMLButtonElement>("#show-help")!.addEventListener("click", () => {
  topbarMenu.open = false;
  helpDialog.showModal();
});
document.querySelector<HTMLButtonElement>("#close-help")!.addEventListener("click", () => helpDialog.close());
helpDialog.addEventListener("click", (event) => {
  if (event.target === helpDialog) helpDialog.close();
});
document.querySelector<HTMLButtonElement>("#show-info")!.addEventListener("click", () => {
  topbarMenu.open = false;
  infoDialog.showModal();
});
document.querySelector<HTMLButtonElement>("#close-info")!.addEventListener("click", () => infoDialog.close());
infoDialog.addEventListener("click", (event) => {
  if (event.target === infoDialog) infoDialog.close();
});
layerButtons.forEach((button, index) => button.addEventListener("click", () => {
  selectedLayer = index;
  render();
}));
targetPicker.addEventListener("change", () => setTarget(targetPicker.value as "msx1" | "msx2"));
magnificationPicker.addEventListener("change", () => {
  project.magnification = Number(magnificationPicker.value) === 2 ? 2 : 1;
  renderPreview();
  renderOutput();
  saveEditorSettings();
});
previewSizePicker.addEventListener("change", () => {
  previewSize = Number(previewSizePicker.value) === 0.75 ? 0.75 : Number(previewSizePicker.value) === 1.5 ? 1.5 : 1;
  renderPreview();
  saveEditorSettings();
});
modePicker.addEventListener("change", () => setSpriteMode(modePicker.value as "single" | "pair"));
playButton.addEventListener("click", togglePlayback);
playbackModePicker.addEventListener("change", () => {
  playbackMode = playbackModePicker.value as "loop" | "pingpong";
  animations[activeAnimationIndex].playbackMode = playbackMode;
  playbackDirection = 1;
  renderFrameStrip();
  renderPreview();
  saveEditorSettings();
});
document.querySelector<HTMLButtonElement>("#animation-new")!.addEventListener("click", createAnimation);
frameDuration.addEventListener("input", () => {
  frameDurationMs = Number(frameDuration.value);
  const animation = animations[activeAnimationIndex];
  if (animation.uniformFrameDuration) frameDurationsMs.fill(frameDurationMs);
  else frameDurationsMs[currentFrameIndex] = frameDurationMs;
  animation.frameDurationsMs = frameDurationsMs;
  frameDurationValue.textContent = `${frameDurationMs} ms`;
  if (isPlaying) schedulePreviewAdvance();
  renderFrameStrip();
  renderPreview();
  renderOutput();
  saveEditorSettings();
});
uniformFrameDurationToggle.addEventListener("change", () => {
  const animation = animations[activeAnimationIndex];
  animation.uniformFrameDuration = uniformFrameDurationToggle.checked;
  if (animation.uniformFrameDuration) {
    frameDurationMs = frameDurationsMs[currentFrameIndex] ?? frameDurationMs;
    frameDurationsMs.fill(frameDurationMs);
    animation.frameDurationsMs = frameDurationsMs;
  }
  if (isPlaying) schedulePreviewAdvance();
  render();
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
  project.target = msxTarget === "msx1" ? "msx1-tms9918a" : "msx2-v9938-sm2";
  project.magnification = savedEditorSettings.magnification ?? 1;
  project.palette = palette;
  animationFrames = [project.sprites];
  frameDurationsMs = [frameDurationMs];
  currentFrameIndex = 0;
  selectedLayer = 0;
  selectedRow = 0;
  animations = [{
    name: "Animation 1",
    frames: animationFrames,
    frameDurationsMs,
    uniformFrameDuration: savedEditorSettings.uniformFrameDuration ?? false,
    playbackMode,
    currentFrameIndex: 0,
  }];
  activeAnimationIndex = 0;
  render();
  saveEditorSettings();
});

function serializeProject(): string {
  const activeAnimation = animations[activeAnimationIndex];
  if (activeAnimation) {
    // Keep the active clip's canonical data in sync before taking the project
    // snapshot. The editor uses local aliases while switching and editing clips.
    activeAnimation.frames = animationFrames;
    activeAnimation.frameDurationsMs = frameDurationsMs;
    activeAnimation.playbackMode = playbackMode;
    activeAnimation.currentFrameIndex = currentFrameIndex;
  }

  const savedAnimations = animations.map((animation) => ({
    name: animation.name,
    frames: animation.frames.map(cloneFrame),
    frameDurationsMs: [...animation.frameDurationsMs],
    uniformFrameDuration: animation.uniformFrameDuration === true,
    playbackMode: animation.playbackMode,
    currentFrameIndex: animation.currentFrameIndex ?? 0,
  }));
  const snapshot: Msx2Project = {
    ...project,
    spriteMode,
    animations: savedAnimations,
    currentAnimationIndex: activeAnimationIndex,
    animationFrames: savedAnimations[activeAnimationIndex]?.frames ?? [],
    frameDurationsMs: savedAnimations[activeAnimationIndex]?.frameDurationsMs ?? [],
    frameDurationMs,
    currentFrameIndex,
    playbackMode,
    onionSkinEnabled: onionSkin.checked,
    onionOpacity: onionOpacityValuePercent,
    sprites: savedAnimations[activeAnimationIndex]?.frames[currentFrameIndex] ?? cloneFrame(project.sprites),
  };
  return JSON.stringify(snapshot, null, 2);
}

document.querySelector<HTMLButtonElement>("#save-project")!.addEventListener("click", () => {
  topbarMenu.open = false;
  const projectText = serializeProject();
  if (customEditorMode && vscodeApi) vscodeApi.postMessage({ type: "save-project", text: projectText });
  else download("sprite-animation.msxsm", projectText, "application/json");
});

exportFormat.addEventListener("change", () => {
  updateExportFormatUi();
  renderOutput();
});
exportSelectedButton.addEventListener("click", () => {
  const extension = exportSelectedButton.dataset.extension ?? ".h";
  const mimeType = exportFormat.value === "c" ? "text/x-c" : "text/plain";
  download(`sprite-animation${extension}`, getGeneratedSource(), mimeType);
});
updateExportFormatUi();

function loadProjectText(projectText: string): void {
  const loaded = JSON.parse(projectText) as Partial<Msx2Project>;
  if (loaded.format !== "spritemate-msx" || (loaded.target !== "msx2-v9938-sm2" && loaded.target !== "msx1-tms9918a") || (loaded.spriteSize !== 8 && loaded.spriteSize !== 16)) {
    throw new Error("This is not a supported MSX SpriteMate project.");
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
  const loadedFrameDuration = Number(loaded.frameDurationMs);
  const defaultDuration = Number.isFinite(loadedFrameDuration)
    ? Math.round(Math.max(80, Math.min(1000, loadedFrameDuration)) / 20) * 20
    : savedEditorSettings.frameDurationMs ?? 180;
  const loadedPlaybackMode = loaded.playbackMode === "loop" || loaded.playbackMode === "pingpong"
    ? loaded.playbackMode
    : savedEditorSettings.playbackMode ?? "loop";
  const sourceAnimations: Msx2Animation[] = Array.isArray(loaded.animations) && loaded.animations.length
    ? loaded.animations
    : [{
      name: "Animation 1",
      frames: Array.isArray(loaded.animationFrames) && loaded.animationFrames.length
        ? loaded.animationFrames
        : [loaded.sprites],
      frameDurationsMs: loaded.frameDurationsMs ?? [],
      playbackMode: loadedPlaybackMode,
      currentFrameIndex: loaded.currentFrameIndex,
    }];
  if (sourceAnimations.length > 16) throw new Error("Projects can contain up to 16 animations.");
  animations = sourceAnimations.map((source, animationIndex) => {
    if (!Array.isArray(source.frames) || source.frames.length < 1 || source.frames.length > 64) {
      throw new Error(`Animation ${animationIndex + 1} must contain 1 to 64 frames.`);
    }
    const frames = source.frames.map(normalizeFrame);
    const sourceDurations = Array.isArray(source.frameDurationsMs) ? source.frameDurationsMs : [];
    const durations = frames.map((_, frameIndex) => {
      const duration = Number(sourceDurations[frameIndex]);
      return Number.isFinite(duration)
        ? Math.round(Math.max(80, Math.min(1000, duration)) / 20) * 20
        : defaultDuration;
    });
    const requestedFrame = Number.isInteger(source.currentFrameIndex)
      ? source.currentFrameIndex!
      : animationIndex === 0 && Number.isInteger(loaded.currentFrameIndex) ? loaded.currentFrameIndex! : 0;
    const currentIndex = Math.max(0, Math.min(requestedFrame, frames.length - 1));
    const uniformFrameDuration = source.uniformFrameDuration === true;
    if (uniformFrameDuration) durations.fill(durations[currentIndex] ?? defaultDuration);
    return {
      name: typeof source.name === "string" && source.name.trim()
        ? source.name.trim().slice(0, 32)
        : `Animation ${animationIndex + 1}`,
      frames,
      frameDurationsMs: durations,
      uniformFrameDuration,
      playbackMode: source.playbackMode === "loop" || source.playbackMode === "pingpong"
        ? source.playbackMode
        : loadedPlaybackMode,
      currentFrameIndex: currentIndex,
    };
  });
  activeAnimationIndex = Math.max(0, Math.min(
    Number.isInteger(loaded.currentAnimationIndex) ? loaded.currentAnimationIndex! : 0,
    animations.length - 1,
  ));
  const active = animations[activeAnimationIndex];
  animationFrames = active.frames;
  frameDurationsMs = active.frameDurationsMs;
  playbackMode = active.playbackMode;
  currentFrameIndex = active.currentFrameIndex ?? 0;
  frameDurationMs = frameDurationsMs[currentFrameIndex] ?? defaultDuration;
  spriteMode = loaded.spriteMode === "single" || loaded.spriteMode === "pair"
    ? loaded.spriteMode
    : loaded.sprites.length === 1 ? "single" : "pair";
  modePicker.value = spriteMode;
  playbackModePicker.value = playbackMode;
  onionSkin.checked = typeof loaded.onionSkinEnabled === "boolean"
    ? loaded.onionSkinEnabled
    : savedEditorSettings.onionSkinEnabled ?? false;
  onionOpacityValuePercent = Number.isFinite(loaded.onionOpacity)
    ? Math.max(10, Math.min(60, Math.round(loaded.onionOpacity! / 5) * 5))
    : savedEditorSettings.onionOpacity ?? 25;
  onionOpacity.value = String(onionOpacityValuePercent);
  onionOpacityValue.textContent = `${onionOpacityValuePercent}%`;
  msxTarget = loaded.target === "msx1-tms9918a" ? "msx1" : "msx2";
  targetPicker.value = msxTarget;
  project = {
    format: "spritemate-msx",
    version: 1,
    target: msxTarget === "msx1" ? "msx1-tms9918a" : "msx2-v9938-sm2",
    magnification: loaded.magnification === 2 ? 2 : 1,
    spriteSize: size,
    palette: msxTarget === "msx1" ? [...MSX1_PALETTE] : normalizeMsx2Palette(loaded.palette),
    sprites: animationFrames[currentFrameIndex],
  };
  magnificationPicker.value = String(project.magnification);
  if (msxTarget === "msx2") msx2Palette = [...project.palette];
  sizePicker.value = String(size);
  selectedLayer = 0;
  selectedRow = 0;
  stopPlayback();
  render();
  saveEditorSettings();
}

document.querySelector<HTMLInputElement>("#project-file")!.addEventListener("change", async (event) => {
  topbarMenu.open = false;
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    loadProjectText(await file.text());
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "Could not open project.");
  } finally {
    input.value = "";
  }
});

if (customEditorMode && vscodeApi) {
  window.addEventListener("message", (event: MessageEvent) => {
    const message = event.data as { type?: string; text?: string };
    if (message.type === "load-project" && typeof message.text === "string") {
      try {
        loadProjectText(message.text);
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Could not open project.");
      }
    } else if (message.type === "save-error") {
      window.alert("Could not save the MSX SpriteMate project file.");
    }
  });
}

render();
if (customEditorMode && vscodeApi) vscodeApi.postMessage({ type: "ready" });
