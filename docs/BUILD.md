# Building Tessera

## Requirements

* Windows 10 or 11, x64 (the packaging target). Development also works on macOS and Linux,
  but only the Windows package is produced and tested in this version.
* Node.js 20 or newer with npm (tested with Node.js 24.14 and npm 11.11).
* About 1 GB of free disk space (Electron download, `node_modules`, build output).

End users need none of this: they run the portable package.

## Commands

| Command | What it does |
|---|---|
| `npm ci` | Install the exact dependency versions from `package-lock.json` |
| `npm run dev` | Build the runtime, start the editor UI with hot reload, launch Electron |
| `npm run build` | Build `dist/runtime` (learner runtime) and `dist/editor` (editor UI) |
| `npm start` | Build, then run the app with Electron |
| `npm test` | Run the automated tests (`node --test`) |
| `npm run samples` | Regenerate `samples/native-demo` |
| `npm run licenses` | Check shipped dependency licences, regenerate `THIRD_PARTY_NOTICES.md` |
| `npm run package:win` | Build and create `release/Tessera-<version>-win-x64/` and its `.zip` |

## Producing a release

```bash
npm ci
npm test
npm run licenses
npm run package:win
```

The result is `release/Tessera-<version>-win-x64.zip` (about 155 MB; 360 MB extracted). It
contains `Tessera.exe`, the Electron runtime, the application archive (`resources/app.asar`),
Electron's and Chromium's licence files, this project's licence and notices, and the sample
projects. Settings are written to a `data` folder created next to `Tessera.exe` on first run.

### Reproducibility

* All dependency versions are pinned exactly in `package.json` and locked in `package-lock.json`.
* The Electron version comes from the installed `electron` package; its download is verified
  against Electron's published SHA-256 checksums (by `@electron/get`, or manually as below).
* The build does not depend on the machine's global tools beyond Node.js and npm.

### Offline or restricted networks

`npm ci` downloads the Electron binary from GitHub. If that is blocked or unreliable:

1. Download `electron-v<version>-win32-x64.zip` and `SHASUMS256.txt` from
   `https://github.com/electron/electron/releases/tag/v<version>` and check the SHA-256.
2. Install without the download: `set ELECTRON_SKIP_BINARY_DOWNLOAD=1 && npm ci`.
3. Extract the ZIP into `node_modules/electron/dist` and create `node_modules/electron/path.txt`
   containing `electron.exe`.
4. Package with `set ELECTRON_ZIP_DIR=<folder containing the zip> && npm run package:win`.

## Code signing

The package is not code-signed. For distribution to organisations, sign `Tessera.exe` with an
Authenticode certificate (for example with `signtool`) after packaging, then re-create the ZIP.

## Project layout for contributors

See [ARCHITECTURE.md](ARCHITECTURE.md). Core modules run directly in Node.js without a build
step, so `npm test` exercises the same files that the editor and the runtime bundle use.
