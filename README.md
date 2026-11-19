# am-agent

Asset-management skills for your AI agent, from [Trakk Assets](https://trakkassets.com).

Initial release provides your agent with Lifecycle Planning tools building upon [Trakk Lifecycle](https://lifecycle.trakkassets.com). Plans to include additional skills are on our roadmap. 

## Install

### Skills

Designed to use in Claude, untested in other harnesses.

```
/plugin marketplace add TrakkAssets/am-agent
/plugin install lifecycle-review@am-agent
```

### Dependancies

Some skills required licensed dependancies. By example: the `lifecycle-review` engine is licensed separately and installed as part of a setup process.
After installing the plugin:

```bash
node bin/lifecycle.mjs doctor
```

Checks your setup and default install locations providing you advice on how to install. 

Any command exits **3** when the engine is not installed. That is a deployment
problem, not a data problem, and `doctor` is the thing that tells you which.

| Dependancy Resolution |
|---|
| `--scripts <dir>` on the command line |
| `$TRAKK_LIFECYCLE_SCRIPTS` |
| `./trakk-lifecycle.json` — `{ "scripts": "<dir>" }` |
| `~/.trakk/lifecycle/scripts/` — the conventional location, needs no configuration |


## Skills

### `lifecycle-review`

Analyse your asset lifecycle planning with your agent. Takes (or builds) a **Trakk Lifecycle model**, and gives your agent the intelligence to assist with its development — "is this model complete?", "what does the next 30 years cost?", "what if pipework lasted 120 years?" — without opening the app.

It validates the export (40 checks across structure, referential integrity, value domains, numerics and engine consistency), recomputes the renewal forecast using the Trakk Lifecycle own costing logic. You can build and compare scenarios against a baseline, and assemble a decision pack of inputs, conclusions and charts.

Start from your own data, or an export from Trakk Lifecycle `lifecycle-model-*.zip` extracted to a working folder.

*NOTE: the model engine is delivered separately*

This repo carries the skill — the instructions and the domain documentation. The costing engine is installed dependancy installed on first use.

## What it will not do

It does not write back to the Trakk platform. To change a model you edit the CSVs and use the app's **Import model (.zip)**. Scenarios are in-memory and export as JSON; the app grows its own apply/commit path for those.

Costs are in today's dollars, undiscounted — exactly as the app forecasts them. 
There is no NPV here.

## Support

Issues and questions: <support@trakkassets.com>
