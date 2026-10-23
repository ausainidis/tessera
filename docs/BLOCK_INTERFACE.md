# Block interface

A block type is a plain JavaScript object registered with `registerBlock()` in
[`src/core/blocks/index.js`](../src/core/blocks/index.js). The same object is used by the editor
(forms, validation), the renderer (preview and published output), the importers and the tests.

## Definition

```js
export const callout = {
  type: 'callout',              // unique id, stored in project files
  version: 1,                   // block schema version (stored as block.v)
  title: 'Callout',             // shown in the block picker
  category: 'Text',             // Text | Media | Interactive | Learning | Assessment | Layout | Advanced
  icon: '!',                    // short text icon
  description: 'A highlighted tip or warning.',
  scope: 'any',                 // optional: 'assessment' restricts it to assessment lessons
  insertable: true,             // optional: false hides it from the picker (e.g. "retained")

  // Content fields. The editor builds its controls from these.
  fields: [
    { key: 'tone', label: 'Tone', type: 'select', options: [['tip', 'Tip'], ['warning', 'Warning']] },
    { key: 'html', label: 'Text', type: 'richtext', required: true },
  ],
  // Optional presentation settings, shown under the content fields.
  settings: [{ key: 'align', label: 'Alignment', type: 'select', options: [['left', 'Left'], ['center', 'Centre']] }],

  defaults: () => ({ tone: 'tip', html: '<p>Remember…</p>' }),
  defaultSettings: () => ({ align: 'left' }),

  // Required. Returns the inner HTML; the renderer adds the wrapper with id, classes,
  // overrides and style-map classes. Use theme variables (var(--tc-…)) for all design values.
  render(block, ctx) {
    return `<aside class="tc-callout tc-callout--${escapeHtml(block.content.tone)} tc-prose">${rich(block.content.html)}</aside>`;
  },

  // Optional hooks
  validate: (block, ctx) => [],         // content problems: { level, code, message, field }
  a11y: (block, ctx) => [],             // accessibility problems, same shape
  headings: (block) => [],              // [{ level, text }] for heading-order checks
  external: (block) => [],              // URLs needed at viewing time (offline report)
  files: (block) => [],                 // extra project files to publish (e.g. component folders)
  runtimeData: (block) => ({}),         // data for the learner runtime (answer keys, settings)
  text: (block) => '',                  // plain text for summaries and search
  newItem: () => ({ id: newId('itm') }),// template for "Add item" in list fields
  migrations: { 1: (block) => block },  // upgrade from version n to n+1
};
```

### Field types

| Type | Control | Stored value |
|---|---|---|
| `text`, `url` | single-line input | string |
| `textarea`, `json` | multi-line input (`json` is validated) | string |
| `richtext` | formatting toolbar: bold, italic, links, lists | sanitised HTML (block) |
| `inline` | formatting toolbar without lists/paragraphs | sanitised HTML (inline) |
| `number` | number input (`min`, `max`, `step`) | number |
| `select` | dropdown (`options: [[value, label]]`) | string or number |
| `boolean` | checkbox | boolean |
| `color` | colour picker + hex input | `#rrggbb` |
| `asset` | file chooser (`accept: image | audio | video | captions | font | file`) | asset id |
| `lesson` | lesson chooser | lesson id |
| `path` | project-relative path with component helpers | string |
| `list` | repeatable group (`itemFields`, `itemLabel`, `min`, `max`) | array of objects with `id` |
| `choices` | answer list for questions | array of `{ id, text, correct, feedback }` |
| `readonly` | displayed, not editable | any |

Fields can be shown conditionally with `showIf: { key, equals }`, `{ key, truthy: true }` or
`{ key, falsy: true }`.

### Context passed to `render`

`ctx.asset(id)` returns `{ url, entry }` for a present asset, or `null` (render a placeholder);
`ctx.state` is the project; `ctx.lesson` the containing lesson; `ctx.mode` is `preview` or
`publish`. Assessment questions also receive `questionNumber` and `questionCount`.

### Rules for block authors

* Escape every author string (`escapeHtml`, `escapeAttr`) and pass rich text through `rich()` /
  `inline()`, even though stored content is already sanitised.
* Produce meaningful HTML without JavaScript. Interactive behaviour belongs in the runtime
  (`src/renderer/runtime/widgets.js`) as progressive enhancement keyed on `data-tc="…"`.
* Use only theme variables for colour, type and spacing, so new blocks follow every theme.
* Never put correct answers in the markup; expose them through `runtimeData`.
* Report accessibility problems through `a11y`; they appear in the Checks panel and on the block.
* Add the type to `test/model.test.js` coverage by registering it; the generic tests render
  every registered block with its defaults.

## Styling hooks

The renderer wraps each block as:

```html
<div class="tc-block tc-block--callout tc-w-content [overrides] [style-map classes]"
     id="b-<blockId>" data-block-id="…" data-block-type="callout" style="--tc-block-bg:…">
  …render() output…
</div>
```

`tc-w-content | tc-w-wide | tc-w-full` set the width. Overrides become CSS custom properties
(`--tc-block-bg`, `--tc-block-color`, `--tc-block-pt`, `--tc-block-pb`, `--tc-block-radius`).
Classes from the project's style map are added for imported designs.
