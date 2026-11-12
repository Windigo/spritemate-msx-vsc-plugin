# Spritemate MSX2 Sprite Editor (VS Code)

Standalone MSX2-focused fork and VS Code extension. This repository is separate from the C64 `spritemate-vsc-plugin` project.

The editor targets V9938 Sprite Mode 2 and supports 8×8 and 16×16 sprites, per-scanline palette slots, and the EC/CC/IC sprite color-table flags. The V9938 has 16 programmable palette registers, each selecting one of 512 RGB colors. Slot 0 is transparent for sprites by default. CC joins a sprite to the priority group of the nearest preceding sprite with CC clear; sprites in the same group combine overlapping color codes with a logical OR. The editor saves `.msxproj` JSON projects and exports sprite data and palette register bytes as C arrays.

The canvas, overlap preview, palette, scanline settings, and C output are separate draggable and resizable windows on desktop. Drag a title bar to move a window; the layout is saved in the browser and restored after a refresh at the same address. Use **Reset windows** to restore the starting layout. On narrow screens the windows stack vertically.

Choose **Sprite 0 · base** or **Sprite 1 · CC overlay** before drawing. Both sprites are previewed at the same position. Where their opaque pixels overlap, CC on sprite 1 ORs the two 4-bit palette slot numbers; the result selects the third palette slot. For example, P02 OR P04 = P06. The C export includes both pattern and color tables in sprite priority order, followed by the 16 palette registers. The preview assumes both sprites share a position and EC is off.

## Animation

Choose **Single sprite** or **Sprite pair + CC** in the editor. In the existing preview window, add a blank frame, duplicate the selected frame, or delete it; click a numbered frame to edit it. **Play** animates the preview, and **Frame time** sets the delay in milliseconds. `.msxproj` files preserve the mode, frames, selected frame, and timing. C export contains each frame's pattern/color arrays, a frame table, and the shared palette once.

## Run locally

```sh
cd app/spritemate-msx
npm ci
npm run dev:msx
```

## Build the extension

```sh
./build-extension.sh
```

Then install the generated `.vsix` in VS Code. Open the editor with **Spritemate MSX: Open Sprite Editor** or `Ctrl+Alt+M` (`Cmd+Alt+M` on macOS).

## Project layout

- `app/spritemate-msx/` — independent web editor and MSX2 data/export code.
- `extension.js` — VS Code webview wrapper and command.
- `build-extension.sh` — builds the editor and packages the VS Code extension.

The inherited Spritemate source is MIT-licensed; retain the attribution and license in `app/spritemate-msx/LICENSE` and `app/spritemate-msx/README.upstream.md`.
