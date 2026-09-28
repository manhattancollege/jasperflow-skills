# jasperflow-form skill

Ask Claude to build a JasperFlow form — or convert a Softdocs/Etrieve form — and it
produces a `.jasperflow.json` you import through **Forms → Import** in JasperFlow
(it lands as a Draft to review before publishing).

## Install it (you do NOT need to clone this repo)

**Option A — plugin (recommended, stays up to date).** In Claude Code:

```
/plugin marketplace add manhattancollege/jasperflow-skills
/plugin install jasperflow@manhattan-jasperflow
```

This repository is public, so there is nothing to sign in to. The skill is then
available in every session. Just ask Claude to build a JasperFlow form and it fires
automatically — or invoke it explicitly with `/jasperflow:form`.

**Option B — copy the folder (no GitHub access needed).** Drop this folder into your
personal skills directory:

```
~/.claude/skills/jasperflow-form/
```

It loads in every Claude Code session, no install step.

## What it does

Claude writes the form definition, then runs the bundled validator before handing it
over, so you don't discover problems at import time:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-form.mjs" my-form.jasperflow.json
```

## Contents

| File | Purpose |
|---|---|
| `SKILL.md` | The skill: output contract, canvas layout model, gotchas, Softdocs mapping |
| `reference/fields.md` | Every field type, validation rule, and conditional operator |
| `reference/example.jasperflow.json` | A correct two-column form with a conditional field |
| `scripts/validate-form.mjs` | Pre-import validator (run before sharing a form) |

## Note for claude.ai web users

The validator is a local script, so it runs in Claude Code and the Claude desktop app
but not in web sessions. Everything else (the guidance and the generated JSON) works
the same — just validate locally, or import and let JasperFlow's own checks catch it.
