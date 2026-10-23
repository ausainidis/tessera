# Licensing

## The application

Tessera is licensed under the **Apache License 2.0**.

Reasons for this choice:

* It is a permissive licence: organisations can use, modify and redistribute Tessera,
  including internally modified versions, without having to publish their changes.
* It includes an explicit patent licence from contributors, which matters for a tool that
  institutions may adopt widely.
* It is compatible with the licences of all shipped dependencies (MIT, BSD-2-Clause) and with
  Electron (MIT) and Chromium's licences.

Copyleft licences (GPL, MPL) were considered. GPL would raise questions about the runtime files
that are copied into every published course; Apache-2.0 avoids that.

## Your content and published courses

* Courses, media, themes and projects you create are yours. Tessera claims no rights in them.
* Published courses contain two Tessera files, `_tessera/runtime.js` and `_tessera/base.css`.
  They are Apache-2.0 and carry a one-line notice. You may distribute them with your course,
  on any terms you choose for your own content; keep the notice line.
* Imported material keeps its original licence. Importing a Rise export does not change the
  terms under which you may use that export or the Rise player code it contains.

## Third-party components

`npm run licenses` checks every package that ends up in the application against an allow-list
(MIT, ISC, BSD, Apache-2.0 and similar permissive licences) and regenerates
[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md). Electron's and Chromium's licence files
(`LICENSE`, `LICENSES.chromium.html`) are shipped in the application folder.

Run the check before every release and whenever dependencies change.
