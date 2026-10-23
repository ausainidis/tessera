# Test results — version 0.1.0

Test date: 23–24 October 2026. Environment: Windows 11 Home (10.0.26100), Node.js 24.14.1,
Electron 45.0.0. GPU acceleration was unavailable on the test machine, so Chromium used
software rendering; this did not affect results.

## 1. Automated test suite (`npm test`)

48 tests: **47 passed, 0 failed, 1 skipped** (the real-Rise test, which needs `TESSERA_RISE_SAMPLES`;
its results are in section 2).

| Area | Tests | Result |
|---|---|---|
| Saving and reopening | save → close → reopen identical and editable; versioned human-readable JSON; no rewrite when unchanged | Pass |
| Project relocation | project copied to another folder with a different name, original deleted, reopened with all assets resolved | Pass |
| Recovery | interrupted multi-file save completed from the journal; stray half-written temp files ignored and removed; autosave recovery; checkpoints; unlisted lesson files recovered; newer format refused | Pass |
| Asset integrity | missing files detected; replacement keeps the asset id and every reference; duplicate files de-duplicated by SHA-256 | Pass |
| Block library and model | all 23 block types implement the interface and render; lesson/block operations; nested ids renewed on duplicate; overrides validated and resettable; capability limits for preserved imports | Pass |
| Accessibility checks | missing alt text, heading-level skips, low contrast overrides, external media flagged; WCAG contrast reference values | Pass |
| Assessment | multiple choice and multiple response scoring, weighting, pass thresholds, attempt limits, shuffling; knowledge checks never scored | Pass |
| Rendering | author text escaped (script injection attempts in titles and headings); preview and published output identical apart from the preview flag | Pass |
| Publishing | static folder with only referenced files, every referenced file present, ZIP, included editable project reopens, SCORM 1.2 manifest, refusal to overwrite an unrelated folder | Pass |
| Imports | each source kind detected; Rise report; Rise preserve byte-identical without edits; Rise edits written to exactly the edited items; quiz settings written back; Rise-deleted lessons kept; Rise convert with retained raw data; static HTML report (missing files, external URLs, scripts, stylesheets); HTML preserve edits change only the edited elements; HTML convert keeps layouts and tables as retained HTML; bundle import with path fix in the copy only; ZIP input | Pass |
| Security | path traversal, drive letters, UNC and absolute paths refused; junctions to outside folders refused; zip-slip archive refused; components sandboxed without same-origin by default | Pass |

## 2. Rise validation against real exports

Four Rise 360 web exports (2026 player, `runtime-data.js` container) from a public GitHub
repository (`Bushmage/courses`). The repository has no licence, so the exports were only
inspected locally and are not included in this project. Run with
`TESSERA_RISE_SAMPLES=<folder> npm test`.

| Course | Lessons | Blocks | Editable | Retained | Unchanged data re-encodes byte-identically | One edit changes exactly one item |
|---|---|---|---|---|---|---|
| ai-tools | 7 | 59 | 59 | 0 | Yes | Yes |
| devices-email | 7 | 58 | 58 | 0 | Yes | Yes |
| passwords-mfa | 7 | 65 | 65 | 0 | Yes | Yes |
| phishing | 9 | 82 | 81 | 1 (sorting activity) | Yes | Yes |

Block variants present in the samples: text paragraph, heading + paragraph, impact statement
(`b`) and note, quote (`a`), numbered list, knowledge checks (multiple choice, multiple response;
feedback modes `CHOICE`, `CORRECT_INCORRECT`, `ANY`), accordion, flashcards, process,
sorting, continue, quiz lessons with multiple-choice questions. Two mapping errors found during
validation were fixed: flashcard sides use `type: "description"`, and single-answer
acknowledgement questions use shared `ANY` feedback.

In the desktop app, a preserved import of the `phishing` course ran the original Rise player
inside the isolated preview, opened at the selected lesson and block, and showed an edit made
in Tessera immediately.

## 3. Desktop application runs

Scripted runs of the real application (`--smoke-test` with `--smoke-script`), checked by
screenshots and frame content:

| Check | Result |
|---|---|
| Development build opens the sample project; preview renders through the isolated `tessera-preview://` origin | Pass |
| Edit a field → preview updates in place; preview scrolls to and highlights the selected block | Pass |
| Insert block from the picker (21 insertable types in a normal lesson), undo, redo | Pass |
| Keyboard reorder with Alt+Down; screen-reader announcement text produced | Pass |
| Checks panel lists issues (online video flagged as needing internet) | Pass |
| Preserved Rise project: lessons listed, add-lesson and add-block disabled, locked fields shown read-only, answer lists fixed-length | Pass |
| Converted Rise project: theme derived from Rise (accent colour, 9 font files) | Pass |
| Import wizard opened with `--import` on a real Rise export: report, strategies, per-block table | Pass |
| Custom component receives its configuration and renders inside the preview | Pass after fix (initial run found a load-order race; fixed with a `tessera:ready` handshake) |
| **Portable package** (`release/…/Tessera.exe`, no Node.js involved): opens bundled sample, assessment settings, mobile preview; settings written to `data/` next to the executable | Pass |

## 4. Published output in a browser

| Check | Result |
|---|---|
| Served by a plain static HTTP server: navigation, outline, knowledge check (wrong → retry → right), tabs, continue gate, process stepper, assessment (33 % fail with 2 attempts left → retry → 100 % pass), progress saved in `localStorage` | Pass |
| Mobile width (375 px): no horizontal overflow; off-canvas outline | Pass (fix applied so the closed menu is not keyboard-focusable) |
| Opened directly from disk (`file://`): navigation and knowledge check work | Pass |
| Custom component from `file://` | Pass after fix (Chromium blocks scripts in opaque-origin frames under `file://`; the runtime now relaxes the sandbox there only; documented) |
| Custom component over HTTP in the in-app test browser | Not testable: that browser blocks sub-frames (`ERR_BLOCKED_BY_CLIENT`). Verified instead in Electron. |

## 5. Not yet tested

* SCORM 1.2 package in a real LMS (required before release; e.g. SCORM Cloud, Moodle).
* Screen readers (NVDA, JAWS, Narrator) and testing with disabled users.
* Rise SCORM/xAPI/older exports; real static websites; real compiled bundles.
* Before/after visual comparison of imported material beyond the Rise byte-identity check
  (planned: automated screenshot diffing of original vs. preserved vs. published output).
* Large projects and long Windows paths.
