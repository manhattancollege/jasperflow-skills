# JasperFlow workflow reference

A workflow is the approval routing a form follows after it's submitted. It's a separate
file from the form, imported through **Workflow Builder → Import**. Import always
creates an **unpublished draft**: someone reviews it, publishes it, then attaches it to
the form in the form's **Settings**. A form can only be attached to a *published*
workflow.

## The file

Name it `<slug>.workflow.jasperflow.json`:

```json
{
  "schemaVersion": 1,
  "kind": "workflow",
  "name": "Equipment Request Approval",
  "description": "Supervisor, then Finance for anything over $500.",
  "definition": {
    "nodes": [ /* steps */ ],
    "edges": [ /* arrows between steps */ ],
    "settings": {}
  }
}
```

Validate it before handing it over. Pass `--form` with the form it routes, so field
references are checked too:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-workflow.mjs" <slug>.workflow.jasperflow.json --form <slug>.jasperflow.json
```

## Nodes

Every node has `id` (unique, stable, readable: `supervisor`, `hr_review`), `type`,
`label` (what the builder and approvers see), and `position: {x, y}` on the builder
canvas. Lay steps out top to bottom about 120px apart, and put side branches about
200px left or right.

| `type` | What it does | Key properties |
|---|---|---|
| `start` | Where every run begins. Exactly one. | `startOptions.allowAttachments` (let people attach supporting documents) |
| `approval` | A person approves or declines. | `assignment` (required), `dueInHours`, `escalation`, `declineNotifySubmitter`, `emailTemplateKey` |
| `information` | A person acknowledges (FYI). Can't decline. | `assignment` |
| `manual_export` | A person downloads the PDF / files it to BDM. | `assignment` (required), `manualExport` |
| `condition` | Branches on a form answer. | `condition` or `conditionGroup` |
| `parallel_split` / `parallel_join` | Run branches at the same time, then wait. | `parallelMode: "all" \| "any"` on the join |
| `notify` | Sends an email; doesn't wait. | `notify: { to, role?, userEmail?, templateKey?, emailCode? }` |
| `wait` | Pauses for a fixed time. | `wait: { hours }` |
| `auto_action` | Writes to Banner, calls a procedure, files to BDM, posts a webhook. | `autoAction` (leave to the builder; see below) |
| `end` | Finishes the run. At least one. | `end: { outcome: "approved" \| "rejected", notifySubmitter }` |

### Assignment (who gets the step)

```json
"assignment": { "mode": "banner_supervisor",
                "fallback": { "mode": "static_role", "role": "WORKFLOW_ADMIN" } }
```

| `mode` | Goes to | Needs |
|---|---|---|
| `banner_supervisor` | The submitter's supervisor, from their Banner job | — |
| `banner_advisor` | The student's advisor | `advisorType` (e.g. `"MAJR"`; blank = primary advisor) |
| `form_field` | The person named in a form field (Banner ID or email) | `fieldId` |
| `group` | An approval group: one task, whoever acts first | `groupName` (the group's name) |
| `static_role` | Everyone holding a JasperFlow role | `role` |
| `static_user` | One named person | `userEmail` |

- **Always add a `fallback`** for `banner_supervisor`, `banner_advisor` and `form_field`.
  It's used when nobody can be found (no supervisor on record, an empty field).
  Fallback modes: `static_role`, `static_user` (with `userEmail`), `banner_advisor`.
- **People are named by email, groups by name.** Never write a `userId` or `groupId`:
  those are database ids from one server and mean nothing elsewhere. On import,
  JasperFlow looks the email or group name up. Anything it can't find is left blank
  and listed for the builder to re-pick, never guessed.
- A group must already exist under **Admin → Approval Groups**. Say which groups the
  workflow expects in your summary.

### Conditions

```json
{ "id": "over_500", "type": "condition", "label": "Over $500?",
  "condition": { "fieldId": "estimated_cost", "operator": "gt", "value": 500 } }
```

Operators: `eq` · `neq` · `gt` · `lt` · `gte` · `lte` · `contains` · `empty` · `not_empty`.
Note **`not_empty`** with an underscore here, unlike the form's `notEmpty`.
`fieldId` is the form field's id; compare against an option's **`value`**.
Several tests: `"conditionGroup": { "combinator": "and" | "or", "conditions": [ … ] }`.

### End steps and declines

- `end.outcome` is `"approved"` (the default) or `"rejected"`. A decline must route to
  an end whose outcome is **`rejected`**. Routing it to an approved end records the
  request as approved, and publish refuses that.
- `end.notifySubmitter` (default `true`) emails the submitter the final decision.
- An approval with **no** decline edge ends the run as rejected when declined;
  `declineNotifySubmitter` (default `true`) controls that email. Prefer an explicit
  decline edge to a `rejected` end, which is clearer in the builder.

### Leave to the builder

- `auto_action`: Banner writes, procedures and webhooks need a connection, an
  allow-list and tested SQL. Don't write one. Mention in your summary if the process
  needs it.
- `emailTemplateKey` / `notify.templateKey`: template keys are per-server. Omit them
  (the standard template is used) unless the user names one.
- `escalation`: optional; `{ "afterHours": 48, "toRole": "WORKFLOW_ADMIN" }` or
  `"toUserEmail"`.

## Edges

```json
{ "id": "e_sup_hr", "source": "supervisor", "target": "hr_review", "branch": "default" }
```

| `branch` | Use on |
|---|---|
| `default` | Ordinary "next" arrow. |
| `true` / `false` | The two sides of a `condition`. Give a condition both. |
| `reject` | From an `approval`: where a decline goes. |

Every node except an `end` needs at least one outgoing edge.

## Settings

```json
"settings": {
  "enforceDistinctApprovers": false,
  "skipApprovalsUpToSubmitter": false,
  "reminders": { "enabled": true, "everyHours": 24 }
}
```

- `enforceDistinctApprovers`: nobody may approve two steps of one request.
- `skipApprovalsUpToSubmitter`: for a hierarchy (supervisor → director → HR). When the
  submitter is one of the approvers, skip up to and including their own step.
- `reminders`: overdue-step reminders; `enabled: false` turns them off.

## Steps the form refers to

The form names workflow steps **by node id** in two places:

- `filledByStep`: the approver of that step fills the field in (see `fields.md`).
- `hideFrom.steps`: the field or page is hidden from that step's approver.

Import keeps node ids as they are, so the two files line up. Pick the ids once
(`supervisor`, `hr_review`) and use the same strings in both files.
