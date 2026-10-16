# JasperFlow skills for Claude

Claude skills for building forms for **JasperFlow**, Manhattan University's form
and workflow platform.

Ask Claude to build a form and it produces a `.jasperflow.json` file you import
through **Forms → Import**. If the form needs approvals ("goes to their supervisor,
then HR"), it also produces a `.workflow.jasperflow.json` you import through
**Workflow Builder → Import**. Imports always create **drafts**: nothing goes live
until a person reviews and publishes it.

Import the workflow first and publish it, then import the form and attach the
workflow in the form's Settings.

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

> Build a time-off request that goes to the employee's supervisor, and to HR when
> it uses carried-over days. The supervisor should add a comment.

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
| `jasperflow-form/reference/workflows.md` | The workflow file: steps, assignments, conditions |
| `jasperflow-form/reference/example.jasperflow.json` | A complete worked example form |
| `jasperflow-form/reference/example.workflow.jasperflow.json` | The workflow that routes the example form |
| `jasperflow-form/scripts/validate-form.mjs` | Form validator; catches what only breaks at import time |
| `jasperflow-form/scripts/validate-workflow.mjs` | Workflow validator; also checks it against its form |

This repository contains the authoring skill only. JasperFlow itself is a
separate, private codebase.

## Questions

Manhattan University · Enterprise Applications.
