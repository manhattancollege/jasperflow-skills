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
