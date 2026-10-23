// Builds the portable Windows application: npm run package:win
//
// Output: release/Tessera-<version>-win-x64/ (extract-and-run folder) and a .zip of it.
// End users need nothing else installed: Electron bundles Chromium and Node.js.
//
// Offline/air-gapped builds: set ELECTRON_ZIP_DIR to a folder containing
// electron-v<version>-win32-x64.zip (checksum-verified download from the Electron releases page).

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packager } from '@electron/packager';
import { zipFolder } from '../src/io/zip.js';
import { copyDir } from '../src/io/fsutil.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8'));
const electronVersion = JSON.parse(await fs.readFile(path.join(ROOT, 'node_modules', 'electron', 'package.json'), 'utf8')).version;
const OUT = path.join(ROOT, 'release');
const name = `Tessera-${pkg.version}-win-x64`;

for (const f of ['dist/editor/index.html', 'dist/runtime/runtime.js']) {
  await fs.access(path.join(ROOT, f)).catch(() => { throw new Error(`${f} is missing. Run "npm run build" first.`); });
}

await fs.rm(path.join(OUT, name), { recursive: true, force: true });
await fs.rm(path.join(OUT, `${name}.zip`), { force: true });

const ignore = [
  /^\/(test|scripts|docs|samples|release|schemas|\.git|\.github|\.vscode|\.claude)(\/|$)/,
  /^\/src\/editor(\/|$)/, // shipped as the built dist/editor
  /^\/vite\.[^/]*\.config\.js$/,
  /^\/(CONTRIBUTING|ROADMAP)\.md$/,
];

const [appDir] = await packager({
  dir: ROOT,
  out: OUT,
  name: 'Tessera',
  executableName: 'Tessera',
  platform: 'win32',
  arch: 'x64',
  electronVersion,
  electronZipDir: process.env.ELECTRON_ZIP_DIR || undefined,
  asar: true,
  prune: true,
  overwrite: true,
  ignore,
  appCopyright: 'Copyright Tessera contributors. Licensed under Apache-2.0.',
  win32metadata: { CompanyName: 'Tessera contributors', FileDescription: 'Tessera learning content editor', ProductName: 'Tessera' },
});

const finalDir = path.join(OUT, name);
await fs.rename(appDir, finalDir);
// Documentation and samples next to the executable.
for (const f of ['README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) await fs.copyFile(path.join(ROOT, f), path.join(finalDir, f === 'LICENSE' ? 'LICENSE-Tessera.txt' : f));
await copyDir(path.join(ROOT, 'samples'), path.join(finalDir, 'Samples'), { skip: (rel) => rel.split('/').some((s) => s === '.tessera') });
await fs.writeFile(path.join(finalDir, 'START HERE.txt'), `Tessera ${pkg.version} (portable)

1. Run Tessera.exe. No installation is needed.
2. Settings and the recent-projects list are stored in the "data" folder next to Tessera.exe
   (if this folder is read-only, your Windows profile is used instead).
3. Sample projects are in the "Samples" folder: use "Open a Tessera project" and choose
   Samples\\native-demo. Copy samples elsewhere before editing if this folder is read-only.
   Samples\\import-examples contains material for trying "Import a folder".

Windows may warn that the app is from an unknown publisher because this build is not code-signed.
Source code, build instructions and documentation: see README.md.
`);
const files = await zipFolder(finalDir, path.join(OUT, `${name}.zip`));
console.log(`Portable app: ${path.relative(ROOT, finalDir)}\nZIP (${files} files): ${path.relative(ROOT, path.join(OUT, `${name}.zip`))}`);
