# Known limitations (version 0.1.0)

## Platform and distribution

* Windows x64 only. macOS and Linux builds are not produced or tested.
* Not code-signed; SmartScreen shows a warning on first launch.
* No automatic updates. Electron security fixes reach users only through new Tessera releases.
* The package is about 155 MB zipped because it bundles Chromium.
* No application icon yet (Electron's default icon is used).
* Interface in English only; no localisation framework yet.

## Imports

* Rise: validated only against web exports from the 2026 Rise player (4 courses, one author).
  SCORM, xAPI, cmi5 and older exports, and localised multi-language exports, need real samples
  before they can be called supported. See [COMPATIBILITY.md](COMPATIBILITY.md).
* Rise preserve mode cannot add blocks or lessons, change the theme, or edit images, media,
  labelled graphics, scenarios, sorting activities, timelines, charts or Storyline blocks.
* Rise convert mode shows unsupported Rise blocks as placeholders (their data is kept).
* Rise image, gallery, multimedia and button blocks did not occur in the available samples;
  image mapping is implemented but unvalidated, the others are retained.
* Rise lesson descriptions, header images, cover page, labels and navigation settings are not
  editable.
* Static HTML: tested on synthetic sites only. Preserve mode edits text and image alternative
  text; it cannot add, remove or reorder elements. Convert mode drops page scripts (reported)
  and unwraps simple wrapper elements; multi-column layouts are kept as retained HTML.
* Compiled bundles are display-only; their content cannot be edited.
* Vite source projects are not built by Tessera (by design).
* Responsive appearance of imported material is whatever the original provided.

## Editing

* Rich-text editing uses the browser's built-in editing commands; complex pasted content is
  simplified to the supported HTML subset (headings in rich text become paragraphs).
* No tables block, no hotspot/labelled-graphic block, no timeline, no sorting/matching
  questions, no fill-in-the-blank questions.
* Multiple-response questions are scored all-or-nothing (no partial credit).
* Blocks cannot be moved between lessons by drag and drop (cut and paste is not implemented).
* No multi-user editing, comments or review workflow.
* No spell checking beyond Chromium's built-in spell checker.
* Image optimisation re-encodes JPEG and PNG only (SVG, GIF, WebP, AVIF are skipped) and does
  not convert to WebP/AVIF.
* Checkpoints store full snapshots of course data but not copies of media files; a checkpoint
  that refers to a file deleted outside Tessera shows it as missing.

## Accessibility

* The editor and runtime were built to WCAG 2.2 AA practices (semantic structure, keyboard
  operation, visible focus, contrast checks, live announcements) and checked with automated
  checks and keyboard runs. They have **not** been tested with screen readers (NVDA, JAWS,
  Narrator) or by disabled users. Treat accessibility as unverified until that is done.
* Automated checks cannot judge whether alternative text, captions or reading order are good.

## Published output and LMS

* SCORM 1.2 output is experimental and has not been tested in any LMS.
* SCORM 2004, xAPI and cmi5 are not implemented.
* Web output stores progress in the learner's browser (`localStorage`) only.
* Reflection answers are stored only in the learner's browser and are not reported.
* Answer keys are readable in the published course data.
* Opened from a local folder (`file://`), custom components run with same-origin access
  (Chromium blocks their scripts otherwise). On a web server they are fully sandboxed.
* Online videos (YouTube, Vimeo) need an internet connection; they are reported as external
  dependencies but not downloaded.

## Testing gaps

* No automated end-to-end UI test suite in CI; UI behaviour was checked with scripted runs of the
  real application (see [TEST_RESULTS.md](TEST_RESULTS.md)).
* Large courses (hundreds of lessons, gigabytes of media) have not been performance-tested.
* Windows paths longer than 260 characters have not been tested.
