// Test fixtures, generated on demand so they are reproducible and licence-clean.
//
// The synthetic Rise export reproduces the STRUCTURE observed in real Rise 360 web exports
// (runtime-data.js with __jsonp + base64 JSON, lib/rise/, assets/). It contains no Rise
// code or content. Real exports can be tested with TESSERA_RISE_SAMPLES (see test/rise-real.test.js).

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { utf8ToBase64 } from '../src/import/rise/data.js';

export async function tempDir(name = 'tessera-test-') {
  return fs.mkdtemp(path.join(os.tmpdir(), name));
}

export const RISE_COURSE = {
  course: {
    id: 'c-synth-1',
    title: 'Synthetic Rise Course',
    description: '<div data-editor-id="x"><p>A synthetic course with the structure of a Rise export – including “curly quotes” and émojis 🎓.</p></div>',
    theme: { colorAccent: '#1b365d', blockCorners: 'ROUNDED' },
    headingTypeface: 'Open Sans',
    bodyTypeface: 'Open Sans',
    lessons: [
      {
        id: 'L1', type: 'blocks', title: 'First lesson', position: 0, deleted: false,
        items: [
          { id: 'i1', type: 'text', family: 'text', variant: 'heading paragraph', settings: {}, items: [{ id: 'i1a', heading: 'Welcome &amp; hello', paragraph: '<p>Intro paragraph with <strong>bold</strong>.</p>' }] },
          { id: 'i2', type: 'text', family: 'text', variant: 'paragraph', settings: {}, items: [{ id: 'i2a', paragraph: 'Plain paragraph without tags.' }] },
          { id: 'i3', type: 'text', family: 'impact', variant: 'note', settings: {}, items: [{ id: 'i3a', paragraph: 'A note.' }] },
          { id: 'i4', type: 'list', family: 'list', variant: 'numbered', settings: {}, items: [{ id: 'i4a', number: '1', paragraph: 'One' }, { id: 'i4b', number: '2', paragraph: 'Two' }] },
          { id: 'i5', type: 'knowledgeCheck', family: 'knowledgeCheck', variant: 'multiple choice', settings: {}, items: [{ id: 'q1', type: 'MULTIPLE_CHOICE', title: 'Pick B', answers: [{ id: 'a1', title: 'A', correct: false, feedback: '' }, { id: 'a2', title: 'B', correct: true, feedback: '' }], feedbackType: 'CORRECT_INCORRECT', feedbackCorrect: 'Yes', feedbackIncorrect: 'No' }] },
          { id: 'i6', type: 'interactive', family: 'interactive', variant: 'accordion', settings: {}, items: [{ id: 'i6a', title: 'Section', description: '<p>Body</p>' }] },
          { id: 'i7', type: 'interactive', family: 'interactive-fullscreen', variant: 'sorting', settings: {}, items: [{ id: 's1', title: 'Card', pileId: 'p1' }], piles: [{ id: 'p1', title: 'Pile' }] },
          { id: 'i8', type: 'interactive', family: 'flashcard', variant: 'flashcard', settings: {}, items: [{ id: 'f1', front: { type: 'description', description: '<p>Front</p>' }, back: { type: 'description', description: '<p>Back</p>' } }] },
          { id: 'i9', type: 'divider', family: 'continue', variant: 'continue', settings: {}, items: [{ id: 'c1', type: '', title: 'Continue', completeHint: 'Complete the content above before moving on.' }] },
        ],
      },
      { id: 'L0', type: 'blocks', title: 'Deleted lesson', position: 1, deleted: true, items: [] },
      {
        id: 'L2', type: 'quiz', title: 'Quiz', position: 2, deleted: false,
        settings: { passingScore: 80, retryCount: -1, revealAnswers: 'all', randomizeQuestionOrder: false, shuffleAnswerChoices: false },
        items: [
          { id: 'qq1', type: 'MULTIPLE_CHOICE', title: 'Question one', answers: [{ id: 'x1', title: 'Right', correct: true, feedback: '' }, { id: 'x2', title: 'Wrong', correct: false, feedback: '' }], correct: 'x1', corrects: ['x1'], feedbackCorrect: '', feedbackIncorrect: '' },
          { id: 'qq2', type: 'MATCHING', title: 'Unsupported question type', pairs: [] },
        ],
      },
    ],
  },
  labelSet: { iso639Code: 'en' },
  fonts: [],
};

/** Write a synthetic Rise web export. Returns its folder. */
export async function makeRiseExport(dir, course = RISE_COURSE) {
  await fs.mkdir(path.join(dir, 'lib', 'rise'), { recursive: true });
  await fs.mkdir(path.join(dir, 'assets'), { recursive: true });
  await fs.writeFile(path.join(dir, 'index.html'), `<!doctype html>
<!--
course package version: SYNTHETIC
rise_frontend sha: 0000000000000000000000000000000000000000
 -->
<html lang="en"><head><meta charset="utf-8"><title>${course.course.title}</title>
<script type="application/json" id="__CONFIG__">{"assetTargetPrefixes":{"media":"assets","font":"lib/fonts"},"surface":"web-export"}</script>
</head><body><div id="app"></div><script src="lib/rise/player.js"></script></body></html>
`);
  await fs.writeFile(path.join(dir, 'lib', 'rise', 'player.js'), '/* placeholder: the real Rise player is not included */\n');
  await fs.writeFile(path.join(dir, 'runtime-data.js'), `__jsonp("runtime-data.js","${utf8ToBase64(JSON.stringify(course))}");`);
  return dir;
}

/** Write a small static website. Returns its folder. */
export async function makeStaticSite(dir) {
  await fs.mkdir(path.join(dir, 'css'), { recursive: true });
  await fs.mkdir(path.join(dir, 'img'), { recursive: true });
  await fs.writeFile(path.join(dir, 'css', 'site.css'), '.title{color:#7a1f5c}.lead{font-size:1.2em}.cols{display:grid;grid-template-columns:1fr 1fr}\n');
  await fs.writeFile(path.join(dir, 'img', 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>\n');
  await fs.writeFile(path.join(dir, 'index.html'), `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Site Home</title>
  <link rel="stylesheet" href="css/site.css">
</head>
<body>
  <main>
    <h1 class="title">Site Home</h1>
    <p class="lead">Welcome to the <em>site</em>.</p>
    <img src="img/logo.svg" alt="Logo">
    <ul><li>First</li><li>Second</li></ul>
    <div class="cols"><div><p>Left</p></div><div><p>Right</p></div></div>
    <table><tr><td>Cell</td></tr></table>
    <details><summary>More</summary><p>Hidden text</p></details>
    <p><a href="page2.html">Next page</a></p>
    <img src="img/missing.png" alt="">
  </main>
  <script>document.title = document.title;</script>
</body>
</html>
`);
  await fs.writeFile(path.join(dir, 'page2.html'), `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Second Page</title><link rel="stylesheet" href="css/site.css"></head>
<body><h1>Second Page</h1><h2>Sub heading</h2><p>Second page text.</p><iframe src="https://www.youtube.com/embed/aqz-KE-bpKQ" title="Video"></iframe></body></html>
`);
  return dir;
}
