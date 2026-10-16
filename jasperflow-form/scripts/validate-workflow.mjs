#!/usr/bin/env node
/**
 * Validate a .workflow.jasperflow.json package before handing it to a builder.
 *
 * Mirrors the app's publish checks (validateWorkflowDefinition) plus what makes
 * a workflow FILE go wrong: database ids that only exist on one server, and —
 * with --form — conditions or assignments naming form fields that don't exist.
 * Exits non-zero on errors; warnings alone exit 0.
 *
 *   node validate-workflow.mjs my.workflow.jasperflow.json [--form my.jasperflow.json]
 */
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--form');
const formFile = args.includes('--form') ? args[args.indexOf('--form') + 1] : null;
if (!file) {
  console.error('usage: validate-workflow.mjs <file>.workflow.jasperflow.json [--form <form>.jasperflow.json]');
  process.exit(2);
}

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const read = (f) => {
  try { return JSON.parse(readFileSync(f, 'utf8')); } catch (e) { console.error(`${f}: not valid JSON: ${e.message}`); process.exit(2); }
};
const pkg = read(file);

const NODE_TYPES = new Set(['start', 'approval', 'information', 'parallel_split', 'parallel_join',
  'condition', 'auto_action', 'manual_export', 'notify', 'wait', 'end']);
const ASSIGNED = new Set(['approval', 'information', 'manual_export']);
const MODES = new Set(['static_user', 'static_role', 'group', 'form_field', 'banner_advisor', 'banner_supervisor']);
const NEEDS_FALLBACK = new Set(['banner_supervisor', 'banner_advisor', 'form_field']);
const OPERATORS = new Set(['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'contains', 'empty', 'not_empty']);
const BRANCHES = new Set(['default', 'true', 'false', 'reject']);

// ── Envelope ────────────────────────────────────────────────────────────────
if (pkg.schemaVersion !== 1) warn(`schemaVersion should be 1 (got ${JSON.stringify(pkg.schemaVersion)}).`);
if (pkg.kind !== 'workflow') warn('Set "kind": "workflow" so each importer can tell the files apart.');
if (!pkg.name) err('Package needs a "name".');
const def = pkg.definition;
if (!def || !Array.isArray(def.nodes) || !Array.isArray(def.edges)) {
  console.error('Package needs a "definition" with "nodes" and "edges" arrays.');
  process.exit(1);
}
if (Array.isArray(def.pages)) err('This looks like a FORM definition — workflows have nodes and edges.');

// Form fields, when --form is given.
let formFields = null;
if (formFile) {
  const form = read(formFile);
  formFields = new Map();
  for (const p of form.definition?.pages ?? []) for (const f of p.fields ?? []) formFields.set(f.id, f);
}
const checkField = (where, id) => {
  if (!formFields || !id) return;
  const f = formFields.get(id);
  if (!f) err(`${where} refers to form field "${id}", which isn't on the form.`);
  return f;
};

// ── Nodes ───────────────────────────────────────────────────────────────────
const ids = new Map();
for (const n of def.nodes) {
  if (!n.id) { err('Every node must have an id.'); continue; }
  if (ids.has(n.id)) err(`Duplicate node id "${n.id}".`);
  ids.set(n.id, n);
  const name = `"${n.label || n.id}"`;
  if (!NODE_TYPES.has(n.type)) err(`Node ${name} has unknown type "${n.type}".`);
  if (!n.label && n.type !== 'start' && n.type !== 'end') warn(`Node "${n.id}" has no label — approvers see the label.`);
  if (!n.position) warn(`Node ${name} has no position — the builder will stack it.`);

  // Non-portable references: ids from one server's database.
  JSON.stringify(n, (k, v) => {
    if ((k === 'userId' || k === 'toUserId') && v) err(`Node ${name} names a person by id (${k}) — use ${k === 'userId' ? 'userEmail' : 'toUserEmail'} instead.`);
    if (k === 'groupId' && v) err(`Node ${name} names a group by id — use "groupName" instead.`);
    if (k === 'connectionId' && v) warn(`Node ${name} carries a connectionId — it's dropped on import; the builder re-chooses it.`);
    return v;
  });

  const a = n.assignment;
  if (ASSIGNED.has(n.type) && !a && n.type !== 'information') err(`Step ${name} has no assignment.`);
  if (a) {
    if (!MODES.has(a.mode)) err(`Step ${name} has unknown assignment mode "${a.mode}".`);
    if (a.mode === 'static_role' && !a.role) err(`Step ${name} assigns to a role but none is set.`);
    if (a.mode === 'static_user' && !a.userEmail) err(`Step ${name} assigns to a person but has no userEmail.`);
    if (a.mode === 'group' && !a.groupName) err(`Step ${name} assigns to a group but has no groupName.`);
    if (a.mode === 'form_field') {
      if (!a.fieldId) err(`Step ${name} assigns to a person named on the form but no fieldId is set.`);
      checkField(`Step ${name}`, a.fieldId);
    }
    if (NEEDS_FALLBACK.has(a.mode) && !a.fallback) {
      warn(`Step ${name} (${a.mode}) has no fallback — if nobody is found, the run stops for an admin.`);
    }
  }

  if (n.type === 'condition') {
    const tests = n.conditionGroup?.conditions ?? (n.condition ? [n.condition] : []);
    if (tests.length === 0) err(`Condition ${name} has no condition.`);
    for (const c of tests) {
      if (!c.fieldId) err(`Condition ${name} has a test with no fieldId.`);
      if (!OPERATORS.has(c.operator)) {
        err(`Condition ${name} has unknown operator "${c.operator}"${c.operator === 'notEmpty' ? ' — workflows spell it "not_empty"' : ''}.`);
      }
      const f = checkField(`Condition ${name}`, c.fieldId);
      if (f && Array.isArray(f.options) && f.options.length && c.value !== undefined && !['empty', 'not_empty'].includes(c.operator)) {
        const hit = f.options.some((o) => String(o.value) === String(c.value));
        if (!hit) err(`Condition ${name} compares "${c.fieldId}" to "${c.value}", which is not one of its option values.`);
      }
    }
    const out = def.edges.filter((e) => e.source === n.id).map((e) => e.branch);
    if (!out.includes('true') || !out.includes('false')) warn(`Condition ${name} should have both a "true" and a "false" edge.`);
  }
  if (n.type === 'notify' && !n.notify?.to) err(`Notify ${name} has no recipient (notify.to).`);
  if (n.type === 'wait' && !(n.wait?.hours > 0)) err(`Wait ${name} needs wait.hours greater than 0.`);
  if (n.type === 'auto_action') warn(`Action ${name}: Banner writes, procedures and webhooks need a connection and tested SQL — leave them to the builder.`);
}
const starts = def.nodes.filter((n) => n.type === 'start').length;
if (starts !== 1) err(`A workflow needs exactly one start node (found ${starts}).`);
if (!def.nodes.some((n) => n.type === 'end')) err('A workflow needs at least one end node.');

// ── Edges ───────────────────────────────────────────────────────────────────
const edgeIds = new Set();
for (const e of def.edges) {
  if (!e.id) err('Every edge must have an id.');
  else if (edgeIds.has(e.id)) err(`Duplicate edge id "${e.id}".`);
  edgeIds.add(e.id);
  if (!ids.has(e.source)) err(`Edge ${e.id} starts at unknown node "${e.source}".`);
  if (!ids.has(e.target)) err(`Edge ${e.id} ends at unknown node "${e.target}".`);
  if (e.branch && !BRANCHES.has(e.branch)) err(`Edge ${e.id} has unknown branch "${e.branch}".`);
  const src = ids.get(e.source);
  const tgt = ids.get(e.target);
  if (e.branch === 'reject' && src && src.type !== 'approval') err(`Edge ${e.id}: only an approval step can have a "reject" edge.`);
  if (e.branch === 'reject' && tgt?.type === 'end' && tgt.end?.outcome !== 'rejected') {
    err(`"${src?.label || e.source}" routes a decline to "${tgt.label || tgt.id}", which ends as APPROVED — set its end.outcome to "rejected".`);
  }
}
for (const n of def.nodes) {
  if (n.type !== 'end' && !def.edges.some((e) => e.source === n.id)) err(`Node "${n.label || n.id}" has no outgoing edge.`);
}

// ── Report ──────────────────────────────────────────────────────────────────
for (const w of warnings) console.log(`WARN  ${w}`);
for (const e of errors) console.log(`ERROR ${e}`);
const counts = `${def.nodes.length} steps, ${def.edges.length} edges${formFields ? `, checked against ${formFile}` : ''}`;
if (errors.length) {
  console.log(`\nFAILED — ${errors.length} error(s), ${warnings.length} warning(s). (${counts})`);
  process.exit(1);
}
console.log(`\nOK — ${counts}, ${warnings.length} warning(s). Ready to import.`);
