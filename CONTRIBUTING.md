# Contributing to Tessera

Thank you for helping. Contributions of code, tests, documentation, translations, and especially
**real import samples** (Rise exports, websites) are welcome.

## Getting started

```bash
npm ci
npm test
npm run dev
```

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first. Most work happens in one of these places:

| You want to… | Look at |
|---|---|
| Add a block type | `src/core/blocks/`, [docs/BLOCK_INTERFACE.md](docs/BLOCK_INTERFACE.md), runtime widgets in `src/renderer/runtime/widgets.js` |
| Improve Rise support | `src/import/rise/mapping.js` (one mapper per Rise block), `test/import.test.js`, [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) |
| Add an LMS standard | a tracker in `src/renderer/runtime/tracking.js`, a manifest writer in `src/export/` |
| Change the file format | `src/core/serialize.js`, a migration in `src/core/migrate.js`, [docs/PROJECT_FORMAT.md](docs/PROJECT_FORMAT.md), `schemas/` |
| Work on the editor UI | `src/editor/` (React) |

## Rules of the road

* **Never lose user content.** Any change to saving, importing or write-back needs a test that
  proves untouched content stays byte-identical and edited content lands where expected.
* **Format changes are versioned.** Increase `FORMAT_VERSION`, add a migration and update the
  specification and schemas in the same pull request.
* **No execution of imported material** outside the sandboxed preview. Never add code that runs
  package managers, build tools or imported scripts in the main process or editor.
* **Accessibility is a requirement.** New UI must be keyboard operable with visible focus and
  proper labels; new blocks must render meaningful HTML without JavaScript.
* **Dependencies:** prefer none. Any new runtime dependency must have a permissive licence and
  pass `npm run licenses`.
* Match the style of the surrounding code (ES modules, two-space indentation, single quotes,
  short comments that explain why).

## Rise samples

Rise exports usually contain the author's content and Articulate's player code, so they cannot
be committed. To help validate a variant, run
`TESSERA_RISE_SAMPLES=<folder> npm test` locally and share the output (block types and counts
only), or share a sample privately with a maintainer if you are allowed to.

## Pull requests

1. One topic per pull request, with tests.
2. `npm test` passes; `npm run licenses` passes if dependencies changed.
3. Update the documentation that describes the behaviour you changed.
4. By contributing you agree that your contribution is licensed under Apache-2.0.

## Reporting problems

Include the Tessera version, Windows version, steps to reproduce, and (for imports) the
compatibility report from `imports/<id>/report.json`. Report security issues privately.
