# Requirements status

Status of each item in the developer brief for version 0.1.0.
**Done**: implemented and tested. **Partial**: implemented with stated gaps. **Planned**: later milestone.

| # | Requirement | Status | Where / notes |
|---|---|---|---|
| 1 | Portable Windows app, no Node.js or server | Done | `npm run package:win` → extract-and-run folder/ZIP; settings in `data/` next to the exe. Tested from the packaged exe. Not code-signed. |
| 2 | Offline authoring; identify online dependencies | Done | No network use. Online videos and links reported in Checks and in the export report. Fonts are local files. |
| 3 | Open-source licence, source, build instructions, architecture, contribution guide, dependency licence check | Done | Apache-2.0 ([LICENSING.md](LICENSING.md)); [BUILD.md](BUILD.md); [ARCHITECTURE.md](ARCHITECTURE.md); [CONTRIBUTING.md](../CONTRIBUTING.md); `npm run licenses` → all shipped dependencies MIT/BSD-2-Clause. |
| 4 | Folder-based projects with relative asset paths | Done | [PROJECT_FORMAT.md](PROJECT_FORMAT.md). Relocation test passes. |
| 5 | Documented, versioned, human-readable format; explicit courses/lessons/blocks/themes/assessment; stable ids | Done | [PROJECT_FORMAT.md](PROJECT_FORMAT.md), [schemas/](../schemas), migrations in `src/core/migrate.js`. |
| 6 | Reliable reopening, also after moving; editable project alongside output | Done | Persistence tests; “Include the editable project” export option (reopen tested). |
| 7 | Course title, description, objectives; lesson create/order/duplicate/delete; outline; configurable navigation | Done | Outline and Course panels; sections; free or sequential navigation; cover page, outline, progress, previous/next toggles. |
| 8 | Visual block editing with drag-and-drop and accessible alternatives; contextual settings; immediate preview | Done | Drag handles plus ↑/↓ buttons and Alt+↑/↓ with live announcements; Content/Design tabs per block; live preview updating in place. |
| 9 | Initial block library | Done | 22 insertable types incl. all listed (headings … knowledge checks) plus flashcards, continue gate, web component. |
| 10 | Multiple choice / multiple response, feedback, attempts, pass thresholds; checks vs scored; structured data | Done | Knowledge check vs assessment question; per-answer and overall feedback; attempts, thresholds, shuffling, reveal; interactions recorded in SCORM/xAPI-ready shape. Partial credit not supported. |
| 11 | Themes: colours, typography, spacing, widths, borders, buttons; save/import/export/reuse; visible, resettable overrides | Done | Theme panel; `.tessera-theme.json` export/import with fonts; per-block Design tab lists overrides with reset. |
| 12 | Preserve imported appearance; open/save without edits preserves it | Partial | Rise preserve: byte-identical when unedited (validated on 4 real exports); HTML preserve edits in place. Rise variants beyond 2026 web exports are unvalidated. |
| 13 | New blocks use the project's design; explicit style mapping for imports | Done | All blocks use theme variables; style map (block type → CSS classes) for imported stylesheets; Rise convert derives the theme from Rise colours and fonts. |
| 14 | Distinct pathways for native, static HTML, Vite source, compiled bundles, Rise | Done | `src/import/detect.js`; Vite source is reported, never built. |
| 15 | Compatibility report before conversion | Done | Import wizard: evidence, strategies, editable/display-only/retained counts, per-block table, unsupported items, missing files, external dependencies, scripts, LMS packaging. Saved with the project. |
| 16 | Dedicated Rise adapter; supported variants established; prototype to validate editing | Partial | Adapter with preserve and convert. Validated: 2026 web exports. Other variants implemented from published descriptions, unvalidated. [COMPATIBILITY.md](COMPATIBILITY.md). |
| 17 | Persist edits in the content model or source structure | Done | Rise course JSON and HTML source files are updated through write-back, never by modifying the rendered page. |
| 18 | Preserve unsupported content, show limitations, never silently delete | Done | Retained blocks (Rise data or raw HTML kept), labelled in editor, report and Checks. Rise-deleted lessons kept. |
| 19 | Custom web components with entry point, assets, configuration, sizing, completion events | Done | Web component block, component scaffolding and folder import, message protocol ([COMPONENTS.md](COMPONENTS.md)). |
| 20 | Isolation of imported code; no install scripts on open | Done | Separate preview origin, sandboxed frames, no Node in renderers, allow-listed IPC, path confinement; no package scripts ever run. [SECURITY.md](SECURITY.md). Gap: `file://` viewing of components. |
| 21 | Desktop/tablet/mobile preview with widths and orientation, same rendering as output | Done | Preview toolbar; width slider; portrait/landscape; same renderer and runtime (tested for identical output). |
| 22 | Accessible authoring: headings, alt text, captions, keyboard, focus, contrast; flag issues | Partial | All implemented and checked automatically; not yet tested with screen readers. |
| 23 | Asset panel: import, preview, replace, locate, missing files, optional optimisation keeping originals | Done | Assets panel with usage, replace (keeps id), relink, reveal, optimise/revert (original kept), drag-and-drop import. |
| 24 | Undo/redo, autosave, recovery, checkpoints, working copy of imports, reliable writes | Done | See [ARCHITECTURE.md](ARCHITECTURE.md#editing-safeguards). |
| 25 | Web folder or ZIP for static hosting | Done | Tested on a static HTTP server and from `file://`. |
| 26 | SCORM 1.2 (later), then SCORM 2004/xAPI/cmi5; keep imported LMS integration only where tested | Partial | SCORM 1.2 experimental (untested in an LMS). Tracker interface ready for the others. Imported LMS files kept unchanged and flagged as untested. |
| 27 | Separated modules; documented block interface | Done | `core`, `renderer`, `io`, `import`, `export`, `desktop`, `editor`; [BLOCK_INTERFACE.md](BLOCK_INTERFACE.md). |
| 28 | Desktop framework with file access and isolated previews; Vite only for development | Done | Electron 45; Vite builds the UI only. |
| 29 | Validation: save/reopen, relocation, assets, responsive, assessment, recovery; before/after comparison of imports; real LMS | Partial | [TEST_RESULTS.md](TEST_RESULTS.md). Missing: LMS test, screenshot-diff comparison of imports. |
| 30 | Delivery sequence | In progress | Stage 1 prototype and most of stage 2 delivered. [ROADMAP.md](ROADMAP.md). |
| 31 | Handover: app, source, build instructions, format spec, samples, compatibility matrix, test results, limitations | Done | This repository, `release/`, `samples/`, docs listed in the README. |
