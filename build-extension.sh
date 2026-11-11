#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

APP_DIR="app/spritemate-msx"

echo "==> Installing and building the MSX2 editor"
(cd "$APP_DIR" && npm ci && npm run build)

echo "==> Copying the built editor into the extension"
rm -rf media
cp -R "$APP_DIR/dist" media

echo "==> Packaging the standalone VS Code extension"
npx --yes @vscode/vsce@latest package

echo "Built spritemate-msx-vscode-plugin-*.vsix"
