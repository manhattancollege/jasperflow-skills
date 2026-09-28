# JasperFlow skills for Claude

Claude skills for building forms for **JasperFlow**, Manhattan University's form
and workflow platform.

Ask Claude to build a form and it produces a `.jasperflow.json` file you import
through **Forms → Import**. Import always creates a **draft** — nothing goes live
until a person reviews and publishes it.

## Install

In Claude Code:

```
/plugin marketplace add manhattancollege/jasperflow-skills
/plugin install jasperflow@manhattan-jasperflow
```

No GitHub account needed — this repository is public.

## Use

Ask in plain language:

> Build a JasperFlow form for an exit interview: name, department, last day, a
> few rating questions and a comments box.

Or invoke the skill directly:

```
/jasperflow:form
```

It also converts existing forms — paste in a Softdocs/Etrieve form's HTML or
JSON, or hand it a PDF or screenshot, and ask for the JasperFlow equivalent.

## What's in here

| | |
|---|---|
| `jasperflow-form/SKILL.md` | The skill itself — the form format, layout model and conventions |
| `jasperflow-form/reference/fields.md` | Every field type and its options |
| `jasperflow-form/reference/example.jasperflow.json` | A complete worked example |
| `jasperflow-form/scripts/validate-form.mjs` | Pre-import validator; catches what only breaks at import time |

This repository contains the authoring skill only. JasperFlow itself is a
separate, private codebase.

## Questions

Manhattan University · Enterprise Applications.
