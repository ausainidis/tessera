# Security model

Tessera opens material from other people and other tools: Rise exports, websites, compiled
JavaScript bundles and custom components. All of it is treated as untrusted.

## Processes and origins

| Context | Origin | Node.js | File access | Bridge to main process |
|---|---|---|---|---|
| Main process | n/a | yes | yes | n/a |
| Editor UI | `tessera-app://editor` | no (sandboxed, context isolation) | none directly | allow-listed IPC channels only |
| Preview (course or imported player) | `tessera-preview://project` | no | read-only, limited to the open project via the protocol handler | none |
| Custom components and embeds | opaque (sandboxed iframe inside the preview) | no | none | none |

* The editor window uses `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`,
  `webviewTag: false`, and a Content Security Policy that only allows its own scripts.
* The preload script exposes one `invoke` function limited to a fixed list of channels. Every IPC
  handler checks that the call comes from the editor's main frame. Preview frames never receive
  the preload bridge.
* The preview iframe uses `allow-same-origin` so imported players that need `localStorage` work,
  but its origin (`tessera-preview://project`) differs from the editor's, so it cannot reach the
  editor DOM or the IPC bridge.

## File access

* The editor cannot pass arbitrary paths for writing. Paths come from dialogs shown by the main
  process, from the recent-projects list kept by the main process, or from files the user drags
  onto the window. Project files are always resolved inside the open project folder.
* `resolveInside()` rejects absolute paths, drive letters, UNC paths and `..`. The preview
  protocol also resolves symbolic links and junctions and refuses targets outside the project.
* The preview protocol never serves the `.tessera/` folder or any dot-folder, and never lists
  folders.
* ZIP extraction rejects entries that would escape the destination ("zip slip") and archives that
  expand beyond 4 GB.

## Imported code

* Opening or importing never executes imported scripts in a privileged context. Analysis reads
  files as text.
* Tessera never runs `npm install`, package scripts (`postinstall` etc.), build tools or
  development servers. Vite source projects are reported as needing a build.
* Imported scripts run only inside the preview frame (and in published output, inside the
  learner's browser), never in the editor or main process.

## Other restrictions

* New windows are refused. Plain `https://` links opened from the preview go to the system
  browser; other schemes are blocked.
* Navigation of the editor window away from the editor origin is blocked.
* Permission requests (camera, microphone, location, notifications, etc.) are denied; only
  fullscreen (for video) and sanitised clipboard writes are allowed.
* Downloads triggered by web content are blocked inside the editor.

## Content sanitisation

Rich text is reduced to an allow-listed HTML subset on input, on import and again on output, so
hand-edited project files cannot inject scripts or event handlers into courses. Links are limited
to `http`, `https`, `mailto`, `tel`, fragments and project-relative paths. Text is escaped
everywhere else. Retained HTML from imported sites is the author's own material and is output
as it was, which is the purpose of retaining it; it is listed as retained in the report.

## Known gaps

* Courses opened directly from a local folder (`file://`) run custom components with
  same-origin access, because Chromium blocks their scripts otherwise (see COMPONENTS.md).
* The build is not code-signed.
* Answer keys are present in published courses' data (as in all client-side e-learning), so a
  determined learner can read them.
* Electron security updates require a new Tessera release. See [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md).

Report vulnerabilities privately to the maintainers rather than in a public issue.
