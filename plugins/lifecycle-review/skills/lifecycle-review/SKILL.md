---
name: lifecycle-review
description: Review, model and chart a Trakk Lifecycle export (a .zip, or a folder of CSVs) — validate it, recompute the renewal forecast with a port of the app's own cost engine, answer "what if" questions by applying scenario overrides, and render the app's Overview charts as static SVG. Use whenever the user supplies a lifecycle model export, asks about a lifecycle or renewal model or forecast, asks what renewal spend looks like over 10/30/50 years, asks what happens if an expected life or a cost changes, asks why an asset's replacement cost or expected life looks wrong, or wants charts of a renewal plan.
---

# Trakk Lifecycle model review

A Trakk Lifecycle export describes one organisation's lifecycle costing model:
the asset register, the renewal assumptions the user entered, their
planned-maintenance schedules, their unit-rate library, and the app's own
computed forecast. Input may be a **ZIP** as the app exports it, a **folder of
CSVs**, or a single CSV — pass whichever the user has.

**Run the script — do not read the CSVs by hand.** The registers run to hundreds
of rows, the arithmetic has fallbacks you will get wrong from memory, and the
interesting failures are referential (a plan pointing at a deleted asset, a
pinned rate that no longer exists) — invisible when reading one file at a time.

## How you invoke this

**Always go through the launcher**, never `scripts/lifecycle.mjs` directly:

```bash
node bin/lifecycle.mjs <command> <input>
```

The skill ships the instructions and the domain reference. **The model code is delivered
separately** and the launcher finds it — by `--scripts <dir>`, then
`$TRAKK_LIFECYCLE_SCRIPTS`, then `./trakk-lifecycle.json`, then
`~/.trakk/lifecycle/scripts/`, then a dev checkout alongside the skill.

If the scripts are not installed, every command exits **3** with a pointer to:

```bash
node bin/lifecycle.mjs doctor
```

`doctor` lists every location it looked at, says why each did or did not fire, and prints
the three ways to install. **Run it first whenever a command fails with exit 3** — the
problem is deployment, not the model, and nothing else will tell you that.

## Do this first, always

```bash
node bin/lifecycle.mjs inspect <input>
```

It is cheap and it tells you the one thing that governs everything else:
**whether the cost engine can run**, and how much of the register's type
vocabulary resolves. Then:

```bash
node bin/lifecycle.mjs report <input> -o review.md
```

Validate + analyse in one pass, as markdown. Exit `1` when there are errors, `0`
otherwise, `2` if the input could not be read.

## The engine needs three tables the ZIP does not carry

| Table | Without it |
|---|---|
| `costIndex.csv` | **The engine will not run.** Every cost escalation resolves to 0, so the tool falls back to reading the app's `model.csv` as-is. |
| `renewalClasses.csv` | Only assets with their own `exp_life` override get a life; the rest go red. |
| `assetSchema.csv` | **No asset type resolves to a renewal class.** A real register stores `assets.type` as a display label ("Pipe Fitting - End") while `renewalClasses.types` holds keys (`pipe_fit_end`). This extract is the bridge — one row per type, `type_key,type_name`. |

If they are in the input folder they are picked up automatically (several
filename spellings are accepted). Otherwise: `--price-index`, `--classes`,
`--asset-schema`.

Older exports carry `assetTypeMapping.csv` instead; it is still read as a
fallback (`--asset-types`), and `X07` will say so. Exports from one day in
November 2026 carry an inline `type_key` column on `assets.csv` — also still
read, also reverted.

**`assetSchema.csv` has its own failure mode: staleness.** The schema now travels
in its own table, so it can be exported from a different moment than the
register. `X10` fires when a register type is absent from the extract — those
assets resolve to nothing at all.

**If `inspect` says types do not resolve, say so before quoting any number.** A
forecast built on 0-of-91 resolved types is not a forecast of that portfolio —
it is a forecast of the handful of assets carrying their own overrides. Ask the
user to export the Asset Type Mapping screen.

## The commands

| Command | Use it when |
|---|---|
| `doctor` | Where the model scripts resolved from. The only command that works without them |
| `inspect <in>` | Always first. What is present, the metadata, the scenario map, and whether the engine is ready |
| `validate <in> [--json]` | Just the findings, no numbers. |
| `analyse <in> [--json]` | Just the numbers, no findings. `--json` for arithmetic of your own. |
| `report <in> [-o FILE]` | The deliverable. |
| `forecast <in> [--json]` | Run the engine. Per-bin and per-year cashflow, per-asset schedules, flag tally. |
| `scenario <in> …` | Answer a "what if" — one or several alternatives at once. See below. |
| `package <in> --scenario F -o DIR` | The decision pack: base-case CSVs + scenario JSON + comparison charts + the review. Hand this to a decision-maker. |
| `charts <in> -o DIR` | Five SVGs plus an `index.html` — the Overview page, static. |
| `parity <in>` | Engine vs the app's own `model.csv`, asset by asset. Run it before trusting a recomputed number on an unfamiliar export. |
| `csv <in> <table> [--where col=value] [--limit N]` | Pull one table out to grep or quote. |
| `asset <in> <assetID>` | One asset across every table, plus its resolved class, pinned rate, engine detail and children. Reach for this the moment a question is about a specific asset. |
| `edit <in> --where k=v --set k=v [--dry-run]` | Write plan or asset field changes back to the folder. See below. |
| `edit <in> --from-scenario FILE --scenario "Name" [--dry-run]` | Commit a named scenario from a set as the new baseline. |
| `rebuild <in>` | Regenerate `model.csv` from the cost engine. Run after `edit`. |

Window options throughout: `--years N` (default 30), `--start YYYY` (default
this year), `--bin N` (default 5). `--app-model` reads the app's `model.csv`
instead of recomputing — use it when you want to review *what the app produced*
rather than what it should have produced.

## Answering a "what if"

```bash
node bin/lifecycle.mjs scenario <in> \
  --where 'renewal_class=Pipework & Conduits' --set exp_life=120
```

For anything with more than one rule, write a JSON file and pass `--scenario`:

```json
{ "name": "Extend pipework life",
  "rules": [
    { "where": { "renewal_class": "Pipework & Conduits" }, "set": { "exp_life": 120 } },
    { "where": { "status": "red" }, "set": { "cost_method": "MANUAL", "manual_cost": 25000, "cost_year": 2026 } }
  ] }
```

Rules apply **in order**, so a broad rule can be narrowed by a later one.
Nothing is written to disk — the baseline is always retained and reported
alongside, so every answer is a delta rather than a bare number.

`where` matches asset columns, plan columns, the **resolved** `renewal_class`,
and the baseline `status`. Strings match case-insensitively; an array matches
any member; `"*"` matches everything; `""` matches *unset*; `"!"` matches *has a
value*; `"<25"` and `">=2040"` compare numerically.

Two traps worth knowing:

- `where: { exp_life: "" }` selects assets whose **plan** field is blank — which
  includes assets that do have a life from their class default. Setting
  `exp_life` on those *overrides* the class, which can move the forecast in the
  direction you did not expect. Read the per-rule match count before believing
  the delta.
- Changing a life on an asset whose cost is 0 moves nothing. If a scenario
  reports no change, check the flag tally in `forecast` first — a register where
  most assets have no `c_inst` cannot respond to life changes.

Always report the **per-rule audit** (how many assets each rule matched)
alongside the delta. A rule that matched nothing is flagged; say so rather than
reporting a $0 change as if it were an answer. Note the audit's "matched" count
and the "actually changed" count differ when a rule sets a value an asset
already had.

### The scenario map in `trakk-config.yaml`

```bash
node bin/lifecycle.mjs scenario <in> --scenario set.json --export-config pack/
```

Writes a `scenarios:` **map** into `trakk-config.yaml` — name → `{ file, notes, rules,
grandTotal, vsBaseline }` — and one JSON per scenario beside it. The YAML carries the
headline so a person opening the folder can read it; the JSON carries the per-asset
working. An existing config is merged, not clobbered, so the app's own metadata survives.

`inspect` lists the map when one is present, so you can see what scenarios a folder holds
before opening anything.

### Committing a scenario as the new baseline

The natural progression is: model a scenario → compare it → decide to keep it. When a scenario is chosen, commit it and regenerate the forecast:

```bash
node bin/lifecycle.mjs edit <in> --from-scenario set.json --scenario "Extended pipe life"
node bin/lifecycle.mjs rebuild <in>
```

`edit` writes the scenario's plan changes back to `renewal.csv` (and `assets.csv` if the scenario touches asset fields). `rebuild` regenerates `model.csv` from the updated plans. After both commands, the folder reflects the new baseline — `inspect` and `report` will show the committed numbers.

You can also commit a one-off field change without a scenario file:

```bash
node bin/lifecycle.mjs edit <in> --where 'renewal_class=Pipework & Conduits' --set exp_life=120
node bin/lifecycle.mjs rebuild <in>
```

**Safety rules — these matter because there is no undo:**

- Always `--dry-run` first. It prints exactly what would change (matched count, example asset IDs) without writing anything.
- The tool backs up `renewal.csv`, `maintenance.csv`, `assets.csv` and `trakk-config.yaml` to a timestamped `_backup_<ISO>/` folder before the first write of a session. Keep these.
- After any `edit`, `model.csv` is stale. Run `rebuild` before quoting a forecast number.
- `rebuild` refuses when the cost index is missing. It will not write a model.csv full of zeroes over a good one.
- **Only a folder of CSVs can be edited.** A ZIP is read-only. If the user has a ZIP, unpack it first.
- The writable fields are: plan fields (`exp_life`, `rep_year`, `residual_pct`, `cost_method`, `manual_cost`, `cost_year`, `confidence`, `model_level`, `preferred_rate_code`, `plan_comment`) and selected asset attributes (`label`, `man`, `mod`, `ser`, `ds_inst`, `opstat`, `crit`, `description`, `c_inst`, `replace_cost`). `assetID`, `parent`, and `type` are structural and cannot be changed here.

**When to loop in the app instead:** changing an asset's type, moving it in the hierarchy, or merging registers — those are the app's job. The app has the full re-keying and audit trail infrastructure; this tool does not.

### Exporting a scenario

```bash
node bin/lifecycle.mjs scenario <in> --scenario set.json --export-json scenarios.json
```

The JSON is the handover format — **not CSV**. The app will grow an
apply/commit workflow against it, so it carries everything needed to commit a
scenario without this tool present:

- `source` — which export it was computed from, and its type-resolution coverage, so a reader can tell whether the base case still matches what the app holds.
- `scenarios[].rules` — the **intent**.
- `scenarios[].audit` — what each rule actually selected. The rules alone do not prove this.
- `scenarios[].delta` — the resolved per-asset before/after. The **effect**: exactly what the app commits.
- `scenarios[].outcome` — the figures a decision-maker reads.

Do not emit a scenario as `renewal.csv` and tell someone to import it. The app's
importer has no concept of a scenario, so that **overwrites their baseline plan**
silently.

## The decision pack

```bash
node bin/lifecycle.mjs package <in> --scenario set.json -o pack/
```

Base-case CSVs (verbatim) + `scenarios.json` + `review.md` + all the charts +
a `README.md` with a reading order. The inputs travel with the conclusions, so
the pack is auditable on its own months later. This is the thing to produce when
someone asks for "the numbers for the workshop".

## Charts

```bash
node bin/lifecycle.mjs charts <in> -o charts/ --group class
```

`status.svg` (KPI bar + status mix), `bins.svg` (OVR-1, binned renewal vs PM),
`annual-renewal.svg` (OVR-2), `annual-pm.svg` (OVR-3), `treemap.svg` (OVR-5,
grouped by `root`, `class` or `type`), and `index.html` with all five. Plain
SVG — no JS, no CSS file, no web fonts — so they paste into a document and
survive being emailed. `scenario … -o out.svg` writes the comparison chart.

## How to read the result

Work down in this order; stopping early wastes the user's time on symptoms.

1. **Errors first.** An error means the model is wrong or will not re-import
   cleanly — a duplicate key silently discards rows, a dangling parent breaks
   rollup, a bad `cost_method` silently reverts to RESIDUAL. Quote the finding
   id (`S07`, `R06`, …) and say which assets are affected.
2. **Then coverage.** A model where 40 of 375 assets have a renewal plan is not
   a model with a forecast problem; it is a model that is 11% built. Say that
   plainly rather than analysing the cashflow of a tenth of the register.
3. **Then the red count.** `red` status means no expected life or no cost: the
   asset is in the forecast contributing **zero**. A big red count makes the
   grand total an understatement, not an estimate.
4. **Then the overdue backlog.** The engine deliberately leaves a missed renewal
   out of the forecast events. That backlog is real spend sitting outside every
   number in the cashflow table. It is usually the single most important thing
   to tell an asset manager.
5. **Then the cashflow and class rollup** — the numbers people actually asked for.
6. **Then the gaps** — the shortest route to a better model.

## What this tool does not do

- **It does not write to ZIPs.** The `edit` and `rebuild` commands require a folder of CSVs — a ZIP is read-only. Unpack it with `unzip` before editing.
- **It does not read `schema.merged`.** The display-label → type-key map lives in
  the platform schema, which is why `assetTypeMapping.csv` has to come along.
- **It does not know the org's parent-cost default.** the default is `exclude`; if the org has set a different
  one, pass it through a scenario or expect parent assets to be excluded where the app
  included them.
- **It does not discount.** Costs are in today's dollars, undiscounted — as the app forecasts them. There is no NPV.

## Status is tree-aware — do not report the per-asset one as the headline

`model.csv`'s `status` column is the app's `treeStatusFor()`: a parent takes the
**worst status among its descendants** (`red > yellow > green > rollup`). This
tool computes both and reports the tree one as the headline.

It matters because the per-asset status of a parent in `exclude` mode is `rollup`
— "nothing to see here" — while the tree says `red` if anything beneath it is
broken. Reporting the per-asset status at parent level therefore **undercounts
red at exactly the level a portfolio gets read at**. On the Waimea export the
difference is 28 assets.

`parity` reports both (`tree status` ~99.7%, `plan status` ~87%). If you see the
plan-status figure quoted as a parity failure, it is not one.

## Before you explain anything about the model

Read [`reference/model.md`](reference/model.md) — the **concept guide**. What a renewal
class is, how the three cost methods differ in character, how parent rollup decides what
gets counted, what each status colour means, and the behaviours that surprise people: an
install date inherited from a parent, an overdue renewal sitting outside every total, a
pinned unit rate degrading quietly when it is deleted.

**For the precise formulas, resolution orders and the matching algorithm, read the
extended reference.** It ships with the model engine rather than with this skill:

```bash
node bin/lifecycle.mjs doctor      # prints "Extended reference: <path>"
```

Reach for it when you need to explain *why* a specific asset produced a specific number.
The fallback chains are specific and counter-intuitive, and the concept guide deliberately
does not spell them out — so **do not infer a formula from the concept guide**. If
`doctor` reports the extended reference is not present, the engine install is incomplete:
say so and re-deploy rather than guessing.

- [`reference/zip-format.md`](reference/zip-format.md) — every file and column, which are round-trip vs export-only, and the three reference tables.
- [`reference/checks.md`](reference/checks.md) — every finding id, what triggers it, and how to fix it.
