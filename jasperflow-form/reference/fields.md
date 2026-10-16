# JasperFlow field reference

Every field object shares these keys:

```jsonc
{
  "id": "unique_stable_id",      // required, unique across the WHOLE form
  "type": "text",                // required, see the catalog below
  "label": "First name",         // required for input types; "" for design elements
  "position": { "x": 40, "y": 120, "w": 350, "h": 72 },  // canvas px, top-left origin
  "helpText": "Shown under the label. HTML allowed.",
  "placeholder": "Optional",
  "required": false,
  "layout": { "width": "full" },  // legacy flow layout; harmless alongside position
  "style": { "bold": true, "fontSize": 26, "align": "left" },   // omit color: headings default to MU green
  "validations": [ { "type": "email", "message": "Enter a valid email" } ],
  "conditionalLogic": [ /* see below */ ]
}
```

## Input types

These hold a value and **require a `label`**:
`text` · `textarea` · `number` · `date` · `dropdown` · `radio` · `checkbox` · `file` ·
`signature` · `repeating_table` · `lookup` · `calculated`

| Type | Notes |
|---|---|
| `text` | Single line. Suggested `h: 72`. |
| `textarea` | Multi-line. Suggested `h: 120`. |
| `number` | Numeric. Pair with `min`/`max` validations. |
| `date` | Native date picker; values are `YYYY-MM-DD`. |
| `dropdown` | Needs `options`. Single value. |
| `radio` | Needs `options`. Single value. Height ≈ `24 + 26 × options`. |
| `checkbox` | Needs `options`. **Value is an array** — use `contains` in conditions. |
| `file` | Upload. Optional `acceptedFileTypes: [".pdf", ".docx"]`. |
| `signature` | Drawn signature. Suggested `h: 120`. |
| `repeating_table` | Rows the submitter adds. Needs `columns` (below). |
| `lookup` | Read-only, auto-filled from Banner via `bannerPrefillPath`. |
| `calculated` | Read-only result of a `calculatedFields` formula (`calculatedFieldId`). |

### options (dropdown / radio / checkbox)

```json
"options": [
  { "label": "Better job opportunity", "value": "better_job" },
  { "label": "Other", "value": "other" }
]
```
Give every option a meaningful, stable `value`; conditional rules match on it.

### repeating_table columns

```json
"columns": [
  { "id": "item",   "label": "Item",   "type": "text" },
  { "id": "amount", "label": "Amount", "type": "number", "total": true }
]
```
Column `type`: `text` · `number` · `date` · `dropdown` (add `options`) · `checkbox`.
`"total": true` on a number column adds a totals row.

### Banner autofill (lookup)

```json
{ "id": "email", "type": "lookup", "label": "Email",
  "bannerPrefillPath": "email", "bannerEmailCode": "auto" }
```
`bannerPrefillPath` — person paths (anyone):

| Path | Fills in |
|---|---|
| `firstName` | First name. |
| `lastName` | Last name. |
| `bannerId` | Banner ID. |
| `email` | Email address from GOREMAL (see `bannerEmailCode`). |

Employment paths (employees only — read from their current Banner job in NBRJOBS,
with the department title from FTVORGN; empty for students or anyone with no active job):

| Path | Fills in |
|---|---|
| `position` | Position number of their current job. |
| `jobTitle` | Job title (the job's description). |
| `department` | Department title; falls back to the org code if there is no title. |
| `departmentCode` | Department org code. |
| `supervisorName` | Their supervisor's full name. |

`bannerEmailCode` (email only): `auto` (by account type) · `MC` (student) · `MCEM` (employee).

## Design / layout elements

No value, `label` may be empty.

| Type | Key properties |
|---|---|
| `heading` | `label` = the heading text; `content` = optional subtitle (HTML). |
| `rich_text` | `content` = the body (HTML). `align`. |
| `divider` | Horizontal rule. `h: 16`. |
| `spacer` | Blank gap. `h` is exact. |
| `image` | `imageUrl` (data URI or app asset path), `imageAlt`, `align`. `h` exact. |
| `shape` | `shapeVariant: rectangle|ellipse`, `style.backgroundColor`, `cornerRadius`, `borderColor`, `borderWidth`. |
| `embed` | `embed: { "url": "https://public.tableau.com/…" }` — allowlisted hosts only. |

## Advanced (prefer to leave these to the builder)

- `sql_source` — a builder-authored SELECT that feeds dropdown options or a table.
  Omit `sql.connectionId`; it is stripped on export and chosen in the app.
- `optionsSource` — binds a choice field's options to a `sql_source` element.
- `fillFrom` — `{ "sourceId": "<id>", "column": "<COLUMN>" }` fills a text, textarea,
  number, date, dropdown, radio or lookup field from a query's row: from a `sql_source`
  element, its first row (the filler's own record); from a dropdown/radio fed by a query,
  the row behind the option picked (pick a student → their ID and email fill in).
- `code` — sandboxed HTML/CSS/JS block.
- `table` / `chart` — visualisations bound to a `sql_source`.

Don't invent SQL. If a form needs data-driven options you can't verify, use static
`options` and note it for the builder.

### Queries: binds and rules

When you *do* have a confirmed table (the user gave it to you), a `sql_source` query:

- is a single `SELECT` (a `WITH …` CTE is fine, including a recursive one); no
  `INSERT`/`UPDATE`/PL-SQL, no `INTO`, no database links (`@`), no `DBMS_`/`UTL_`;
- can use **only two binds**, filled by the server with the person filling in the form:
  `:bannerId` (their Banner ID) and `:pidm` (their PIDM). Case doesn't matter
  (`:bannerID` works). Any other bind is an error. Filter on one of them, or every
  user sees the same rows;
- qualifies table names with their schema (`saturn.spriden`, `manhattan.gzrtmty`);
- must have every table it reads allow-listed on the connection, and granted to the
  read-only Banner account. List the tables in your summary.

A `sql_source` element shows its **first row** as label/value pairs (column aliases
become the labels), so shape a "your details" query to return one row:
`SUM(CASE WHEN … END) AS "Vacation used"`.

## Validation rules

```json
"validations": [
  { "type": "minLength", "value": 2, "message": "Too short" },
  { "type": "regex", "value": "^[0-9]{9}$", "message": "9 digits" }
]
```
Types: `required` · `email` · `regex` · `minLength` · `maxLength` · `min` · `max` · `custom`.
(`"required": true` on the field is the normal way to require it.)

## Conditional logic

```json
"conditionalLogic": [
  { "sourceFieldId": "reasons", "operator": "contains", "value": "other",
    "action": "show" }
]
```

- Operators: `eq` · `neq` · `gt` · `lt` · `gte` · `lte` · `contains` · `empty` · `notEmpty`.
- Actions: `show` · `hide` · `require` · `unrequire` · `enable` · `disable` · `setValue`
  (`setValue` also takes `actionValue`).
- The rule lives on the field being affected. `targetFieldId` can redirect it at another
  field, but the default (this field) is what you normally want.
- **`show` hides the field until the rule fires.** `hide` does the opposite: visible until
  it fires. Don't put both on one field.
- Multi-select `checkbox` sources hold an array → use `contains`.

## Approver fields and audiences

A form can have more than one audience: the submitter, and the approver of each
workflow step. Steps are named by their workflow **node id** (see `workflows.md`).

### `filledByStep`: the approver fills it in

```json
{ "id": "supervisor_comments", "type": "textarea", "label": "Supervisor comments",
  "filledByStep": "supervisor" }
```

- The submitter sees it read-only; the approver of step `supervisor` fills it in from
  their approvals inbox before deciding.
- `"required": true` means that approver can't **approve** until it's filled in
  (declining doesn't need it). The submitter is never held to it.
- Typical uses: an approver's signature and date, a decision dropdown, comments.
  Each approver gets **their own** fields: with three approvers who each sign, make
  three signature fields.

### `hideFrom`: who doesn't see it

```json
"hideFrom": { "submitter": true, "steps": ["registrar"] }
```

- On a field or a **page**. `submitter: true` hides it from the person submitting;
  `steps` hides it from those steps' approvers; on a page, `always: true` hides it from
  everyone filling in or approving.
- Hidden answers are removed by the server, not just undrawn, and left out of the
  copy of the PDF that person downloads. Staff with full access (responses, reports,
  the archived PDF) still see everything.
- Common pattern: a step's decision is `hideFrom.submitter` while its signature and
  date stay visible.

## Calculated fields

```json
"calculatedFields": [
  { "id": "total", "formula": "quantity * price" }
]
```
Reference them from a `calculated` field via `"calculatedFieldId": "total"`. Formulas use
other fields' ids.

## Page settings

```json
"settings": { "showProgress": true }
```
Multi-page forms get a clickable page navigator automatically; give each page a clear
`title` since those become the navigator labels.

A page can be hidden, or shown/hidden by an answer:

```json
{ "id": "grad-page", "title": "Graduation details",
  "conditionalLogic": [{ "sourceFieldId": "graduating", "operator": "eq",
                         "value": "yes", "action": "show" }],
  "hideFrom": { "steps": ["registrar"] },
  "fields": [ … ] }
```

- Page rules take only `show` / `hide` (same operators as fields). With a `show` rule
  the page is hidden until it matches; `hide` wins over `show`.
- A page's rule can't watch a field **on that same page**: once hidden, nobody could
  change it back.
- Hidden pages are skipped (not shown blank) and their questions aren't required.

### Team calendar (time off, remote days)

A form whose answers are **dates people are out** (time off, travel, remote days) shows
up on JasperFlow's **Team Calendar**: the submitter sees their own, and approvers see
the requests they approve. Model the dates as a `repeating_table`, one row per stretch,
with `date` columns for the first and last day, a `dropdown` for the type, and a
`dropdown` for full or half day. Then say which columns are which:

```json
"settings": { "calendar": { "tableFieldId": "time_requested",
  "startColumn": "start_date", "endColumn": "end_date",
  "typeColumn": "leave_type", "portionColumn": "day_portion" } }
```

Without it, the calendar guesses from the first table that has a date column. Type
values containing `vacation`, `sick` or `remote` get their own colours.
