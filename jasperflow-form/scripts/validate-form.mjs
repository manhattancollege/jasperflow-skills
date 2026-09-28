#!/usr/bin/env node
/**
 * Validate a .jasperflow.json package before handing it to a form builder.
 *
 * Mirrors the server's import checks (validateDefinitionStructure) and adds the
 * layout/authoring mistakes that otherwise only show up once the form is open in
 * the builder. Exits non-zero on errors; warnings alone exit 0.
 *
 *   node validate-form.mjs my-form.jasperflow.json
 */
import { readFileSync } from 'node:fs';

const INPUT_TYPES = new Set(['text', 'textarea', 'number', 'date', 'dropdown', 'radio',
  'checkbox', 'file', 'signature', 'repeating_table', 'lookup', 'calculated']);
const CHOICE_TYPES = new Set(['dropdown', 'radio', 'checkbox']);
const KNOWN_TYPES = new Set([...INPUT_TYPES, 'section', 'heading', 'rich_text', 'image',
  'divider', 'spacer', 'shape', 'sql_source', 'code', 'embed', 'table', 'chart']);
const EMBED_HOSTS = ['public.tableau.com', 'tableau-prod.manhattan.edu',
  'tableau.manhattan.edu', 'mctableau.manhattan.edu'];
const ALLOWED_TAGS = new Set(['b', 'strong', 'i', 'em', 'u', 's', 'ul', 'ol', 'li', 'p',
  'br', 'span', 'div', 'a']);
const OPERATORS = new Set(['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'contains', 'empty', 'notEmpty']);
const ACTIONS = new Set(['show', 'hide', 'require', 'unrequire', 'enable', 'disable', 'setValue']);

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const file = process.argv[2];
if (!file) {
  console.error('usage: validate-form.mjs <file>.jasperflow.json');
  process.exit(2);
}

let pkg;
try {
  pkg = JSON.parse(readFileSync(file, 'utf8'));
} catch (e) {
  console.error(`Not valid JSON: ${e.message}`);
  process.exit(2);
}

// ── Envelope ────────────────────────────────────────────────────────────────
if (pkg.schemaVersion !== 1) warn(`schemaVersion should be 1 (got ${JSON.stringify(pkg.schemaVersion)}).`);
if (!pkg.name || typeof pkg.name !== 'string') err('Package needs a "name".');
const def = pkg.definition;
if (!def || typeof def !== 'object') {
  console.error('Package needs a "definition" object.');
  process.exit(1);
}
if (!def.title) warn('definition.title is empty — the form will show no title.');
if (!Array.isArray(def.pages) || def.pages.length === 0) err('A form must have at least one page.');

// ── Pages & fields ──────────────────────────────────────────────────────────
const ids = new Map();          // id -> field
const allFields = [];
for (const [pi, page] of (def.pages ?? []).entries()) {
  if (!page.id) err(`Page ${pi + 1} must have an id.`);
  if (!Array.isArray(page.fields)) { err(`Page "${page.id ?? pi + 1}" must have a fields array.`); continue; }
  const cw = page.canvas?.width ?? 800;
  if (!page.canvas) warn(`Page "${page.id}" has no canvas — defaulting to 800x1000.`);

  const boxes = [];
  for (const f of page.fields) {
    allFields.push(f);
    if (!f.id) { err('Every field must have an id.'); continue; }
    if (ids.has(f.id)) err(`Duplicate field id "${f.id}".`);
    ids.set(f.id, f);

    if (!KNOWN_TYPES.has(f.type)) err(`Field "${f.id}" has unknown type "${f.type}".`);
    if (INPUT_TYPES.has(f.type) && !f.label) err(`Field "${f.id}" is an input and must have a label.`);

    // Position / layout
    const p = f.position;
    if (!p) {
      warn(`Field "${f.id}" has no position — it falls back to legacy stacked layout.`);
    } else {
      for (const k of ['x', 'y', 'w', 'h']) {
        if (typeof p[k] !== 'number') err(`Field "${f.id}" position.${k} must be a number.`);
      }
      if (typeof p.x === 'number' && typeof p.w === 'number' && p.x + p.w > cw) {
        err(`Field "${f.id}" runs past the canvas (x ${p.x} + w ${p.w} > ${cw}).`);
      }
      if (p.x < 0 || p.y < 0) err(`Field "${f.id}" has a negative position.`);
      boxes.push({ id: f.id, ...p });
    }

    // Choice options
    if (CHOICE_TYPES.has(f.type)) {
      const opts = f.options ?? [];
      if (!f.optionsSource && opts.length === 0) err(`Choice field "${f.id}" has no options.`);
      const seen = new Set();
      for (const o of opts) {
        if (!o || typeof o.value !== 'string' || o.value === '') err(`Field "${f.id}" has an option with no value.`);
        else if (seen.has(o.value)) err(`Field "${f.id}" has duplicate option value "${o.value}".`);
        else seen.add(o.value);
        if (!o?.label) warn(`Field "${f.id}" has an option with no label.`);
        if (/^option_\d+$/.test(o?.value ?? '')) {
          warn(`Field "${f.id}" option "${o.label}" uses placeholder value "${o.value}" — prefer a meaningful value.`);
        }
      }
    }

    // Embed allowlist
    if (f.type === 'embed') {
      const url = f.embed?.url ?? '';
      const ok = /^https:\/\//i.test(url) && EMBED_HOSTS.some((h) => {
        const host = url.slice(8).split(/[/?#]/)[0].toLowerCase();
        return host === h;
      });
      if (!ok) err(`Embed "${f.id}" must be https on an allowlisted host (${EMBED_HOSTS.join(', ')}).`);
    }

    // SQL source shouldn't carry a connection
    if (f.type === 'sql_source' && f.sql?.connectionId) {
      warn(`Field "${f.id}" carries sql.connectionId — it is stripped on import; the builder picks the data source.`);
    }

    // Rich text / help text HTML
    for (const [key, html] of [['content', f.content], ['helpText', f.helpText]]) {
      if (typeof html !== 'string' || !html.includes('<')) continue;
      for (const m of html.matchAll(/<\s*\/?\s*([a-zA-Z][a-zA-Z0-9]*)/g)) {
        if (!ALLOWED_TAGS.has(m[1].toLowerCase())) {
          warn(`Field "${f.id}" ${key} uses <${m[1]}>, which is stripped on render.`);
        }
      }
    }

    // Banner prefill
    if (f.bannerPrefillPath && !['firstName', 'lastName', 'bannerId', 'email'].includes(f.bannerPrefillPath)) {
      warn(`Field "${f.id}" bannerPrefillPath "${f.bannerPrefillPath}" is not a known Banner path.`);
    }
    if (f.bannerEmailCode && !['auto', 'MC', 'MCEM'].includes(f.bannerEmailCode)) {
      err(`Field "${f.id}" bannerEmailCode must be auto, MC, or MCEM.`);
    }
  }

  // Overlap detection — fields that overlap on BOTH axes and aren't a side-by-side row.
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const xOverlap = a.x < b.x + b.w && b.x < a.x + a.w;
      const yOverlap = a.y < b.y + b.h && b.y < a.y + a.h;
      if (xOverlap && yOverlap) {
        warn(`Fields "${a.id}" and "${b.id}" overlap — they will be treated as one row and may collide.`);
      }
    }
  }
}

// ── Conditional logic ───────────────────────────────────────────────────────
for (const f of allFields) {
  for (const r of f.conditionalLogic ?? []) {
    if (!r.sourceFieldId) { err(`Field "${f.id}" has a rule with no sourceFieldId.`); continue; }
    const src = ids.get(r.sourceFieldId);
    if (!src) { err(`Field "${f.id}" has a rule pointing at unknown field "${r.sourceFieldId}".`); continue; }
    if (r.sourceFieldId === f.id && !r.targetFieldId) warn(`Field "${f.id}" has a rule sourced from itself.`);
    if (!OPERATORS.has(r.operator)) err(`Field "${f.id}" rule has unknown operator "${r.operator}".`);
    if (!ACTIONS.has(r.action)) err(`Field "${f.id}" rule has unknown action "${r.action}".`);
    if (r.targetFieldId && !ids.has(r.targetFieldId)) {
      err(`Field "${f.id}" rule targets unknown field "${r.targetFieldId}".`);
    }
    const needsValue = r.operator !== 'empty' && r.operator !== 'notEmpty';
    if (needsValue && (r.value === undefined || r.value === null || r.value === '')) {
      // The engine ignores half-configured rules, so this is cruft rather than a
      // failure — but it is almost always a rule someone started and abandoned.
      warn(`Field "${f.id}" has an unfinished rule ("${r.operator}" with no value) — it is ignored; delete it.`);
      continue;
    }
    // Value should resolve to one of the source's options.
    if (needsValue && CHOICE_TYPES.has(src.type) && Array.isArray(src.options) && src.options.length) {
      const hit = src.options.some((o) => String(o.value) === String(r.value) || String(o.label) === String(r.value));
      if (!hit) {
        err(`Field "${f.id}" rule compares "${r.sourceFieldId}" to "${r.value}", which is not one of its options.`);
      }
    }
    if (src.type === 'checkbox' && r.operator === 'eq') {
      warn(`Field "${f.id}" uses "eq" against multi-select "${r.sourceFieldId}" — "contains" is the right operator.`);
    }
  }
}

// ── Calculated fields ───────────────────────────────────────────────────────
for (const c of def.calculatedFields ?? []) {
  if (!c.id) err('Every calculated field must have an id.');
  if (!c.formula) err(`Calculated field "${c.id}" must have a formula.`);
}
for (const f of allFields) {
  if (f.type === 'calculated' && f.calculatedFieldId &&
      !(def.calculatedFields ?? []).some((c) => c.id === f.calculatedFieldId)) {
    err(`Field "${f.id}" references missing calculated field "${f.calculatedFieldId}".`);
  }
}

// ── Report ──────────────────────────────────────────────────────────────────
for (const w of warnings) console.log(`WARN  ${w}`);
for (const e of errors) console.log(`ERROR ${e}`);
const counts = `${ids.size} fields, ${(def.pages ?? []).length} page(s)`;
if (errors.length) {
  console.log(`\nFAILED — ${errors.length} error(s), ${warnings.length} warning(s). (${counts})`);
  process.exit(1);
}
console.log(`\nOK — ${counts}, ${warnings.length} warning(s). Ready to import.`);
