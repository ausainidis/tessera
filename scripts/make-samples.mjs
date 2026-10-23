// Generates the sample projects in samples/. Run with: npm run samples
// The samples are also used by the test suite and demonstrate every block type.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProject, createBlock, createLesson } from '../src/core/model.js';
import { addAssets } from '../src/core/operations.js';
import { ProjectStore } from '../src/io/project-store.js';
import { importAssetFiles } from '../src/io/assets.js';
import { makeRiseExport, makeStaticSite } from '../test/fixtures.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAMPLES = path.join(ROOT, 'samples');

function svg(label, hue) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 55% 42%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360} 60% 28%)"/></linearGradient></defs>
  <rect width="1200" height="800" fill="url(#g)"/>
  <circle cx="930" cy="210" r="140" fill="hsl(${hue} 70% 80% / .35)"/>
  <rect x="110" y="520" width="560" height="26" rx="13" fill="#fff" opacity=".5"/>
  <rect x="110" y="570" width="380" height="26" rx="13" fill="#fff" opacity=".35"/>
  <text x="110" y="460" font-family="Segoe UI, Arial, sans-serif" font-size="84" font-weight="700" fill="#fff">${label}</text>
</svg>\n`;
}

/** A short sine-tone WAV, so the audio block has a real local file. */
function wav(seconds = 1.5, freq = 440) {
  const rate = 8000;
  const n = Math.floor(rate * seconds);
  const buf = Buffer.alloc(44 + n);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate, 28); buf.writeUInt16LE(1, 32); buf.writeUInt16LE(8, 34); buf.write('data', 36); buf.writeUInt32LE(n, 40);
  for (let i = 0; i < n; i += 1) buf[44 + i] = Math.round(128 + 60 * Math.sin((2 * Math.PI * freq * i) / rate) * Math.min(1, (n - i) / 800));
  return buf;
}

const COMPONENT = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sorting activity</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; margin: 0; padding: 20px; color: #1f2328; }
  h1 { font-size: 1.1rem; margin: 0 0 12px; }
  ul { list-style: none; padding: 0; display: grid; gap: 8px; }
  button { font: inherit; padding: 8px 14px; border-radius: 6px; border: 1px solid #888; background: #fff; cursor: pointer; }
  button[aria-pressed=true] { background: #1d5f8a; color: #fff; border-color: #1d5f8a; }
  .done { margin-top: 12px; font-weight: 600; color: #1a7f37; }
</style></head>
<body>
<h1 id="title">Select every item that is personal data</h1>
<ul id="items"></ul>
<p class="done" id="done" role="status"></p>
<script src="activity.js"></script>
</body></html>
`;

const COMPONENT_JS = `// Example custom component using the Tessera component protocol (docs/COMPONENTS.md).
let config = { items: [] };
const list = document.getElementById('items');
const done = document.getElementById('done');
const report = () => parent.postMessage({ type: 'tessera:resize', height: document.documentElement.scrollHeight }, '*');
function render() {
  list.innerHTML = '';
  for (const item of config.items) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = item.label;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => {
      b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
      const chosen = [...list.querySelectorAll('[aria-pressed=true]')].map((x) => x.textContent);
      const correct = config.items.filter((i) => i.personal).map((i) => i.label);
      if (chosen.length === correct.length && correct.every((c) => chosen.includes(c))) {
        done.textContent = 'All personal data found. Well done!';
        parent.postMessage({ type: 'tessera:complete', score: 1 }, '*');
      } else done.textContent = '';
      report();
    });
    li.appendChild(b);
    list.appendChild(li);
  }
  report();
}
window.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'tessera:config') { config = e.data.config || config; render(); }
});
render();
parent.postMessage({ type: 'tessera:ready' }, '*');
`;

async function nativeDemo() {
  const dir = path.join(SAMPLES, 'native-demo');
  await fs.rm(dir, { recursive: true, force: true });
  const media = path.join(SAMPLES, '.media-tmp');
  await fs.rm(media, { recursive: true, force: true });
  await fs.mkdir(media, { recursive: true });
  const write = (name, data) => fs.writeFile(path.join(media, name), data).then(() => path.join(media, name));
  const files = {
    hero: await write('workplace.svg', svg('Data at work', 205)),
    g1: await write('desk.svg', svg('Clear desk', 160)),
    g2: await write('screen.svg', svg('Lock screen', 25)),
    g3: await write('shred.svg', svg('Shred paper', 280)),
    audio: await write('briefing.wav', wav()),
    captions: await write('briefing.vtt', 'WEBVTT\n\n00:00.000 --> 00:01.500\n[Tone] Briefing starts.\n'),
    sheet: await write('checklist.txt', 'Data protection checklist\n\n[ ] Lock your screen\n[ ] Use approved storage\n[ ] Report incidents within 24 hours\n'),
  };

  let state = createProject({ title: 'Handling Personal Data', starter: false });
  state.manifest.course.description = '<p>A short sample course that shows every Tessera block type. It works fully offline except for the online video example.</p>';
  state.manifest.course.objectives = ['Recognise personal data in everyday work', 'Apply three habits that protect it', 'Know when and how to report an incident'];
  state.manifest.course.author = 'Tessera sample';

  await fs.mkdir(dir, { recursive: true });
  const { added } = await importAssetFiles(dir, {}, Object.values(files));
  state = addAssets(state, added);
  const id = (file) => added.find((a) => a.originalName === path.basename(file)).id;

  const L = (title, kind, blocks) => {
    const l = createLesson({ title, kind });
    l.blocks = blocks;
    state.lessons[l.id] = l;
    state.manifest.lessons.push(l.id);
    return l;
  };
  const B = (type, content = {}, settings = {}) => createBlock(type, { content, settings });

  L('Getting started', 'section', []);
  L('What is personal data?', 'lesson', [
    B('image', { asset: id(files.hero), alt: 'Illustration titled Data at work', caption: 'Personal data appears in many everyday tasks.' }, { size: 'wide' }),
    B('text', { heading: 'Why it matters', headingLevel: 2, html: '<p><strong>Personal data</strong> is any information that relates to an identified or identifiable person. Handling it carefully protects people and your organisation.</p>' }),
    B('list', { style: 'bulleted', items: [{ id: 'itm_a1b2c3', html: 'Names and contact details' }, { id: 'itm_d4e5f6', html: 'Identification numbers' }, { id: 'itm_g7h8i9', html: 'Location data and online identifiers' }] }),
    B('quote', { variant: 'quote', html: '<p>Privacy is not about having something to hide. It is about having control.</p>', attribution: 'Sample attribution', role: 'Course author' }),
    B('knowledgeCheck', {
      mode: 'single',
      question: '<p>Which of these is personal data?</p>',
      choices: [
        { id: 'chc_kc1aaa', text: 'An employee’s home address', correct: true, feedback: 'Yes: an address identifies a person.' },
        { id: 'chc_kc1bbb', text: 'The opening hours of the office', correct: false, feedback: 'Opening hours do not relate to a person.' },
        { id: 'chc_kc1ccc', text: 'The average temperature in March', correct: false, feedback: '' },
      ],
      feedbackCorrect: 'Correct.',
      feedbackIncorrect: 'Not quite. Personal data relates to an identifiable person.',
      allowRetry: true,
    }),
  ]);
  L('Everyday habits', 'lesson', [
    B('heading', { text: 'Three habits', level: 2 }),
    B('imageText', { asset: id(files.g2), alt: 'Illustration titled Lock screen', heading: 'Lock your screen', html: '<p>Press <strong>Windows + L</strong> whenever you step away, even for a minute.</p>', imagePosition: 'right' }),
    B('gallery', { layout: 'grid', columns: 3, items: [
      { id: 'itm_gal001', asset: id(files.g1), alt: 'Clear desk illustration', caption: 'Clear desk' },
      { id: 'itm_gal002', asset: id(files.g2), alt: 'Lock screen illustration', caption: 'Lock screen' },
      { id: 'itm_gal003', asset: id(files.g3), alt: 'Shredding illustration', caption: 'Shred paper' },
    ] }),
    B('accordion', { items: [
      { id: 'itm_acc001', title: 'Clear desk', html: '<p>Put documents away at the end of the day.</p>' },
      { id: 'itm_acc002', title: 'Approved storage', html: '<p>Only store personal data in systems your organisation has approved.</p>' },
    ] }),
    B('tabs', { items: [
      { id: 'itm_tab001', title: 'At the office', html: '<p>Use the confidential waste bins.</p>' },
      { id: 'itm_tab002', title: 'At home', html: '<p>Keep work papers out of shared spaces.</p>' },
    ] }),
    B('continue', { label: 'Continue', requireComplete: false }),
    B('flashcards', { items: [
      { id: 'itm_fc0001', front: '<p>Data breach</p>', back: '<p>A security incident affecting personal data.</p>' },
      { id: 'itm_fc0002', front: '<p>Data subject</p>', back: '<p>The person the data is about.</p>' },
    ] }),
    B('divider', { style: 'dots' }),
    B('audio', { asset: id(files.audio), title: 'Short audio briefing', captions: id(files.captions), transcript: '<p>[A short tone plays.]</p>' }),
    B('video', { source: 'url', url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', title: 'Big Buck Bunny (Blender Foundation): example online video', transcript: '<p>Example transcript placeholder.</p>' }),
    B('attachment', { asset: id(files.sheet), label: 'Download the checklist', description: 'A plain-text checklist you can print.' }),
  ]);
  L('When things go wrong', 'lesson', [
    B('process', { intro: '<p>If you suspect a data breach, follow these steps.</p>', items: [
      { id: 'itm_pr0001', title: 'Contain', html: '<p>Stop the problem getting worse, for example recall an email.</p>' },
      { id: 'itm_pr0002', title: 'Report', html: '<p>Tell the data protection lead within 24 hours.</p>' },
      { id: 'itm_pr0003', title: 'Record', html: '<p>Write down what happened and when.</p>' },
    ], summary: '<p>Reporting quickly is always better than waiting.</p>' }),
    B('caseStudy', { title: 'The misdirected email', asset: id(files.g3), alt: 'Illustration', scenario: '<p>Sam sends a spreadsheet of client addresses to the wrong recipient.</p>', challenge: '<p>What should Sam do first?</p>', outcomeLabel: 'See what Sam did', outcome: '<p>Sam asked the recipient to delete the email and reported it within the hour.</p>' }),
    B('reflection', { prompt: '<p>Think of a time you handled personal data. What would you do differently now?</p>', placeholder: 'Your thoughts…', sampleAnswer: '<p>I would check the recipient list before sending.</p>' }),
    B('embed', { entry: 'components/data-sort/index.html', title: 'Sorting activity: personal data', kind: 'component', sizing: 'auto', config: JSON.stringify({ items: [{ label: 'Email address', personal: true }, { label: 'Office floor plan', personal: false }, { label: 'Payroll number', personal: true }] }), completion: 'event' }),
    B('button', { label: 'Go to the final assessment', action: 'lesson', lessonId: '' }, { align: 'center' }),
  ]);
  const quiz = L('Final assessment', 'assessment', [
    B('text', { html: '<p>Answer all questions. You need 80% to pass.</p>' }),
    B('assessmentQuestion', { mode: 'single', question: '<p>Within how many hours should you report a suspected breach?</p>', choices: [
      { id: 'chc_q1aaaa', text: '24 hours', correct: true, feedback: '' },
      { id: 'chc_q1bbbb', text: 'One week', correct: false, feedback: '' },
      { id: 'chc_q1cccc', text: 'Only if asked', correct: false, feedback: '' },
    ], feedbackCorrect: 'Correct.', feedbackIncorrect: 'The answer is 24 hours.', points: 1 }),
    B('assessmentQuestion', { mode: 'multiple', question: '<p>Which are good habits? Select all that apply.</p>', choices: [
      { id: 'chc_q2aaaa', text: 'Lock your screen', correct: true, feedback: '' },
      { id: 'chc_q2bbbb', text: 'Use approved storage', correct: true, feedback: '' },
      { id: 'chc_q2cccc', text: 'Email spreadsheets to personal accounts', correct: false, feedback: '' },
    ], feedbackCorrect: 'Correct.', feedbackIncorrect: 'Locking screens and approved storage are good habits.', points: 2 }),
  ]);
  quiz.assessment.attempts = 3;
  // Point the button at the assessment now that its id exists.
  const before = state.lessons[state.manifest.lessons[3]];
  before.blocks.at(-1).content.lessonId = quiz.id;

  await fs.mkdir(path.join(dir, 'components', 'data-sort'), { recursive: true });
  await fs.writeFile(path.join(dir, 'components', 'data-sort', 'index.html'), COMPONENT);
  await fs.writeFile(path.join(dir, 'components', 'data-sort', 'activity.js'), COMPONENT_JS);
  await ProjectStore.create(dir, state);
  await fs.rm(media, { recursive: true, force: true });
  return dir;
}

const out = await nativeDemo();
console.log(`Sample written: ${path.relative(ROOT, out)}`);

// Inputs for trying the import pathways (Home → Import a folder…).
const imports = path.join(SAMPLES, 'import-examples');
await fs.rm(imports, { recursive: true, force: true });
await makeStaticSite(path.join(imports, 'static-site'));
await makeRiseExport(path.join(imports, 'rise-structure-synthetic'));
await fs.writeFile(path.join(imports, 'README.txt'), `Import examples

static-site                 A two-page static website (stylesheet, image, layout grid, table,
                            details, script, embedded video, one missing image). Try both
                            "Preserve pages" and "Convert to a Tessera course".
rise-structure-synthetic    A synthetic folder with the same data structure as a Rise 360 web
                            export. It contains no Rise player, so its preview is blank in
                            Preserve mode; use it to see the compatibility report and Convert mode.
                            Real Rise exports work in both modes.
`);
console.log('Import examples written: samples/import-examples');
