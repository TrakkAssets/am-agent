# am-agent

Asset-management skills for Claude, from [Trakk Assets](https://trakkassets.com).

## Install

```
/plugin marketplace add TrakkAssets/am-agent
/plugin install lifecycle-review@am-agent
```

If `/plugin marketplace add` does not find it, open the marketplace interactively
with `/plugin` and enter `TrakkAssets/am-agent` when prompted for a source.

## Skills

### `lifecycle-review`

Turns a **Trakk Lifecycle model export** into something you can interrogate in
conversation — "is this model complete?", "what does the next 30 years cost?",
"what if pipework lasted 120 years?" — without opening the app.

It validates the export (40 checks across structure, referential integrity,
value domains, numerics and engine consistency), recomputes the renewal
forecast using the app's own costing logic, compares up to three scenarios
against a baseline, and assembles a decision pack of inputs, conclusions and
charts.

Input is a `lifecycle-model-*.zip` as the app exports it, a folder of CSVs, or a
single CSV.

## The model engine is delivered separately

**This repo carries the skill — the instructions and the domain documentation.
It does not carry the costing engine.** The engine is licensed separately and
installed as a directory of scripts; the skill's launcher finds it.

After installing the plugin:

```bash
node bin/lifecycle.mjs doctor
```

That lists every location checked, says why each did or did not resolve, and
prints how to install. Resolution order:

| | Where |
|---|---|
| 1 | `--scripts <dir>` on the command line |
| 2 | `$TRAKK_LIFECYCLE_SCRIPTS` |
| 3 | `./trakk-lifecycle.json` — `{ "scripts": "<dir>" }` |
| 4 | `~/.trakk/lifecycle/scripts/` — the conventional location, needs no configuration |

Any command exits **3** when the engine is not installed. That is a deployment
problem, not a data problem, and `doctor` is the thing that tells you which.

## What it will not do

It does not write back to the Trakk platform. To change a model you edit the
CSVs and use the app's **Import model (.zip)**. Scenarios are in-memory and
export as JSON; the app grows its own apply/commit path for those.

Costs are in today's dollars, undiscounted — exactly as the app forecasts them.
There is no NPV here.

## Support

Issues and questions: <https://github.com/TrakkAssets/am-agent/issues>
