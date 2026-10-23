// Media blocks: image, imageText, gallery, audio, video, attachment.

import {
  escapeHtml, escapeAttr, attrs, rich, inline, itemId, issue, htmlToText,
  imageTag, assetUrl, externalVideoEmbed, isExternalUrl,
} from './util.js';

const ALT_HELP = 'Describe what the image conveys. Leave empty only if the image is decorative.';

function altIssues(c, prefix = '') {
  if (c.asset && !c.decorative && !String(c.alt || '').trim()) {
    return [issue('warning', 'alt-missing', `${prefix}Image has no alternative text and is not marked decorative.`, 'alt')];
  }
  return [];
}

export const image = {
  type: 'image',
  version: 1,
  title: 'Image',
  category: 'Media',
  icon: '▣',
  description: 'An image with optional caption.',
  fields: [
    { key: 'asset', label: 'Image', type: 'asset', accept: 'image' },
    { key: 'alt', label: 'Alternative text', type: 'text', help: ALT_HELP, showIf: { key: 'decorative', falsy: true } },
    { key: 'decorative', label: 'Decorative (no alternative text needed)', type: 'boolean' },
    { key: 'caption', label: 'Caption', type: 'inline' },
  ],
  settings: [{ key: 'size', label: 'Size', type: 'select', options: [['content', 'Content width'], ['wide', 'Wide'], ['full', 'Full width']] }],
  defaults: () => ({ asset: null, alt: '', decorative: false, caption: '' }),
  defaultSettings: () => ({ size: 'content' }),
  render(b, ctx) {
    const c = b.content;
    const cap = c.caption ? `<figcaption class="tc-caption">${inline(c.caption)}</figcaption>` : '';
    return `<figure class="tc-figure tc-figure--${escapeAttr(b.settings?.size || 'content')}">${imageTag(ctx, c.asset, c)}${cap}</figure>`;
  },
  validate: (b) => (b.content.asset ? [] : [issue('warning', 'no-asset', 'No image selected.', 'asset')]),
  a11y: (b) => altIssues(b.content),
  text: (b) => `${b.content.alt || ''} ${htmlToText(b.content.caption)}`.trim(),
};

export const imageText = {
  type: 'imageText',
  version: 1,
  title: 'Image and text',
  category: 'Media',
  icon: '◧',
  description: 'An image beside text. Stacks on small screens.',
  fields: [
    { key: 'asset', label: 'Image', type: 'asset', accept: 'image' },
    { key: 'alt', label: 'Alternative text', type: 'text', help: ALT_HELP, showIf: { key: 'decorative', falsy: true } },
    { key: 'decorative', label: 'Decorative', type: 'boolean' },
    { key: 'heading', label: 'Heading (optional)', type: 'text' },
    { key: 'html', label: 'Text', type: 'richtext' },
    { key: 'imagePosition', label: 'Image position', type: 'select', options: [['left', 'Left'], ['right', 'Right']] },
  ],
  defaults: () => ({ asset: null, alt: '', decorative: false, heading: '', html: '<p>Text beside the image.</p>', imagePosition: 'left' }),
  headings: (b) => (b.content.heading ? [{ level: 2, text: b.content.heading }] : []),
  render(b, ctx) {
    const c = b.content;
    const h = c.heading ? `<h2 class="tc-heading">${escapeHtml(c.heading)}</h2>` : '';
    return `<div class="tc-media-text tc-media-text--${c.imagePosition === 'right' ? 'right' : 'left'}">
      <div class="tc-media-text__media">${imageTag(ctx, c.asset, c)}</div>
      <div class="tc-media-text__body">${h}<div class="tc-prose">${rich(c.html)}</div></div>
    </div>`;
  },
  a11y: (b) => altIssues(b.content),
  text: (b) => `${b.content.heading || ''} ${htmlToText(b.content.html)}`.trim(),
};

export const gallery = {
  type: 'gallery',
  version: 1,
  title: 'Gallery',
  category: 'Media',
  icon: '▦',
  description: 'Several images in a grid or a carousel.',
  fields: [
    { key: 'layout', label: 'Layout', type: 'select', options: [['grid', 'Grid'], ['carousel', 'Carousel']] },
    { key: 'columns', label: 'Columns', type: 'select', options: [['2', '2'], ['3', '3'], ['4', '4']], showIf: { key: 'layout', equals: 'grid' } },
    {
      key: 'items', label: 'Images', type: 'list', itemLabel: 'Image',
      itemFields: [
        { key: 'asset', label: 'Image', type: 'asset', accept: 'image' },
        { key: 'alt', label: 'Alternative text', type: 'text' },
        { key: 'caption', label: 'Caption', type: 'inline' },
      ],
    },
  ],
  defaults: () => ({ layout: 'grid', columns: 3, items: [] }),
  newItem: () => ({ id: itemId(), asset: null, alt: '', caption: '' }),
  render(b, ctx) {
    const c = b.content;
    const items = (c.items || []).map((i, n) => `<figure class="tc-gallery__item"${c.layout === 'carousel' ? ` role="group" aria-roledescription="slide" aria-label="${n + 1} of ${c.items.length}"` : ''}>${imageTag(ctx, i.asset, i)}${i.caption ? `<figcaption class="tc-caption">${inline(i.caption)}</figcaption>` : ''}</figure>`).join('');
    if (c.layout === 'carousel') {
      return `<div class="tc-carousel" data-tc="carousel" role="region" aria-roledescription="carousel" aria-label="Image gallery"><div class="tc-carousel__track">${items}</div></div>`;
    }
    return `<div class="tc-gallery tc-gallery--cols-${Number(c.columns) || 3}">${items}</div>`;
  },
  a11y: (b) => (b.content.items || []).filter((i) => i.asset && !String(i.alt || '').trim()).map(() => issue('warning', 'alt-missing', 'A gallery image has no alternative text.', 'items')),
  text: (b) => (b.content.items || []).map((i) => `${i.alt || ''} ${htmlToText(i.caption)}`).join(' ').trim(),
};

function trackTag(ctx, captionsAsset, label = 'Captions') {
  const url = assetUrl(ctx, captionsAsset);
  return url ? `<track kind="captions" src="${escapeAttr(url)}" label="${escapeAttr(label)}" default>` : '';
}

function transcriptBlock(html) {
  return htmlToText(html) ? `<details class="tc-transcript"><summary>Transcript</summary><div class="tc-prose">${rich(html)}</div></details>` : '';
}

export const audio = {
  type: 'audio',
  version: 1,
  title: 'Audio',
  category: 'Media',
  icon: '♪',
  description: 'An audio file with optional captions and transcript.',
  fields: [
    { key: 'asset', label: 'Audio file', type: 'asset', accept: 'audio' },
    { key: 'title', label: 'Title', type: 'text' },
    { key: 'captions', label: 'Captions (WebVTT)', type: 'asset', accept: 'captions' },
    { key: 'transcript', label: 'Transcript', type: 'richtext' },
  ],
  defaults: () => ({ asset: null, title: '', captions: null, transcript: '' }),
  render(b, ctx) {
    const c = b.content;
    const url = assetUrl(ctx, c.asset);
    const title = c.title ? `<p class="tc-media-title">${escapeHtml(c.title)}</p>` : '';
    const player = url ? `<audio controls preload="metadata" src="${escapeAttr(url)}"${c.title ? ` aria-label="${escapeAttr(c.title)}"` : ''}>${trackTag(ctx, c.captions)}</audio>` : '<div class="tc-missing">No audio selected</div>';
    return `<div class="tc-audio">${title}${player}${transcriptBlock(c.transcript)}</div>`;
  },
  a11y: (b) => (b.content.asset && !htmlToText(b.content.transcript) && !b.content.captions ? [issue('warning', 'transcript-missing', 'Audio has no transcript or captions.', 'transcript')] : []),
  text: (b) => `${b.content.title || ''} ${htmlToText(b.content.transcript)}`.trim(),
};

export const video = {
  type: 'video',
  version: 1,
  title: 'Video',
  category: 'Media',
  icon: '▶',
  description: 'A local video file, or an online video (requires internet when viewed).',
  fields: [
    { key: 'source', label: 'Source', type: 'select', options: [['file', 'Video file in this project'], ['url', 'Online video (YouTube, Vimeo or URL)']] },
    { key: 'asset', label: 'Video file', type: 'asset', accept: 'video', showIf: { key: 'source', equals: 'file' } },
    { key: 'poster', label: 'Poster image', type: 'asset', accept: 'image', showIf: { key: 'source', equals: 'file' } },
    { key: 'url', label: 'Video URL', type: 'url', showIf: { key: 'source', equals: 'url' }, help: 'Online videos need an internet connection when learners view them.' },
    { key: 'title', label: 'Title (used by screen readers)', type: 'text' },
    { key: 'captions', label: 'Captions (WebVTT)', type: 'asset', accept: 'captions', showIf: { key: 'source', equals: 'file' } },
    { key: 'transcript', label: 'Transcript', type: 'richtext' },
  ],
  defaults: () => ({ source: 'file', asset: null, poster: null, url: '', title: '', captions: null, transcript: '' }),
  external: (b) => (b.content.source === 'url' && isExternalUrl(b.content.url) ? [b.content.url] : []),
  render(b, ctx) {
    const c = b.content;
    let player;
    if (c.source === 'url') {
      const ext = externalVideoEmbed(c.url);
      if (ext) {
        player = `<div class="tc-embed-frame tc-ratio-16x9" data-external="${escapeAttr(ext.provider)}"><iframe${attrs({ src: ext.embed, title: c.title || `${ext.provider} video`, loading: 'lazy', allow: 'fullscreen; picture-in-picture; encrypted-media', referrerpolicy: 'strict-origin-when-cross-origin' })}></iframe></div>
          <p class="tc-external-note">This video is hosted online by ${escapeHtml(ext.provider)}. <a href="${escapeAttr(c.url)}" target="_blank" rel="noopener noreferrer">Open the video in a new window</a>.</p>`;
      } else if (/\.(mp4|webm|ogg|m4v)(\?|$)/i.test(c.url || '')) {
        player = `<video controls preload="metadata" src="${escapeAttr(c.url)}" data-external="url"${c.title ? ` aria-label="${escapeAttr(c.title)}"` : ''}></video>`;
      } else if (c.url) {
        player = `<p><a class="tc-button" href="${escapeAttr(c.url)}" target="_blank" rel="noopener noreferrer">Watch video${c.title ? `: ${escapeHtml(c.title)}` : ''}</a></p>`;
      } else player = '<div class="tc-missing">No video URL</div>';
    } else {
      const url = assetUrl(ctx, c.asset);
      const poster = assetUrl(ctx, c.poster);
      player = url
        ? `<video controls preload="metadata"${attrs({ src: url, poster, 'aria-label': c.title || null })}>${trackTag(ctx, c.captions)}</video>`
        : '<div class="tc-missing">No video selected</div>';
    }
    return `<div class="tc-video">${player}${transcriptBlock(c.transcript)}</div>`;
  },
  a11y(b) {
    const c = b.content;
    const out = [];
    if (c.source === 'file' && c.asset && !c.captions) out.push(issue('warning', 'captions-missing', 'Video has no captions file.', 'captions'));
    if (c.source === 'url' && c.url && !htmlToText(c.transcript)) out.push(issue('info', 'external-captions', 'Online video: check that captions are available on the hosting service, or add a transcript.', 'transcript'));
    if (!c.title) out.push(issue('info', 'title-missing', 'Give the video a title for screen readers.', 'title'));
    return out;
  },
  text: (b) => `${b.content.title || ''} ${htmlToText(b.content.transcript)}`.trim(),
};

export const attachment = {
  type: 'attachment',
  version: 1,
  title: 'Download',
  category: 'Media',
  icon: '⇩',
  description: 'A downloadable file such as a PDF or worksheet.',
  fields: [
    { key: 'asset', label: 'File', type: 'asset', accept: 'file' },
    { key: 'label', label: 'Link text', type: 'text', required: true },
    { key: 'description', label: 'Description', type: 'inline' },
  ],
  defaults: () => ({ asset: null, label: 'Download the worksheet', description: '' }),
  render(b, ctx) {
    const c = b.content;
    const a = c.asset ? ctx.asset(c.asset) : null;
    if (!a) return '<div class="tc-missing">No file selected</div>';
    const ext = (a.entry?.path || '').split('.').pop().toUpperCase();
    const size = a.entry?.bytes ? ` · ${(a.entry.bytes / 1024 / 1024).toFixed(a.entry.bytes > 1048576 ? 1 : 2)} MB` : '';
    return `<div class="tc-attachment"><a class="tc-attachment__link" href="${escapeAttr(a.url)}" download>${escapeHtml(c.label || 'Download')}</a>
      <span class="tc-attachment__meta">${escapeHtml(ext)}${escapeHtml(size)}</span>${c.description ? `<p class="tc-attachment__desc">${inline(c.description)}</p>` : ''}</div>`;
  },
  a11y: (b) => (b.content.label?.trim() ? [] : [issue('warning', 'link-text', 'Download link has no text.', 'label')]),
  text: (b) => `${b.content.label || ''} ${htmlToText(b.content.description)}`.trim(),
};
