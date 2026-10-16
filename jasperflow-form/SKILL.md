---
name: form
description: Build a JasperFlow form, and its approval workflow, as importable files (.jasperflow.json and .workflow.jasperflow.json). Use whenever someone wants to create, draft, scaffold, or mock up a form or an approval routing for JasperFlow (Manhattan University's form & workflow platform), or to convert an existing form into JasperFlow — including migrating a Softdocs/Etrieve form and its routing. Triggers include "build a JasperFlow form", "make a form for JasperFlow", "it needs supervisor approval", "add a workflow", "convert this Softdocs form", "turn this HTML/PDF/screenshot into a JasperFlow form", "import this into JasperFlow".
---

# Building a JasperFlow form

You produce a **form file** that a form builder imports through **Forms → Import** in
JasperFlow, and, whenever the request involves approvals or routing ("goes to their
supervisor", "HR signs off"), a **workflow file** imported through **Workflow Builder →
Import**. Both imports create **drafts**: nothing goes live until a person reviews and
publishes it, so favour a good first draft over asking many questions up front.

## What you deliver

Write a file named `<slug>.jasperflow.json` (e.g. `exit-interview.jasperflow.json`) with
this exact envelope:

```json
{
  "schemaVersion": 1,
  "name": "Exit Interview Questionnaire",
  "description": "Collected when an employee leaves.",
  "definition": {
    "id": "exit-interview-questionnaire",
    "title": "Exit Interview Questionnaire",
    "settings": { "showProgress": true },
    "calculatedFields": [],
    "pages": [
      { "id": "page-1", "title": "Page 1",
        "canvas": { "width": 800, "height": 1000 },
        "fields": [ /* … */ ] }
    ]
  }
}
```

If it needs approvals, also write `<slug>.workflow.jasperflow.json`. The format is in
`reference/workflows.md` and a matching pair is in `reference/example*.json`.

Then tell the user how to import, **in this order** (a form can only be attached to a
*published* workflow):

1. **Workflow Builder → Import** → choose the workflow file. If it lists steps to fix
   (a person or group it couldn't match), fix them, then **Publish**.
2. **Forms → Import** → choose the form file → open **Settings** → attach the workflow.
3. Review, run a test, and publish the form.

With no workflow, it's just step 2: the form lands as a draft to review and publish.

**Always run the validator before handing the file over** — it catches the mistakes that
only surface at import time:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-form.mjs" <file>.jasperflow.json
```

With a workflow, validate both. Each checks the other's references, such as step ids in
`filledByStep` and form fields in conditions:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-form.mjs" <slug>.jasperflow.json --workflow <slug>.workflow.jasperflow.json
node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-workflow.mjs" <slug>.workflow.jasperflow.json --form <slug>.jasperflow.json
```

If that variable is not set (the skill is checked out rather than installed as a
plugin), run `scripts/validate-form.mjs` from this skill's own directory instead.

## The layout model — read this before placing anything

Forms are a **free-form canvas**, not a flowing document.

- The canvas is **800 px wide**. Every field needs `position: {x, y, w, h}` in canvas
  pixels, origin **top-left**.
- Keep content inside a **40 px left margin** → usable band is `x: 40` to `x: 760`
  (a full-width element is `x: 40, w: 720`).
- At runtime fields are **grouped into rows** by overlapping vertical bands, then rows
  flow top-to-bottom and **grow** to fit their content. So:
  - `x` and `w` are honoured exactly → this is how you get columns.
  - Two fields sharing a vertical band sit **side by side** (e.g. `y: 200` with
    `x: 40, w: 350` and `x: 410, w: 350`).
  - `y` gaps are approximate — leave clean separation between rows and never overlap
    boxes that aren't meant to be side by side.
- `h` is a minimum for inputs (they grow), but **exact** for decorative elements
  (`image`, `shape`, `divider`, `spacer`, `embed`).
- Give inputs room: a single-line input ≈ `h: 72` (label + control), a `textarea`
  ≈ `h: 120`, a checkbox/radio group ≈ `24 + 26 × option count`.

## Rules that will bite you

1. **Field `id` must be unique across the whole form** and stable. Use readable ids
   (`reason_for_leaving`, not `text_1`) — conditional logic references them.
2. **Every input field needs a non-empty `label`.** Design elements (`heading`,
   `rich_text`, `divider`, `spacer`, `image`, `shape`) do not.
3. **Options are `{label, value}` pairs.** Set a meaningful `value`
   (`{"label": "Other", "value": "other"}`) — don't emit `option_1`-style values.
4. **`show` means hidden until the rule fires.** A field targeted by a `show` rule is
   *hidden by default*. To reveal an "Other" text box:
   ```json
   "conditionalLogic": [{ "sourceFieldId": "reasons", "operator": "contains",
                          "value": "other", "action": "show" }]
   ```
   Match the option's **`value`**. (Matching its label also works, but value is correct.)
   For a multi-select `checkbox` source use `contains`; for `dropdown`/`radio` use `eq`.
5. **`content`, heading subtitles and `helpText` are HTML**, sanitized to
   `b strong i em u s ul ol li p br span a[href]`. Use `<ul><li>` for bullets. No
   scripts, styles, or other tags — they are stripped.
6. **`embed` URLs must be `https` on an allowlisted host**: `public.tableau.com`,
   `tableau-prod.manhattan.edu`, `tableau.manhattan.edu`, `mctableau.manhattan.edu`.
   Anything else is rejected at import.
7. **Don't invent a data source.** For `sql_source`/`lookup` fields, omit
   `sql.connectionId`; the builder picks the Banner connection in the app. Never guess
   at table names; if a field needs Banner data you can't confirm, leave it a plain input
   and say so in your summary. When the user **gives** you the table (and ideally its
   columns or sample rows), write the query. It may use only `:bannerId` and `:pidm`,
   both filled in with the person filling in the form; see "Queries" in
   `reference/fields.md`. List every table it reads, since each must be granted and
   allow-listed.
8. **Banner autofill**: set `bannerPrefillPath` on a `lookup` field to one of:
   - `firstName` — first name
   - `lastName` — last name
   - `bannerId` — Banner ID
   - `email` — email address; add `"bannerEmailCode": "auto" | "MC" | "MCEM"`
     (MC = student, MCEM = employee)

   Employment paths, for employees only — they come from the person's current Banner
   job and are empty for students:
   - `position` — position number
   - `jobTitle` — job title
   - `department` — department title
   - `departmentCode` — department org code
   - `supervisorName` — supervisor's full name

9. **Approver fields and who sees what.** When an approver signs, dates or decides
   something *on the form*, give that field `"filledByStep": "<workflow node id>"`.
   The submitter sees it read-only; the approver fills it in, and must if it's
   `required`. Use `hideFrom` (`submitter`, `steps`, and on pages `always`) to keep a
   field or page from someone, e.g. a decision hidden from the submitter while the
   signature stays visible. Pages can also be shown/hidden by an answer. Use the same
   node ids in both files. Details: "Approver fields and audiences" and "Page
   settings" in `reference/fields.md`.

## House style

Every form starts with the same header block. Copy it verbatim and only change the
title text and intro copy — this is what makes a form look like it belongs to the
university, and it is the thing most often left out.

```json
{ "id": "mu_banner", "type": "image", "label": "", "align": "center",
  "imageUrl": "/assets/mu-banner.svg", "imageAlt": "Manhattan University",
  "style": {},
  "position": { "x": 0, "y": 0, "w": 800, "h": 172 } },

{ "id": "form_title", "type": "heading", "label": "<the form's title>", "content": "",
  "style": { "bold": true, "fontSize": 26 },
  "position": { "x": 40, "y": 196, "w": 720, "h": 44 } },

{ "id": "form_intro", "type": "rich_text", "label": "", "align": "left",
  "content": "<one or two sentences on what the form is for>",
  "style": { "color": "#4b5563", "fontSize": 14 },
  "position": { "x": 40, "y": 246, "w": 720, "h": 79 } },

{ "id": "header_divider", "type": "divider", "label": "", "style": {},
  "position": { "x": 40, "y": 317, "w": 720, "h": 16 } }
```

Note the banner is **full-bleed**: `x: 0, w: 800`, edge to edge, NOT inset to the
40px margin like everything else. Your first real field starts at about `y: 350`.

The rest:

- Title: `heading`, `style: {"bold": true, "fontSize": 26}`. **Do not set a color** —
  headings already render in Manhattan green (the app's own `primary` token), so
  omitting it stays correct if the brand colour ever changes. Only set `style.color`
  for a deliberate exception.
- Intro/help copy: `rich_text`, `style: {"color": "#4b5563", "fontSize": 14}`.
- Section breaks: a `heading` plus a `divider`.
- Optional footer: centered `rich_text`, `#9ca3af`, 12px —
  "Manhattan University · This form is for official university business."
  Mark every footer element `"pinnedToBottom": true`. That tells the builder the
  element belongs at the bottom, so new elements are inserted ABOVE it instead of
  landing on top of it. Without the flag the builder has to guess from position.

## Converting a Softdocs / Etrieve form

Softdocs forms arrive as HTML (sometimes with a JSON companion). Map them, don't
transliterate:

| Softdocs | JasperFlow |
|---|---|
| `<input type=text/email/tel>` | `text` (add an `email` validation for email) |
| `<textarea>` | `textarea` |
| `<select>` | `dropdown` + `options` |
| radio group | `radio` + `options` |
| checkbox group | `checkbox` + `options` (multi-select, value is an array) |
| `<input type=date>` | `date` |
| `<input type=file>` | `file` |
| signature control | `signature` |
| static markup / instructions | `rich_text` or `heading` |
| `required` attr | `"required": true` |
| show/hide script | `conditionalLogic` (see rule 4) |
| table of repeating rows | `repeating_table` + `columns` |

Softdocs routing/approval markup becomes a **workflow file**, not part of the form:
translate each approval stage into an `approval` step (supervisor, advisor, a person
named on the form, or an approval group) and each routing rule into a `condition`.
Approver-only sections of the Softdocs form become fields with `filledByStep`.

Reconstruct a sane two-column layout from the source's visual grouping; don't try to
pixel-match the original.

## Workflow

1. Read the source (HTML, PDF, screenshot, or a description). Ask only about genuinely
   blocking unknowns — otherwise draft it and flag your assumptions.
2. Write the form file and, if there's routing, the workflow file. Choose the step ids
   first, since the form refers to them.
3. **Run the validators** and fix anything they report.
4. Hand over the files with the import order above, then summarise: the fields you
   created, any conditional logic, the steps and who each goes to, and, explicitly,
   anything you guessed at or left for the builder (tables to grant and allow-list,
   approval groups that must exist, fallback approvers, Banner mappings).

## What the import file can't carry

An import creates the form and its field layout — nothing else. Everything below
lives on the form record, not in the definition, so it is **configured in JasperFlow
after importing**. Don't try to encode these; instead, list the ones this form needs
in your handover summary so the builder knows what's left:

| Set up in the app | Why it matters |
|---|---|
| **Data source** (Banner connection) | Required before Banner autofill (`lookup` fields) or any SQL-backed options resolve. Without it those fields stay blank. |
| **Attach the workflow** | Import the workflow file separately (Workflow Builder → Import), publish it, then attach it in the form's Settings. Only a published workflow can be attached. |
| **Approval groups** | A workflow step assigned to a group needs that group to exist (Admin → Approval Groups). People and groups in a workflow file are matched by email / name. |
| **Who can access it** | Audience: everyone, students, employees, specific roles, or Banner attributes (college / department / major / minor / student attribute). Defaults to everyone. |
| **Availability window** | Optional open/close dates. Outside the window the form stops accepting submissions. |
| **BDM filing** | If the approved PDF should land in AppEnhancer/BDM: the application, index-field mapping, PROD vs TEST, and duplicate handling. |
| **Folder / template** | Where it lives in the form list, and whether it's reusable as a template. |
| **Publish** | Import lands as a **Draft**. It isn't live until someone reviews and publishes it. |

Two behaviours worth knowing when you design the form:

- On approval, JasperFlow generates an **archival PDF** that reproduces the designed
  layout — so the column arrangement you choose is what ends up in the record. Fields
  hidden by conditional logic are correctly left out of that PDF.
- Multi-page forms get a clickable page navigator automatically, so page `title`s
  become its labels. Give them real names, not "Page 2".

## More detail

- `reference/fields.md` — every field type with its properties, validation rules,
  conditional operators, and styling.
- `reference/example.jasperflow.json`: a small, correct, two-column form with a
  conditional "Other" field and a supervisor section (`filledByStep`). Start from it
  when in doubt.
- `reference/workflows.md`: the workflow file: step types, assignment modes,
  conditions, edges, settings.
- `reference/example.workflow.jasperflow.json`: the workflow that routes the example
  form (supervisor, then Finance over $500, declines to a rejected end).
