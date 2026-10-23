# Import pathways and compatibility matrix

Status labels used below:

* **Validated**: tested against real material (see [TEST_RESULTS.md](TEST_RESULTS.md)).
* **Implemented, unvalidated**: implemented from the observed structure or published third-party
  descriptions, covered by synthetic tests, not yet confirmed against real exports.
* **Retained**: kept unchanged and displayed, but not editable in Tessera.
* **Not supported**: reported, nothing is imported.

## Pathways

| Input | Detected by | Pathways | Status |
|---|---|---|---|
| Tessera project folder | `tessera-project.json` with `format: tessera-project` | Open in place | Validated |
| Rise 360 export (folder or ZIP) | Embedded course data (below), `lib/rise/` | Preserve, Convert | Validated for web exports from the 2026 player |
| Static HTML site | `.html` pages, no app bundle markers | Preserve, Convert | Validated on synthetic sites only |
| Compiled web bundle (Vite/webpack `dist`, SPA) | Hashed module bundles, empty app root | Embed as isolated component | Validated on synthetic bundles only |
| Vite source project | `vite.config.*` or `vite` in `package.json` | Report only; import an existing `dist/` as a bundle | Implemented |
| Anything else | | Report explaining why nothing can be imported | Implemented |

Vite is a build tool, not a course format. A Vite *source* folder contains code that must be
built; Tessera never runs installs, build scripts or dev servers. Build it yourself with
`base: './'` and import the output.

In every pathway the original input is copied unchanged into `imports/<id>/original` (or
`original.zip`) inside the new project, the compatibility report is saved as
`imports/<id>/report.json`, and the destination folder must be new or empty.

## Rise 360

### Export variants

| Variant | Course data container | Status |
|---|---|---|
| Web export (2026 player; `index.html`, `runtime-data.js`, `lib/`, `assets/`) | `runtime-data.js`: `__jsonp("runtime-data.js","<base64 JSON>")` | **Validated** on 4 real courses. Unchanged data re-encodes byte-for-byte. |
| Older exports with `window.courseData = "<base64>"` in `index.html` | inline in `index.html` | Implemented, unvalidated (reported by third parties) |
| Older exports with `deserialize("<base64>")` in `index.html` | inline in `index.html` | Implemented, unvalidated (reported by third parties) |
| SCORM 1.2 / SCORM 2004 / xAPI / cmi5 / AICC exports | Same containers inside the package (e.g. `scormcontent/`) | Detection implemented; **not yet validated**. LMS files are kept unchanged in Preserve mode; behaviour in an LMS after editing has not been tested. |
| Localised multi-language exports (`locales/*.js`) | per-locale files | Not supported; reported |

Rise hash routes `#/lessons/<lessonId>?blockId=<itemId>` (confirmed in the player code) are used to
open the preview at the selected lesson and block.

### Preserve vs Convert

| | Preserve | Convert |
|---|---|---|
| Rendering | Original Rise player, fonts and styles | Tessera renderer and theme (colours and fonts taken from Rise) |
| Appearance after save without edits | Identical (byte-identical data) | Different (Tessera design) |
| Edit supported text, questions, answers, feedback | Yes | Yes |
| Rename, reorder, delete lessons and blocks | Yes | Yes |
| Add new blocks or lessons | No (Rise's block format is not public) | Yes |
| Change theme | No | Yes |
| Unsupported Rise blocks | Displayed by Rise, unchanged | Placeholder; original JSON kept in the block |
| Output | The Rise export with edits applied | Tessera web output |

### Block mapping

| Rise item (`type/family/variant`) | Tessera block | Editable in Preserve | Status |
|---|---|---|---|
| `text/text/paragraph` | Text | text | Validated |
| `text/text/heading paragraph`, `subheading paragraph` | Text with heading | heading, text | Validated (`subheading` unvalidated) |
| `text/text/heading`, `subheading` | Heading | text | Implemented, unvalidated |
| `text/impact/a…d` (statements), `text/impact/note` | Quotation (statement / note) | text | Validated (`b`, `note`) |
| `quote/quote/a…d` | Quotation | text, attribution | Validated (`a`); avatar image kept but not shown in Convert |
| `quote` carousel | Retained | none | |
| `list/list/numbered`, `bulleted`, `checkboxes` | List | item text (not count/order) | Validated (`numbered`) |
| `knowledgeCheck` multiple choice / multiple response | Knowledge check | question, answers, correct flags, feedback | Validated, including feedback modes `CHOICE`, `CORRECT_INCORRECT`, `ANY` |
| `knowledgeCheck` fill-in-the-blank, matching | Retained | none | |
| `interactive/interactive/accordion` | Accordion | titles, content | Validated |
| `interactive/interactive/tabs` | Tabs | titles, content | Implemented, unvalidated |
| `interactive/flashcard/flashcard` (text sides) | Flashcards | front, back | Validated |
| flashcards with image sides | Retained | none | |
| `interactive/interactive-fullscreen/process` | Process steps | step titles and content | Validated (intro/summary items become steps) |
| `interactive/interactive-fullscreen/sorting` | Retained | none | Validated as retained |
| `divider/continue/continue` | Continue | button label, hint | Validated |
| `divider` (line, numbered, spacing) | Divider | none | Implemented, unvalidated |
| `image/*` | Image or Image and text | caption | Implemented, unvalidated (image paths `assets/<key>` per the export config) |
| gallery, multimedia (audio, video, embed, attachment, code), buttons, labeled graphic, timeline, scenario, charts, Storyline blocks | Retained | none | Not yet mapped |
| Lesson `type: blocks` | Lesson | title | Validated |
| Lesson `type: quiz` | Assessment | title; pass mark, attempts, shuffling | Validated |
| Quiz questions `MULTIPLE_CHOICE`, `MULTIPLE_RESPONSE` | Assessment question | question, answers, feedback | Validated (`MULTIPLE_CHOICE`) |
| Other quiz question types | Retained | none | |
| Lesson `type: section` | Section heading | title | Implemented, unvalidated |
| Lessons marked `deleted` in the data | Not shown; kept in place in the data | | Implemented (synthetic test) |

Quiz settings mapping: `passingScore` ⇄ pass threshold; `retryCount` −1 ⇄ unlimited attempts,
otherwise attempts = `retryCount + 1` (interpretation to be confirmed with more exports);
`randomizeQuestionOrder` ⇄ shuffle questions; `shuffleAnswerChoices` ⇄ shuffle answers.

Course title and description are written back. Lesson descriptions, header images, cover pages,
labels, navigation settings and LMS settings are kept unchanged and are not editable.

## Static HTML

| Element | Preserve (edited in place) | Convert |
|---|---|---|
| `h1`–`h6` (inline content) | Heading text | Heading (levels clamped to 2–4; a first `h1` equal to the page title becomes the lesson title) |
| `p`, `figcaption`, `td`, `th`, `dt`, `dd`, `summary`, `label`, `button`, `caption`, `blockquote` (inline content) | Text | `p` → Text; `blockquote` → Quotation |
| `ul`, `ol` with inline items | List items (fixed count) | List |
| `img` | Alternative text | Image (file copied into the project) |
| `figure` with one image and caption | caption via text binding | Image with caption |
| `details`/`summary` | summary text | Accordion (consecutive ones merged) |
| YouTube/Vimeo `iframe` | not bound | Video (online) |
| Multi-column layout containers | unchanged | Retained HTML (not flattened) |
| Simple wrapper `div`/`section` | walked into | unwrapped |
| Tables, forms, canvas, SVG, other widgets | unchanged | Retained HTML |
| Page scripts | kept and run in preview/output | not carried over (reported) |
| Stylesheets | kept | included after the theme; review the style map |

Preserve mode keeps every page exactly as it is apart from the edited elements; each edit
replaces only the content of that element in the source file.

## Compiled bundles

The bundle is copied to `components/<name>/` and shown in one Web component block (16:9 by
default; change sizing in the block). Absolute paths such as `/assets/app.js` in the entry file
are rewritten to relative paths in the copy (reported; the original is unchanged). Content inside
the bundle is display-only.

## LMS publishing

| Output | Status |
|---|---|
| Static web folder / ZIP | Implemented and tested (static server, local folder) |
| SCORM 1.2 | Experimental: manifest, completion, score, interactions and resume implemented; **not yet tested in an LMS** |
| SCORM 2004, xAPI, cmi5 | Not implemented; the tracker interface is ready for them |
| LMS packaging of preserved imports | Kept unchanged from the original; not tested after editing |
