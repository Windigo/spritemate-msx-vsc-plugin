const { readFile, writeFile } = require("node:fs/promises");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const extensionPath = path.join(root, "package.json");
const extensionLockPath = path.join(root, "package-lock.json");
const editorPath = path.join(root, "app/spritemate-msx/package.json");
const lockPath = path.join(root, "app/spritemate-msx/package-lock.json");

async function syncVersions() {
  const extension = JSON.parse(await readFile(extensionPath, "utf8"));
  const extensionLock = JSON.parse(await readFile(extensionLockPath, "utf8"));
  const editor = JSON.parse(await readFile(editorPath, "utf8"));
  const lock = JSON.parse(await readFile(lockPath, "utf8"));

  extensionLock.version = extension.version;
  extensionLock.packages[""].version = extension.version;
  editor.version = extension.version;
  lock.version = extension.version;
  lock.packages[""].version = extension.version;

  await writeFile(extensionLockPath, `${JSON.stringify(extensionLock, null, 2)}\n`);
  await writeFile(editorPath, `${JSON.stringify(editor, null, 2)}\n`);
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  console.log(`Synchronized editor version to ${extension.version}.`);
}

syncVersions().catch((error) => {
  console.error("Could not synchronize editor version:", error);
  process.exitCode = 1;
});
