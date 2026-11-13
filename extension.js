const vscode = require("vscode");
const fs = require("fs");

const VIEW_TYPE = "spritemateMsx.editor";
const PROJECT_VIEW_TYPE = "spritemateMsx.project";

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand("spritemateMsx.open", () => openEditor(context)),
    vscode.window.registerCustomEditorProvider(
      PROJECT_VIEW_TYPE,
      {
        resolveCustomTextEditor(document, panel) {
          const mediaUri = vscode.Uri.joinPath(context.extensionUri, "media");
          panel.webview.options = {
            enableScripts: true,
            localResourceRoots: [mediaUri],
          };
          panel.webview.onDidReceiveMessage(async (message) => {
            if (message?.type === "ready") {
              panel.webview.postMessage({ type: "load-project", text: document.getText() });
              return;
            }
            if (message?.type === "save-project" && typeof message.text === "string") {
              const currentText = document.getText();
              const edit = new vscode.WorkspaceEdit();
              edit.replace(
                document.uri,
                new vscode.Range(document.positionAt(0), document.positionAt(currentText.length)),
                message.text,
              );
              const applied = await vscode.workspace.applyEdit(edit);
              if (!applied) panel.webview.postMessage({ type: "save-error" });
            }
          });
          panel.webview.html = getEditorHtml(panel.webview, context.extensionUri, true);
        },
      },
      { webviewOptions: { retainContextWhenHidden: true }, supportsMultipleEditorsPerDocument: false },
    ),
  );
}

function getEditorHtml(webview, extensionUri, isProjectEditor = false) {
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
  const projectEditorMeta = isProjectEditor ? '<meta name="msxsm-custom-editor" content="true">' : "";
  const injection = `<meta http-equiv="Content-Security-Policy" content="${csp}"><base href="${base}/">${projectEditorMeta}`;
  return html.replace("<head>", `<head>\n    ${injection}`);
}

function openEditor(context) {
  const panel = vscode.window.createWebviewPanel(
    VIEW_TYPE,
    `MSX SpriteMate v${require("./package.json").version}`,
    vscode.window.activeTextEditor?.viewColumn || vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
    },
  );
  panel.webview.html = getEditorHtml(panel.webview, context.extensionUri);
}

function deactivate() {}

module.exports = { activate, deactivate };
