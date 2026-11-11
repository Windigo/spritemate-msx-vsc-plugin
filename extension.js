const vscode = require("vscode");
const fs = require("fs");
const path = require("path");

const VIEW_TYPE = "spritemateMsx.editor";

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand("spritemateMsx.open", () => openEditor(context))
  );
}

function getEditorHtml(webview, extensionUri) {
  const mediaUri = vscode.Uri.joinPath(extensionUri, "media");
  const pageUri = vscode.Uri.joinPath(mediaUri, "msx.html");
  let html = fs.readFileSync(pageUri.fsPath, "utf8");
  const base = webview.asWebviewUri(mediaUri).toString();
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} data: blob:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `font-src ${webview.cspSource} data:`,
    `script-src ${webview.cspSource} 'unsafe-inline'`,
    `connect-src ${webview.cspSource} blob: data:`,
  ].join("; ");
  const injection = `<meta http-equiv="Content-Security-Policy" content="${csp}"><base href="${base}/">`;
  return html.replace("<head>", `<head>\n    ${injection}`);
}

function openEditor(context) {
  const panel = vscode.window.createWebviewPanel(
    VIEW_TYPE,
    "Spritemate MSX2",
    vscode.window.activeTextEditor?.viewColumn || vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
    }
  );
  panel.webview.html = getEditorHtml(panel.webview, context.extensionUri);
}

function deactivate() {}

module.exports = { activate, deactivate };
