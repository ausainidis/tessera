# Tessera native project format — version 1

A Tessera project is an ordinary folder. Everything needed to reopen and edit the course is
stored in versioned, human-readable JSON files and plain media files, using **relative paths
only**, so a project can be copied, zipped, versioned with Git, or moved to another computer
and reopened unchanged.

JSON Schemas for each file are in [`schemas/`](../schemas). The reference implementation is
[`src/core/serialize.js`](../src/core/serialize.js) and [`src/io/project-store.js`](../src/io/project-store.js).

## Folder layout

```
my-course/
├── tessera-project.json        Manifest: course, lesson order, navigation, settings
├── lessons/
│   └── lsn_<id>.json           One file per lesson, containing its blocks
├── themes/
│   └── theme.json              Design settings (colours, typography, spacing, …)
├── assets.json                 Asset registry: asset id → file
├── assets/                     Media copied into the project
│   ├── images/  audio/  video/  captions/  fonts/  files/
├── components/                 Custom web components (HTML/CSS/JS), one folder each
├── source/                     Working copy of a preserved import (Rise / HTML), if any
├── imports/
│   └── imp_<id>/
│       ├── original/ | original.zip   Untouched copy of what was imported
│       └── report.json                The compatibility report shown at import time
└── .tessera/                   Editor state; never needed to open the project
    ├── autosave.json           Unsaved work (crash recovery)
    ├── checkpoints/            Named snapshots
    ├── journal.json            Present only while a save is in progress
    └── trash/                  Deleted lesson files, replaced assets, deleted checkpoints
```

Only `tessera-project.json` is required. Missing optional files are reported on open and
replaced by defaults (for example, a missing theme falls back to the default theme).

## Conventions

* **Encoding:** UTF-8, two-space indentation, trailing newline, LF or CRLF accepted.
* **Paths:** project-relative, forward slashes, no `..`, no drive letters or leading `/`.
  Paths that would leave the project folder are refused when reading and writing.
* **Identifiers:** `<prefix>_<random>` (`crs_` course, `lsn_` lesson, `blk_` block, `itm_` list
  item, `chc_` answer choice, `ast_` asset, `thm_` theme, `imp_` import). Generated once, never
  derived from titles or positions, and never reused. Identifiers survive reordering, renaming,
  duplication of *other* items, relocation and re-import.
* **Unknown fields** written by newer versions or plug-ins are preserved when the editor
  re-saves a file it can read.

## `tessera-project.json`

```json
{
  "format": "tessera-project",
  "formatVersion": 1,
  "id": "crs_8x1k2m0d9q3z",
  "generator": { "name": "Tessera", "version": "0.1.0" },
  "course": {
    "title": "Handling Personal Data",
    "description": "<p>Rich text (sanitised HTML subset)</p>",
    "objectives": ["Recognise personal data", "…"],
    "language": "en",
    "author": ""
  },
  "lessons": ["lsn_a1…", "lsn_b2…"],
  "navigation": { "mode": "free", "showOutline": true, "showProgress": true, "showLessonNav": true, "coverPage": true },
  "theme": "themes/theme.json",
  "stylesheets": [],
  "styleMap": { "text": { "className": "lead" } },
  "publish": { "includeSource": false },
  "source": null,
  "imports": [],
  "created": "2026-10-23T20:00:00.000Z",
  "modified": "2026-10-23T21:00:00.000Z"
}
```

| Field | Meaning |
|---|---|
| `format`, `formatVersion` | Identify the file. A reader must refuse a `formatVersion` newer than it supports. |
| `lessons` | Lesson order. Each id refers to `lessons/<id>.json`. |
| `navigation.mode` | `free` (any order) or `sequential` (lessons unlock in order). |
| `stylesheets` | Extra CSS files (e.g. from an imported site) loaded after the theme. |
| `styleMap` | Explicit mapping from block type to CSS class names of an imported design. Blocks of that type get the class added. |
| `source` | `null` for native courses. For preserved imports: `{ adapter, mode: "preserve", root, entry, dataFile?, variant?, capabilities }`. |
| `imports` | History of imports: kind, strategy, date, location of the untouched original and the report. |

## Lesson files: `lessons/<id>.json`

```json
{
  "format": "tessera-lesson",
  "formatVersion": 1,
  "id": "lsn_a1…",
  "title": "Everyday habits",
  "kind": "lesson",
  "description": "",
  "blocks": [
    {
      "id": "blk_k3j9x0a1qz7m",
      "type": "imageText",
      "v": 1,
      "content": { "asset": "ast_…", "alt": "…", "heading": "Lock your screen", "html": "<p>…</p>", "imagePosition": "right" },
      "settings": {},
      "overrides": { "background": "#f3f5f7" }
    }
  ]
}
```

* `kind`: `lesson`, `assessment` (scored) or `section` (an outline heading without content).
* Assessment lessons have an `assessment` object:
  `{ "passThreshold": 80, "attempts": 0, "shuffleQuestions": false, "shuffleChoices": false, "feedback": "after-each" | "at-end" | "none", "revealAnswers": true, "requiredForCompletion": true }`
  (`attempts: 0` means unlimited).
* Each block has a `type`, a block schema version `v`, `content` (fields defined by the block
  type, see [BLOCK_INTERFACE.md](BLOCK_INTERFACE.md)), `settings` (presentation options) and
  `overrides` (explicit per-block design overrides; empty means "follow the theme").
* Optional `source` on lessons/blocks binds them to a preserved import:
  `{ "adapter": "rise", "ref": "<original id>", "editable": ["html"], "fixed": ["items"] }`.
  Only `editable` fields can be changed; `fixed` lists may be edited but not resized.
* Optional `origin` records where converted content came from (informational only).

Rich-text fields contain a sanitised HTML subset: `p, br, strong, em, u, s, a[href], ul, ol,
li, code, sub, sup, blockquote, span[lang]`. Inline fields exclude block elements. The
sanitiser runs on input, import and output, so hand-edited JSON cannot inject script.

### Assessment data

Knowledge checks (`knowledgeCheck`) and scored questions (`assessmentQuestion`) share one
structure:

```json
{ "mode": "single" | "multiple", "question": "<p>…</p>",
  "choices": [ { "id": "chc_…", "text": "…", "correct": true, "feedback": "…" } ],
  "feedbackCorrect": "…", "feedbackIncorrect": "…", "points": 1 }
```

Knowledge checks never contribute to a score. Scored attempts produce structured results
(`id`, `type`, `response`, `correctResponse`, `result`, `weighting`) that map directly onto
SCORM `cmi.interactions` and xAPI "answered" statements.

## `themes/theme.json`

```json
{
  "format": "tessera-theme", "formatVersion": 1, "id": "thm_…", "name": "Default",
  "colors": { "primary": "#1d5f8a", "onPrimary": "#ffffff", "text": "#1f2328", "muted": "#57606a",
              "background": "#ffffff", "surface": "#f3f5f7", "border": "#d0d7de", "accent": "#a8471a",
              "link": "#1d5f8a", "focus": "#c45a00", "success": "#1a7f37", "error": "#b42318" },
  "typography": { "bodyFont": "system", "headingFont": "system", "baseSize": 18, "lineHeight": 1.6,
                  "scale": 1.25, "headingWeight": 700,
                  "fonts": [ { "family": "Lato", "src": "assets/fonts/Lato-Regular.woff2", "weight": "400", "style": "normal" } ] },
  "spacing": { "blockGap": 40, "unit": 8 },
  "layout": { "contentWidth": 760, "wideWidth": 1120 },
  "borders": { "radius": 8, "width": 1 },
  "buttons": { "style": "filled" | "outline", "radius": 6, "uppercase": false },
  "customCss": ""
}
```

Themes are exported as standalone `.tessera-theme.json` files (with a `fonts/` folder next to
them) and can be imported into any project.

## `assets.json`

```json
{
  "format": "tessera-assets", "formatVersion": 1,
  "assets": {
    "ast_…": { "id": "ast_…", "path": "assets/images/desk.jpg", "kind": "image", "mime": "image/jpeg",
               "bytes": 182044, "sha256": "…", "originalName": "Desk photo.jpg", "addedAt": "…",
               "width": 1600, "height": 1067,
               "optimized": { "originalPath": "assets/images/desk.jpg", "originalBytes": 812000, "maxWidth": 1920, "quality": 82, "at": "…" } }
  }
}
```

Blocks refer to assets **by id**. Replacing a file changes `path` but keeps the id, so every
reference is preserved. Optimisation creates a new file and records the untouched original.

## Saving procedure

1. Serialise all files; compare with what is on disk; keep only changed files.
2. Write each changed file to `<name>.<random>.tmp` and `fsync` it.
3. Write `.tessera/journal.json` listing the pending renames (atomically).
4. Rename each temporary file over its target (retried briefly if Windows holds a lock).
5. Delete the journal; move lesson files no longer listed to `.tessera/trash/`; delete the autosave.

When a project is opened, a leftover journal is completed (all temporary files were fully
written before the journal existed), and stray temporary files without a journal are deleted.
A save therefore leaves either the complete old project or the complete new project.

## Versioning and migration

`formatVersion` is incremented for any incompatible change. Migrations live in
[`src/core/migrate.js`](../src/core/migrate.js) and upgrade older projects in memory when opened;
the upgraded format is written on the next save. Individual block types carry their own
version (`v`) with their own migrations. Projects from newer versions are refused with a
clear message rather than opened lossily.
