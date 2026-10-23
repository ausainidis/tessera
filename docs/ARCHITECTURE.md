# Architecture

## Technology choices

| Concern | Choice | Reason |
|---|---|---|
| Desktop shell | Electron 45 | Bundles Chromium and Node.js, so users install nothing. Gives local file access and separately sandboxed web contents for previews. The preview engine is the same Chromium learners commonly use. |
| Editor UI | React 19, built with Vite 8 | Vite is used only during development and to build the UI. End users run the built files. |
| Language | Modern JavaScript (ES modules) with JSDoc | No compile step for core modules; tests run directly on the source with `node --test`. |
| HTML parsing | htmlparser2 | Small, fast, works in Node and in the browser, keeps source positions (needed to edit imported HTML in place). |
| ZIP | fflate | Pure JavaScript, no native binaries to package. |
| Image optimisation | Electron `nativeImage` | Uses Chromium's codecs, so no native add-on such as sharp has to be shipped. |

Tauri was considered (smaller downloads) but needs WebView2 behaviour that varies by Windows
version and a Rust toolchain for contributors. Electron gives one predictable rendering engine
for preview and testing.

## Modules

```
src/
├── core/           Project model. Pure JavaScript, no Node or DOM APIs. Runs in the editor,
│   │               in Node (importers, export, tests) and partly in the published runtime.
│   ├── model.js        constructors, ids, lesson/block creation
│   ├── operations.js   immutable editing operations + capability checks
│   ├── serialize.js    state ⇄ project files
│   ├── migrate.js      format versions and migrations
│   ├── validate.js     content, accessibility, asset and external-dependency checks
│   ├── theme.js        theme defaults, CSS variables, contrast calculation
│   ├── overrides.js    per-block design overrides
│   ├── richtext.js     the HTML sanitiser shared by every layer
│   ├── assessment.js   scoring (also bundled into the learner runtime)
│   └── blocks/         block library: one definition object per block type
├── renderer/       Course renderer and learner runtime
│   ├── render.js       state → HTML document (used by preview AND publishing)
│   └── runtime/        navigation, widgets, assessment, tracking adapters, base.css
├── io/             Node-only file handling: atomic/journaled saves, autosave, checkpoints,
│                   asset import/replace/optimise, safe ZIP handling
├── import/         Import pathways
│   ├── detect.js       decides which pathway applies
│   ├── index.js        analysis → compatibility report → project creation
│   ├── rise/           Rise data container, mapping table, preserve/convert adapter
│   ├── html/           static HTML analysis, in-place editing, conversion
│   └── writeback.js    turns edits in preserved imports into updated source files
├── export/         Web folder, ZIP, SCORM 1.2 manifest
├── desktop/        Electron main process, preload bridge, custom protocols, IPC
└── editor/         React UI
```

Dependencies point downwards only: `editor` and `desktop` use `core`, `renderer`, `import`,
`export` and `io`; `core` uses nothing else in the project. This is what lets the same model
and renderer run in the editor, in Node and in tests.

## Data flow

1. **Open.** The main process reads the project folder (`io/project-store.js`), completes any
   interrupted save, marks missing asset files, and sends the state to the editor.
2. **Edit.** Every change is a pure function from `core/operations.js` applied in the editor's
   reducer. The previous state goes onto the undo stack. Unchanged lessons are shared between
   states, so history is cheap. Typing in one field is merged into one undo step.
3. **Preview.** The editor renders the course with `renderer/render.js` and hands the document
   to the main process, which serves it on the isolated `tessera-preview://` origin together
   with the project's files and the runtime. After the first load, content edits replace only
   the changed lesson in the running preview by `postMessage`, so the scroll position is kept.
4. **Autosave.** A few seconds after the last change, the state is written to
   `.tessera/autosave.json`. Saved project files are not touched.
5. **Save.** The main process serialises the state, writes only changed files using the
   journaled procedure in [PROJECT_FORMAT.md](PROJECT_FORMAT.md), and deletes the autosave.
6. **Publish.** `export/publish.js` renders the course once more, copies the runtime and only
   the files the course references, and writes an export report.

Preserved imports differ at steps 3, 5 and 6: `import/writeback.js` computes updated source files
(the Rise data file, or edited HTML pages). They are served from memory in the preview, written
in the same save transaction as the Tessera files, and copied into published output.

## Block interface

Each block type is one plain object (see [BLOCK_INTERFACE.md](BLOCK_INTERFACE.md)) declaring its
content fields, editing controls, rendering, validation and accessibility checks. The editor
builds its forms from the field declarations, so a new block type needs no UI code.

## Import adapters

`import/detect.js` classifies the input as a native project, Rise export, Vite source project,
compiled web bundle or static HTML site, and each kind has its own pathway. Analysis never
executes imported scripts and never runs package managers or build tools. See
[COMPATIBILITY.md](COMPATIBILITY.md).

Preserved imports bind Tessera blocks to the original structures (`block.source`). An adapter
supplies the mapping in both directions and the list of fields it can write back. Write-back
changes only fields the author edited, so untouched content keeps its exact original markup;
for Rise this makes an unedited save byte-identical.

## Runtime and tracking

The learner runtime (`renderer/runtime`, about 18 KB minified) is bundled into
`_tessera/runtime.js` in every published course. It handles navigation, progress, sequential
locking, continue gates, interactive widgets, knowledge checks and assessments, and works from
static markup that is readable without JavaScript.

Progress, scores and resume data go through a tracker interface (`load`, `save`, `setLocation`,
`setProgress`, `setScore`, `complete`, `finish`). The local tracker stores progress in the
learner's browser; the SCORM 1.2 tracker talks to an LMS. SCORM 2004, xAPI and cmi5 can be added
as further trackers without changing blocks or the renderer.

## Editing safeguards

| Risk | Safeguard |
|---|---|
| Crash or power loss during save | Temp file + fsync + rename per file; journal for multi-file saves, completed on next open |
| Crash with unsaved work | Autosave to `.tessera/autosave.json`; recovery prompt on next open |
| Unwanted edits | Undo/redo (200 steps); named checkpoints in `.tessera/checkpoints` |
| Deleting a lesson or replacing a file | Old files move to `.tessera/trash`, not deleted |
| Damaging imported material | Original kept byte-for-byte in `imports/<id>/original`; edits go to a working copy |
| Opening a project from a newer version | Refused with an explanation instead of being read lossily |
| Overwriting unrelated folders | Imports and publishing refuse non-empty destination folders |

## Security

See [SECURITY.md](SECURITY.md). In short: the editor UI is sandboxed without Node.js; all file
access goes through a small allow-listed IPC surface in the main process; previews and imported
code run on a separate origin in sandboxed frames that never receive that bridge.
