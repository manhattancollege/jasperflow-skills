#!/usr/bin/env node
/**
 * Validate a .jasperflow.json package before handing it to a form builder.
 *
 * Mirrors the server's import checks (validateDefinitionStructure) and adds the
 * layout/authoring mistakes that otherwise only show up once the form is open in
 * the builder. Exits non-zero on errors; warnings alone exit 0.
 *
 *   node validate-form.mjs my-form.jasperflow.json [--workflow my.workflow.jasperflow.json]
 *
 * With --workflow, step names used by "filledByStep" / "hideFrom.steps" are
 * checked against that workflow's node ids.
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
// Mirrors BANNER_PREFILL_PATHS in the app's form builder. The last five are
// employment paths, read from the employee's current Banner job.
const BANNER_PREFILL_PATHS = ['firstName', 'lastName', 'bannerId', 'email',
  'position', 'jobTitle', 'department', 'departmentCode', 'supervisorName'];

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const args = process.argv.slice(2);
const wfFile = args.includes('--workflow') ? args[args.indexOf('--workflow') + 1] : null;
const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--workflow');
if (!file) {
  console.error('usage: validate-form.mjs <file>.jasperflow.json [--workflow <file>.workflow.jasperflow.json]');
  process.exit(2);
}
// Steps a person works (they can fill fields in / have things hidden from them).
let workflowSteps = null;
if (wfFile) {
  try {
    const wf = JSON.parse(readFileSync(wfFile, 'utf8'));
    workflowSteps = new Set((wf.definition?.nodes ?? [])
      .filter((n) => ['approval', 'information', 'manual_export'].includes(n.type)).map((n) => n.id));
  } catch (e) {
    console.error(`${wfFile}: not valid JSON: ${e.message}`);
    process.exit(2);
  }
}
const IDENTITY_BINDS = new Set(['bannerid', 'banner_id', 'pidm']);
const checkStep = (where, step) => {
  if (typeof step !== 'string' || !step) { err(`${where} names an empty workflow step.`); return; }
  if (workflowSteps && !workflowSteps.has(step)) {
    err(`${where} names workflow step "${step}", which isn't an approval/acknowledgement/export step in ${wfFile}.`);
  }
};
const checkHideFrom = (where, h, isPage) => {
  if (h === undefined) return;
  if (!h || typeof h !== 'object' || Array.isArray(h)) { err(`${where} hideFrom must be an object.`); return; }
  for (const k of Object.keys(h)) {
    if (!['submitter', 'steps', 'always'].includes(k)) err(`${where} hideFrom has unknown key "${k}".`);
  }
  if (h.always && !isPage) warn(`${where} hideFrom.always is meant for pages — on a field, delete the field instead.`);
  if (h.steps !== undefined && !Array.isArray(h.steps)) err(`${where} hideFrom.steps must be an array of step ids.`);
  for (const st of h.steps ?? []) checkStep(`${where} hideFrom.steps`, st);
};

let pkg;
try {
  pkg = JSON.parse(readFileSync(file, 'utf8'));
} catch (e) {
  console.error(`Not valid JSON: ${e.message}`);
  process.exit(2);
}

// ── Envelope ────────────────────────────────────────────────────────────────
if (pkg.kind === 'workflow' || Array.isArray(pkg.definition?.nodes)) {
  console.error('This is a WORKFLOW file — check it with validate-workflow.mjs.');
  process.exit(1);
}
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
const pageRules = [];           // checked once every field id is known
for (const [pi, page] of (def.pages ?? []).entries()) {
  if (!page.id) err(`Page ${pi + 1} must have an id.`);
  if (!Array.isArray(page.fields)) { err(`Page "${page.id ?? pi + 1}" must have a fields array.`); continue; }
  checkHideFrom(`Page "${page.id}"`, page.hideFrom, true);
  const pageFieldIds = new Set((page.fields ?? []).map((f) => f.id));
  for (const r of page.conditionalLogic ?? []) {
    if (!['show', 'hide'].includes(r.action)) err(`Page "${page.id}" rule action must be show or hide (got "${r.action}").`);
    if (!OPERATORS.has(r.operator)) err(`Page "${page.id}" rule has unknown operator "${r.operator}".`);
    if (pageFieldIds.has(r.sourceFieldId)) {
      err(`Page "${page.id}" rule watches "${r.sourceFieldId}", a field on the same page — once hidden it could never come back.`);
    }
    pageRules.push({ page: page.id, rule: r });
  }
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

    // SQL: only the two identity binds the server fills.
    for (const sql of [f.sql?.sql, f.optionsSource?.sql?.sql]) {
      if (typeof sql !== 'string') continue;
      const masked = sql.replace(/'[^']*'/g, "''");
      for (const m of masked.matchAll(/:([a-zA-Z][a-zA-Z0-9_]*)/g)) {
        if (!IDENTITY_BINDS.has(m[1].toLowerCase())) {
          err(`Field "${f.id}" query uses :${m[1]} — only :bannerId and :pidm are filled in (with the person filling in the form).`);
        }
      }
      if (/\binto\b|\b(insert|update|delete|merge)\b|@/i.test(masked)) err(`Field "${f.id}" query must be a single read-only SELECT (no INTO, writes or database links).`);
    }

    // Who fills it in / who it's hidden from
    if (f.filledByStep !== undefined) {
      if (!INPUT_TYPES.has(f.type) || f.type === 'calculated') err(`Field "${f.id}" has filledByStep, but only input fields can be filled in.`);
      checkStep(`Field "${f.id}" filledByStep`, f.filledByStep);
      if (f.bannerPrefillPath) warn(`Field "${f.id}" is filled in by an approver AND auto-filled from Banner — pick one.`);
    }
    checkHideFrom(`Field "${f.id}"`, f.hideFrom, false);
    if (f.filledByStep && (f.hideFrom?.steps ?? []).includes(f.filledByStep)) {
      err(`Field "${f.id}" is filled in by step "${f.filledByStep}" but hidden from it.`);
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
    if (f.bannerPrefillPath && !BANNER_PREFILL_PATHS.includes(f.bannerPrefillPath)) {
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

for (const { page, rule } of pageRules) {
  if (!ids.has(rule.sourceFieldId)) err(`Page "${page}" rule points at unknown field "${rule.sourceFieldId}".`);
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
