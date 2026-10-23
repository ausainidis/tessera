// Block registry. Every block type is a plain object implementing the block interface
// documented in docs/BLOCK_INTERFACE.md. Third-party blocks can be added with registerBlock().

import { heading, text, list, quote, divider } from './text.js';
import { image, imageText, gallery, audio, video, attachment } from './media.js';
import { button, accordion, tabs, process, flashcards, continueGate } from './interactive.js';
import { caseStudy, reflection, knowledgeCheck, assessmentQuestion } from './learning.js';
import { embed, retained } from './special.js';

const registry = new Map();

const REQUIRED = ['type', 'version', 'title', 'fields', 'defaults', 'render'];

export function registerBlock(def) {
  for (const key of REQUIRED) {
    if (def[key] === undefined) throw new Error(`Block definition "${def.type || '?'}" is missing "${key}"`);
  }
  registry.set(def.type, def);
}

export function getBlockDef(type) {
  return registry.get(type) || null;
}

export function allBlockDefs() {
  return [...registry.values()];
}

/** Blocks an author may insert into a lesson of the given kind. */
export function insertableBlocks(lessonKind = 'lesson') {
  return allBlockDefs().filter((d) => d.insertable !== false && (d.scope !== 'assessment' || lessonKind === 'assessment'));
}

export const CATEGORY_ORDER = ['Text', 'Media', 'Interactive', 'Learning', 'Assessment', 'Layout', 'Advanced'];

/** Asset ids referenced by a block, found through its field specs (including list items). */
export function blockAssetRefs(block) {
  const def = getBlockDef(block.type);
  if (!def) return [];
  const out = [];
  const visit = (fields, obj) => {
    for (const f of fields || []) {
      const v = obj?.[f.key];
      if (f.type === 'asset' && typeof v === 'string' && v) out.push(v);
      if ((f.type === 'list' || f.type === 'choices') && Array.isArray(v)) v.forEach((item) => visit(f.itemFields, item));
    }
  };
  visit(def.fields, block.content);
  visit(def.settings, block.settings);
  return out;
}

/** External URLs a block depends on at viewing time (online videos, links). */
export function blockExternalRefs(block) {
  const def = getBlockDef(block.type);
  return def?.external ? def.external(block) : [];
}

[
  heading, text, list, quote,
  image, imageText, gallery, audio, video, attachment,
  button, accordion, tabs, process, flashcards,
  caseStudy, reflection, knowledgeCheck, assessmentQuestion,
  divider, continueGate,
  embed, retained,
].forEach(registerBlock);
