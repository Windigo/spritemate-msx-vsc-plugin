# MSX SpriteMate

### A sprite studio for MSX2, right inside VS Code.

Bring your next MSX character, creature, or effect to life without leaving your coding workspace. MSX SpriteMate combines a pixel editor, V9938 color tools, an animation preview, and source-data exports in one focused extension.

Draw an individual sprite or build a two-sprite composition. Set colors per scanline, experiment with V9938 CC overlap, and see the combined result as you work. When the sprite is ready, export its patterns, color bytes, animation timing, and palette for your project.

**Created by Menno Homan (Windigo).**

## Features

- Draw **8×8** and **16×16** MSX2 Sprite Mode 2 graphics.
- Work with one sprite or a pair of overlapping sprites.
- Choose from all **512 V9938 RGB colors** across 16 palette slots.
- Set the color and VDP flags per scanline: **CC** color mixing, **IC** collision inhibit, and **EC** early clock.
- Use the CC color map and live overlap preview to understand how 4-bit color codes combine with OR.
- Arrange panels to fit your workspace; their positions and sizes are remembered.

## Animate a sprite

Create named animation loops such as **Idle**, **Walk**, or **Run**. Each animation has its own frames and playback mode. Add blank frames, duplicate or reorder frames, or drag a frame to another animation row to copy it. Change frames while playback runs to fine-tune the motion in context.

Set each frame's duration and choose **Loop** or **Ping-pong**. Projects retain animation names, frames, per-frame timing, palette, and sprite settings.

## Export for your MSX project

Choose an output format in **Generated data**:

- **C · MSXgl** — C arrays and animation tables for pattern and color data, timing, CC/IC/EC flags, and palette registers.
- **Z80 Assembly** — `db`/`dw` data labels and animation tables.
- **MSX BASIC DATA** — numbered `DATA` statements with comments describing the read order.

The generated preview updates as you edit. Use **Export** to download the selected format. Save and reopen editable `.msxsm` files with **Save project** and **Open project**. In VS Code, opening a `.msxsm` file launches MSX SpriteMate automatically.

## Open the editor

Install the extension and run **MSX SpriteMate: Open Sprite Editor** from the Command Palette. The default shortcut is `Ctrl+Alt+M` (`Cmd+Alt+M` on macOS).

## Build from source

```sh
./build-extension.sh
```

This builds the standalone editor and packages it as a `.vsix` file. The root `package.json` is the source of truth for the extension and editor version.

## Run publicly from macOS

The public editor runs as a static site on this Mac:

- Public URL: <https://msxspritemate.mennohoman.nl>
- Local site: `~/Sites/msx-spritemate`
- Local HTTP server: `127.0.0.1:8091`
- Cloudflare Tunnel hostname route: `msxspritemate.mennohoman.nl` → `localhost:8091`

### Publish an update

From this repository, run:

```sh
./deploy-mac.sh
```

The script synchronizes the editor and extension versions, builds the standalone app, copies the production files to `~/Sites/msx-spritemate`, and installs or restarts the `nl.mennohoman.msxspritemate` LaunchAgent. Open the public URL after it finishes to confirm the update.

### Start after restarting the Mac

The editor's LaunchAgent has `RunAtLoad` and `KeepAlive` enabled. macOS starts the local web server automatically when the `windigo` account logs in and relaunches it if it stops. Cloudflare Tunnel is installed as the system LaunchDaemon `com.cloudflare.cloudflared`, also configured to run at system startup. After a Mac restart, log into the `windigo` account; the public site should then become available without running the deployment script again.

The Mac must remain awake and connected to the internet for the public site to stay reachable. The local server log files are `~/Library/Logs/msxspritemate-http.log` and `~/Library/Logs/msxspritemate-http-error.log`; Cloudflare Tunnel logs are `/Library/Logs/com.cloudflare.cloudflared.out.log` and `/Library/Logs/com.cloudflare.cloudflared.err.log`.

The public editor is static; `.msxsm` projects stay in the user's browser or local files and are not uploaded to a server.

## Credits

MSX SpriteMate is an independent MSX-focused editor based on Spritemate by Ingo Hinterding (awsm). The original project attribution and MIT license are retained in `app/spritemate-msx/README.upstream.md` and `app/spritemate-msx/LICENSE`.
