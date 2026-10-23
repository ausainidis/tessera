# Roadmap

The brief sets three stages. This is where each stands after version 0.1.0.

## Stage 1: technical prototype (done)

Goal: prove native project editing and a representative Rise import.

* Native format, journaled saving, reopening and relocation: done and tested.
* Rise import: course data located and decoded in real 2026 web exports; byte-identical
  round trip; edits written back to exactly the edited items; the original Rise player runs in
  the isolated preview with edits applied; converting to native blocks works.
* Decision taken from the prototype: offer two Rise strategies (preserve and convert) rather
  than promising full Rise editing. Preserve keeps fidelity but cannot add blocks, because Rise's
  block format is undocumented and only observed structures can be written safely.

## Stage 2: portable editor (largely done)

Done: portable Windows build, 22 block types, themes, local preview, web/ZIP export, assets,
accessibility checks, safeguards, static HTML and bundle imports, custom components.

Remaining before calling stage 2 complete:

1. Screen-reader testing of the editor and the learner runtime (NVDA, Narrator), fixing findings.
2. Application icon, code signing, and an "About / licences" screen in the app.
3. Visual regression tests: screenshot the published sample and preserved imports at three
   widths and compare against approved images.
4. Collect more real material: Rise SCORM/xAPI exports, older Rise exports, real static sites;
   extend [COMPATIBILITY.md](COMPATIBILITY.md) from the results.
5. Editor end-to-end tests in CI using the scripted `--smoke-test` mode.

## Stage 3: wider imports and LMS publishing (planned)

1. SCORM 1.2: test in SCORM Cloud and Moodle (completion, score, resume, interactions), then
   remove the "experimental" label.
2. Rise: map images, galleries, multimedia, buttons, labelled graphics, timelines and sorting
   in convert mode; investigate safe insertion of simple blocks in preserve mode using
   structures observed in real exports.
3. Preserve LMS integration of imported Rise SCORM packages after editing, once tested.
4. SCORM 2004 4th edition, then xAPI/cmi5 as demand requires (new tracker adapters only).
5. Additional blocks: tables, labelled graphic/hotspots, timeline, matching and sorting questions.
6. macOS and Linux packages.

## Open decisions for the project owner

* Final product name (Tessera is a working name; check trademarks before release).
* Whether published courses should include an optional "Built with Tessera" credit (currently none).
* Hosting of releases and the public repository, and a security contact address.
