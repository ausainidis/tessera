// Source detection. Each kind of input has its own pathway; nothing is guessed silently.
//
//   native       a Tessera project folder (tessera-project.json)
//   rise         an Articulate Rise 360 export (web, SCORM, xAPI…) with embedded course data
//   vite-source  a Vite *source* project (package.json / vite.config.*). Vite is a build tool,
//                not a course format: Tessera never runs installs, builds or dev servers.
//   web-bundle   a compiled single-page web application (e.g. a Vite/webpack dist folder)
//   static-html  hand-written or generated HTML pages
//   unknown      nothing recognisable

import { MANIFEST_FILE } from '../core/format.js';
import { locateRiseData, riseMarkers } from './rise/data.js';

export const KIND_LABELS = {
  native: 'Tessera project',
  rise: 'Articulate Rise 360 export',
  'vite-source': 'Vite source project',
  'web-bundle': 'Compiled web application bundle',
  'static-html': 'Static HTML pages',
  unknown: 'Unrecognised folder',
};

function readJson(read, rel) {
  try {
    return JSON.parse(read(rel) || 'null');
  } catch {
    return null;
  }
}

/**
 * @param {string[]} files project-relative paths
 * @param {(rel: string) => string|null} read
 */
export function detectSource(files, read) {
  const evidence = [];
  if (files.includes(MANIFEST_FILE)) {
    const m = readJson(read, MANIFEST_FILE);
    if (m?.format === 'tessera-project') return { kind: 'native', evidence: [`${MANIFEST_FILE} (format version ${m.formatVersion})`] };
  }

  const rise = locateRiseData(files, read);
  const markers = riseMarkers(files, read);
  if (rise) {
    evidence.push(`Course data found in ${rise.file} (${rise.variant}${rise.validated ? ', validated variant' : ', NOT yet validated variant'})`, ...markers);
    const dir = rise.file.includes('/') ? rise.file.slice(0, rise.file.lastIndexOf('/') + 1) : '';
    const entry = files.includes(`${dir}index.html`) ? `${dir}index.html` : files.find((f) => /index\.html$/.test(f));
    return { kind: 'rise', evidence, rise, entry, markers };
  }
  if (markers.some((m) => m.startsWith('lib/rise'))) {
    return { kind: 'rise', evidence: [...markers, 'Rise player found, but the course data format was not recognised.'], rise: null, markers, error: 'This looks like a Rise export, but its course data uses a format this version cannot read yet. Please share a sample so support can be added.' };
  }

  const pkg = readJson(read, 'package.json');
  const viteConfig = files.find((f) => /^vite\.config\.(js|mjs|cjs|ts|mts)$/.test(f));
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  if (viteConfig || deps.vite) {
    if (viteConfig) evidence.push(`${viteConfig}`);
    if (deps.vite) evidence.push(`package.json depends on vite ${deps.vite}`);
    const framework = ['react', 'vue', 'svelte', 'preact', 'solid-js', 'lit'].filter((f) => deps[f]);
    const dist = files.some((f) => f === 'dist/index.html') ? 'dist' : null;
    return { kind: 'vite-source', evidence, framework, dist, scripts: Object.keys(pkg?.scripts || {}) };
  }

  const index = files.find((f) => /^index\.html?$/i.test(f));
  if (index) {
    const html = read(index) || '';
    const moduleScript = /<script[^>]+type=["']module["'][^>]+src=["'][^"']*(assets|static|js)\/[^"']+-[\w-]{6,}\.js/i.test(html);
    const hashed = files.some((f) => /^(assets|static\/js|js)\/[^/]+[.-][0-9a-zA-Z_-]{8,}\.js$/.test(f));
    const appRoot = /<div[^>]+id=["'](root|app|__next|svelte)["'][^>]*>\s*<\/div>/i.test(html);
    const bodyText = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if ((moduleScript || hashed) && (appRoot || bodyText.length < 400)) {
      if (moduleScript) evidence.push('index.html loads a hashed ES module bundle');
      if (hashed) evidence.push('hashed JavaScript bundles in assets/');
      if (appRoot) evidence.push('empty application root element (content is rendered by JavaScript)');
      const absolute = /(src|href)=["']\/(?!\/)/.test(html);
      return { kind: 'web-bundle', evidence, entry: index, absolutePaths: absolute };
    }
  }
  const pages = files.filter((f) => /\.html?$/i.test(f));
  if (pages.length) return { kind: 'static-html', evidence: [`${pages.length} HTML page${pages.length === 1 ? '' : 's'}`] };
  return { kind: 'unknown', evidence: ['No HTML pages, Tessera project or Rise course data found.'] };
}
