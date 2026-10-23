# Tessera

Tessera is an open-source desktop editor for responsive, block-based learning content. Courses
are ordinary project folders on your computer, published output is plain HTML that runs on any
static web host, and nothing requires an account, a server or an internet connection.

Version 0.1.0 is the technical prototype and first portable build described in the delivery
plan ([docs/ROADMAP.md](docs/ROADMAP.md)). It runs on Windows (x64).

## What it does

- Create, edit and reorder lessons, sections and scored assessments, with a course outline,
  cover page and configurable navigation (free or sequential).
- Edit 22 block types with drag-and-drop and keyboard alternatives, undo/redo and a live
  preview at desktop, tablet and mobile sizes. The preview uses the same renderer and runtime
  as the published course.
- Style courses with a theme (colours, fonts, spacing, widths, borders, buttons). Themes can be
  exported and reused. Per-block overrides are listed on each block and can be reset.
- Import Rise 360 web exports, static HTML sites and compiled web bundles. A compatibility report
  is shown before anything is converted, and the original is kept untouched in the project.
- Edit a Rise course in place while keeping the Rise player and its appearance ("preserve"), or
  convert it to a Tessera course ("convert").
- Add custom HTML/CSS/JavaScript components that run in an isolated frame.
- Publish a static web folder or ZIP, optionally with the editable project included. SCORM 1.2
  output is included as an experimental, untested feature.
- Autosave with crash recovery, named checkpoints, and journaled atomic saves.
- Accessibility checks: heading order, alternative text, captions and transcripts, colour
  contrast, link text; keyboard operation and visible focus throughout the editor.

## Running the portable app

1. Download `Tessera-<version>-win-x64.zip` and extract it anywhere (including a USB drive).
2. Run `Tessera.exe`. No installer, Node.js or other software is needed.
3. Open `Samples\native-demo` to explore a course that uses every block type, or import a
   folder from `Samples\import-examples` to try the import pathways.

Settings are kept in a `data` folder next to `Tessera.exe`. The build is not code-signed, so
Windows SmartScreen may ask for confirmation the first time.

## Building from source

Requirements: Node.js 20 or newer and npm, on Windows 10/11 x64.

```bash
npm ci
npm test
npm run package:win
```

`npm run dev` starts the editor with hot reload. See [docs/BUILD.md](docs/BUILD.md) for details,
offline builds and how to reproduce a release.

## Documentation

| Document | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Modules, data flow, editing safeguards |
| [docs/PROJECT_FORMAT.md](docs/PROJECT_FORMAT.md) | Native project format specification (v1) |
| [docs/BLOCK_INTERFACE.md](docs/BLOCK_INTERFACE.md) | How block types are defined and how to add one |
| [docs/COMPONENTS.md](docs/COMPONENTS.md) | Custom web component protocol |
| [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) | Import pathways and compatibility matrix |
| [docs/SECURITY.md](docs/SECURITY.md) | Isolation of imported and custom code |
| [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md) | What was tested and the results |
| [docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md) | What does not work yet |
| [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) | Status of each item in the developer brief |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Delivery sequence and next milestones |
| [docs/LICENSING.md](docs/LICENSING.md) | Licence choice, your rights to your content |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute |

## Licence

Tessera is licensed under the [Apache License 2.0](LICENSE). Courses you create and publish are
yours; the small runtime copied into published courses is also Apache-2.0 and places no
conditions on your content. Third-party components are listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

"Tessera" is a working name. Rise and Rise 360 are products of Articulate Global, LLC; Tessera is
not affiliated with Articulate.
