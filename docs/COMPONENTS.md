# Custom web components

A custom component is a self-contained web page (HTML, CSS, JavaScript and its own assets) placed
in a folder under `components/` in the project and shown in a course with the **Web component**
block. Use it for interactions the block library does not cover.

## Creating one

In a Web component block, choose **Create a new component…**. Tessera creates
`components/<name>/` with `index.html`, `style.css` and `script.js` and opens the folder. Edit
the files with any editor; the preview shows changes after a reload (↻).

To bring in an existing project, build it first (Tessera does not run build tools) and choose
**Import a built web project…**, or import its folder through *Import a folder*, which detects
compiled bundles. Build with relative paths (Vite: `base: './'`).

## Definition (block settings)

| Setting | Meaning |
|---|---|
| Entry point | Project-relative HTML file, e.g. `components/sorting/index.html` |
| Title | Accessible name of the frame (required) |
| Sizing | `fixed` height in pixels, `aspect` ratio, or `auto` (the component reports its height) |
| Configuration | JSON object sent to the component when it loads |
| Completion | `none`, or `event`: the block counts as complete when the component says so |
| Allow storage access | Adds `allow-same-origin` to the frame. Off by default; see below |

Everything inside the component's folder is published with the course.

## Message protocol

Components communicate with the course only through `postMessage`.

| Direction | Message | When |
|---|---|---|
| component → course | `{ type: 'tessera:ready' }` | when the component's script starts (recommended) |
| course → component | `{ type: 'tessera:config', blockId, config }` | when the course starts, when the frame loads, and in reply to `tessera:ready` |
| component → course | `{ type: 'tessera:resize', height }` | content height changed (sizing `auto`) |
| component → course | `{ type: 'tessera:complete', score? }` | the learner finished (completion `event`) |

```js
window.addEventListener('message', (e) => {
  if (e.data?.type === 'tessera:config') start(e.data.config);
});
parent.postMessage({ type: 'tessera:ready' }, '*'); // ask for the configuration
new ResizeObserver(() => parent.postMessage({ type: 'tessera:resize', height: document.documentElement.scrollHeight }, '*'))
  .observe(document.body);
function finished(score) { parent.postMessage({ type: 'tessera:complete', score }, '*'); }
```

A completed component counts toward "Continue" gates that require activities to be completed.
Scores sent by components are recorded for the block but are not part of assessment scoring in
this version.

The configuration can arrive more than once (for example after the preview updates); treat
it as idempotent.

## Isolation

The frame is sandboxed with `allow-scripts allow-forms allow-popups allow-modals`. Without
`allow-same-origin` the component runs with an opaque origin: it cannot read the course page,
its progress data or cookies, and has no access to `localStorage`. In the editor, components run
inside the preview, which is itself isolated from the editor and has no access to the file
system or the desktop application (see [SECURITY.md](SECURITY.md)).

Exception: when a published course is opened directly from a local folder (`file://`),
Chromium-based browsers do not let an opaque-origin frame load its own script files. In that case
the runtime adds `allow-same-origin` so the component works, and the component can then reach the
course page. Host courses on a web server (any static host) to keep components fully isolated.

Enable *Allow storage access* only for code you trust that needs browser storage. With it, the
component shares the course's origin when published and could read the course page.
