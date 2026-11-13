#!/bin/zsh
set -euo pipefail

project_dir=${0:A:h}
app_dir="$project_dir/app/spritemate-msx"
public_dir=${MSX_SPRITEMATE_PUBLIC_DIR:-"$HOME/Sites/msx-spritemate"}
port=8091
agent_label="nl.mennohoman.msxspritemate"
agent_path="$HOME/Library/LaunchAgents/$agent_label.plist"

case "$public_dir" in
  "$HOME/Sites/"*) ;;
  *) print -u2 "Public directory must be inside $HOME/Sites: $public_dir"; exit 1 ;;
esac

print "Synchronizing editor version…"
node "$project_dir/scripts/sync-versions.js"

print "Building MSX SpriteMate…"
(cd "$app_dir" && npm ci && npm run build)

print "Deploying static files to $public_dir…"
mkdir -p "$public_dir"
find "$public_dir" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
cp -R "$app_dir/dist"/. "$public_dir"/

print "Installing LaunchAgent $agent_label on port $port…"
/usr/bin/python3 - "$public_dir" "$port" "$agent_path" <<'PY'
import plistlib
import sys
from pathlib import Path

public_dir, port, agent_path = sys.argv[1], int(sys.argv[2]), sys.argv[3]
plist = {
    "Label": "nl.mennohoman.msxspritemate",
    "ProgramArguments": [
        "/usr/bin/python3", "-m", "http.server", str(port),
        "--bind", "127.0.0.1", "--directory", public_dir,
    ],
    "RunAtLoad": True,
    "KeepAlive": True,
    "StandardOutPath": str(Path.home() / "Library/Logs/msxspritemate-http.log"),
    "StandardErrorPath": str(Path.home() / "Library/Logs/msxspritemate-http-error.log"),
}
path = Path(agent_path)
path.parent.mkdir(parents=True, exist_ok=True)
path.write_bytes(plistlib.dumps(plist, fmt=plistlib.FMT_XML, sort_keys=False))
PY

user_domain="gui/$(id -u)"
if launchctl print "$user_domain/$agent_label" >/dev/null 2>&1; then
  launchctl bootout "$user_domain" "$agent_path"
fi
launchctl bootstrap "$user_domain" "$agent_path"
launchctl kickstart -k "$user_domain/$agent_label"

print "Checking local site at http://127.0.0.1:$port/…"
if curl -fsS -I --max-time 5 "http://127.0.0.1:$port/" | head -n 1; then
  print "Local HTTP check passed."
else
  print -u2 "Note: this shell could not reach the host's loopback; verify the page in a browser."
fi
print "MSX SpriteMate is serving from $public_dir"
