# MSX Sprite Animation Plan

This document records the animation design for future work on the standalone MSX2 editor. It is intended to give Codex or another coding assistant the same context when continuing the feature.

**Current priority:** work on and build the standalone editor only. Leave the VS Code extension and VSIX packaging alone until the user asks to return to them.

## Product decisions

- A project can use either one sprite or a two-sprite pair. The pair is Sprite 0 as the base and Sprite 1 as the overlay; CC and the OR-result preview remain V9938 accurate.
- An animation frame contains one or two sprite layers according to the selected project mode. The editor keeps the inactive second layer when switching to single-sprite mode so switching back does not discard artwork.
- The existing overlap preview window is the animation preview. Playback controls, frame timing, and loop mode live in that window; the editable frame timeline lives under Draw sprite.
- The palette is shared and fixed across all frames by default. Frame changes animate patterns and scanline color-table data without flashing the palette.
- Project files preserve the mode, frame list, current frame, and each frame's duration. Existing project JSON continues to load, applying its shared duration to every frame.
- An earlier external AI integration was removed at the user's request. Keep animation work independent of AI services and API keys; any future image-generation workflow must be a separate, explicitly requested feature.

## First implementation

- Implemented: single-sprite / sprite-pair mode selector; the hidden overlay is retained in single mode.
- Implemented: editable frame timeline under Draw sprite, with new blank, duplicate, select, reorder, and delete actions. Keep at least one frame and cap the editor at 64 frames. Selecting a frame while playing changes the editing frame without stopping the preview.
- Implemented: play/pause, per-frame duration control for the selected frame, and loop / ping-pong selection in the existing preview panel. Pair mode previews CC output; single mode previews Sprite 0.
- Implemented: the drawing canvas stays on the selected editable frame while playback runs in the preview.
- Implemented: save/load of mode, frame list, selected frame, and per-frame durations in `.msxsm`.
- Implemented: C output has unique pattern/color arrays for every frame, a frame table with each frame's duration, and shared palette data once.
- Implemented: adjustable onion skin, frame reordering, looping, and ping-pong playback.
- Follow-up: add animation tags.

## Follow-up opportunities

- Add animation tags.
- Reuse identical pattern data in exported animation arrays to reduce ROM size.
- Allow importing a sprite sheet after deterministic MSX-size, palette, and CC conversion.

## Acceptance checks

- Switching modes never deletes the hidden overlay data.
- Sprite-pair preview matches the editor's existing CC behavior on every frame.
- Speed changes affect playback immediately; selecting a frame during playback makes it editable without stopping the preview. The edit-frame and preview-frame indicators remain distinct.
- A one-frame animation remains valid and cannot be reduced to zero frames.
- Old projects load without animation metadata and retain their current artwork and palette.
- Saving and reopening an animation preserves its frames, mode, speed, and selected frame.
- Generated C output distinguishes every frame and emits the shared palette once.
