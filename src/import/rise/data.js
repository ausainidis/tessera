// Locating, decoding and re-encoding the course data embedded in Articulate Rise 360 exports.
//
// A Rise export is a compiled single-page application. Its course content is a JSON
// document embedded as base64 text. Known containers (see docs/COMPATIBILITY.md):
//
//   'runtime-data-jsonp'  runtime-data.js:  __jsonp("runtime-data.js","<base64>");
//                         VALIDATED against real web exports (player 2026, 4 courses).
//   'course-data-global'  index.html:       window.courseData = "<base64>";
//                         Reported by third parties for older exports; NOT yet validated.
//   'deserialize-call'    index.html:       deserialize("<base64>")
//                         Reported by third parties for older exports; NOT yet validated.
//
// Re-encoding unchanged data reproduces the original bytes exactly (verified), so a
// preserved Rise course that is opened and saved without edits is byte-identical.

const PATTERNS = [
  { variant: 'runtime-data-jsonp', file: /(^|\/)runtime-data\.js$/, re: /__jsonp\(\s*"runtime-data\.js"\s*,\s*"([A-Za-z0-9+/=]+)"\s*\)/, validated: true },
  { variant: 'course-data-global', file: /(^|\/)index\.html$/, re: /courseData\s*=\s*"([A-Za-z0-9+/=]+)"/, validated: false },
  { variant: 'deserialize-call', file: /(^|\/)index\.html$/, re: /deserialize\(\s*"([A-Za-z0-9+/=]+)"\s*\)/, validated: false },
];

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** UTF-8 base64 helpers that work in Node and browsers alike. */
export function base64ToUtf8(b64) {
  const clean = b64.replace(/=+$/, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buf = 0;
  let bits = 0;
  let j = 0;
  for (const ch of clean) {
    const v = B64.indexOf(ch);
    if (v < 0) throw new Error('Invalid base64 data');
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[j++] = (buf >> bits) & 0xff;
    }
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, j));
}

export function utf8ToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += `${B64[(n >> 18) & 63]}${B64[(n >> 12) & 63]}==`;
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += `${B64[(n >> 18) & 63]}${B64[(n >> 12) & 63]}${B64[(n >> 6) & 63]}=`;
  }
  return out;
}

/**
 * Find the embedded course data.
 * @param {string[]} files project-relative paths of the export
 * @param {(rel: string) => string|null} read text reader
 * @returns {null | { file: string, variant: string, validated: boolean, json: object, start: number, end: number }}
 */
export function locateRiseData(files, read) {
  const candidates = files
    .filter((f) => PATTERNS.some((p) => p.file.test(f)))
    .sort((a, b) => a.split('/').length - b.split('/').length);
  for (const file of candidates) {
    const text = read(file);
    if (!text) continue;
    for (const p of PATTERNS) {
      if (!p.file.test(file)) continue;
      const m = p.re.exec(text);
      if (!m) continue;
      let json;
      try {
        json = JSON.parse(base64ToUtf8(m[1]));
      } catch {
        continue;
      }
      if (!json?.course?.lessons) continue;
      const start = m.index + m[0].indexOf(m[1]);
      return { file, variant: p.variant, validated: p.validated, json, start, end: start + m[1].length };
    }
  }
  return null;
}

/** Decode the course data from a known container file. */
export function readRiseContainer(containerText, variant) {
  const p = PATTERNS.find((x) => x.variant === variant);
  const m = p && p.re.exec(containerText || '');
  if (!m) throw new Error('The Rise course data could not be found in the source file.');
  return JSON.parse(base64ToUtf8(m[1]));
}

/** Replace the embedded data in a container file's text. */
export function replaceRiseData(containerText, located, json) {
  const encoded = utf8ToBase64(JSON.stringify(json));
  const m = PATTERNS.find((p) => p.variant === located.variant).re.exec(containerText);
  if (!m) throw new Error('The Rise course data could not be found in the source file any more.');
  const start = m.index + m[0].indexOf(m[1]);
  return containerText.slice(0, start) + encoded + containerText.slice(start + m[1].length);
}

/** Other Rise markers, used for detection and the compatibility report. */
export function riseMarkers(files, read) {
  const markers = [];
  if (files.some((f) => /(^|\/)lib\/rise\//.test(f))) markers.push('lib/rise player folder');
  if (files.some((f) => /(^|\/)scormdriver\//.test(f))) markers.push('SCORM driver (scormdriver/)');
  if (files.includes('imsmanifest.xml')) markers.push('imsmanifest.xml (LMS package)');
  if (files.includes('tincan.xml')) markers.push('tincan.xml (xAPI package)');
  if (files.includes('cmi5.xml')) markers.push('cmi5.xml (cmi5 package)');
  const index = files.find((f) => /(^|\/)index\.html$/.test(f) && f.split('/').length <= 2);
  const html = index ? read(index) : '';
  if (html && /course package version|rise_frontend sha/i.test(html)) markers.push('Rise build comment in index.html');
  if (files.some((f) => /(^|\/)locales\/[^/]+\.js$/.test(f)) && /window\.i18n/.test(html || '')) markers.push('localised data files (locales/*.js) — not yet supported');
  return markers;
}
