---
name: asset-register
description: Build a Trakk-shaped asset register from existing spreadsheets or legacy exports — profile columns, map to Trakk fields, infer a parent hierarchy, validate, and emit a register that the lifecycle-review skill and the Trakk app importer both accept. Use when a user has asset data in spreadsheets, CSV exports, or maintenance-system files and wants to bring it into Trakk.
---

# Trakk asset-register builder

A client's asset data lives somewhere — a spreadsheet, a maintenance-system CSV, a consultant's workbook, three files with different column names. This skill helps turn that into a clean Trakk register. It is a conversation: you profile their data, propose how it maps to Trakk's fields, infer a parent hierarchy, validate the result, and emit files that import directly into Trakk and feed the lifecycle skill.

**You run the tools and interpret the output. You do not compute.** The profile script tells you what is there; you tell the user what it means. The validate script tells you what is broken; you tell the user how to fix it.

## How you invoke this

```bash
node bin/asset-register.mjs <command> <args>
```

The launcher is beside this file at `bin/asset-register.mjs`. Commands:
- `profile <file1> [file2 ...]` — profile source files
- `apply-mapping <file1> [...] --mapping mapping.json -o <draft-dir>` — apply mapping rules to source files
- `validate <draft-dir> [--json] [--schema-json schema.json]` — validate the draft register
- `emit <draft-dir> -o <outdir>` — write the final output

## The workflow

Work through these steps in order. Do not skip a step or proceed past a human confirmation point without the user's answer.

### Step 1 — profile

```bash
node bin/asset-register.mjs profile <file1> [file2 ...]
```

Accepts CSV files and Excel workbooks (`.xlsx` — each sheet treated as a separate file). Reports:
- Row count, column names, inferred column type (numeric / date / text / identifier), unique-value count, % blank, and a sample for each column
- Candidate key columns (high-uniqueness columns that could be `assetID`)
- Cross-file FK candidates (a column in one file whose values largely appear in another file's key column)
- Hierarchy candidates (low-cardinality columns that might be parent levels, ranked by uniqueness)

**What you do with it.** Read the output and reason about structure. Use the hierarchy candidates and FK candidates sections to form a mental model of how the files relate. Then move to column mapping.

### Step 2 — author mapping.json (you reason; human confirms)

A column-to-column table is not enough. Real onboarding data requires splitting, merging, and value-dependent routing. Use a declarative `mapping.json` with `where`/`set` rules — the same grammar as scenarios in DEC-0036. The agent authors the rules; the script applies them deterministically; the human confirms the intent before compilation.

**Rule shape:**
```json
{
  "rules": [
    { "where": "*",             "set": { "assetID": "{AssetId}", "type": "{AssetType} - {AssetSubType}", "label": "{AssetDescription}" } },
    { "where": { "Unit": "m3" },"set": { "vol_m3": "{Size}" } },
    { "where": { "Unit": "mm" },"set": { "dia_mm": "{Size}" } },
    { "where": { "Unit": "m" }, "set": { "len_m":  "{Size}" } }
  ]
}
```

`where` selects rows from the source file: exact string match (case-insensitive), `"*"` matches all, `""` matches blank, `"!"` matches non-blank, arrays match any member. `set` maps output column names to template strings — `"{ColumnName}"` is replaced with the source value. Rules apply in order; later rules can refine earlier ones.

After running `apply-mapping`, the script prints a per-rule audit: how many rows each rule matched. Zero matches on a rule is a warning that it may be wrong or unnecessary.

**When to propose mapping.json.** Always. Even a "simple" single-file register with one-to-one column names benefits from an explicit mapping — it makes the intent reviewable and re-runnable. The agent should draft the full rule set for confirmation before running the script.

Rules for authoring:
- **Never silently guess a mapping that changes what an asset is.** If a column could be `assetID` or `label`, surface both and ask.
- For `type`: `assets.type` holds a **display label** (e.g. "Pipe Fitting - End"), not a schema key. If the source holds codes or abbreviations, the mapping must resolve them: `"set": { "type": "{AssetType} - {AssetSubType}" }`. The user must confirm the resulting labels match the Trakk Asset Type screen.
- Columns with no Trakk home: either omit them from `set` (they will not appear in the draft) or include them intentionally (they become `attributes.<key>` on import — only do this for schema attribute keys). Never include them silently.
- Ask the user to confirm the full `mapping.json` before running `apply-mapping`.

### Step 2b — apply-mapping

```bash
node bin/asset-register.mjs apply-mapping <source-files...> --mapping mapping.json -o <draft-dir>
```

Reads the source file(s), applies the rules, writes `draft-dir/assets.csv`. Prints per-rule match counts. Review the audit: a rule that matched zero rows is likely wrong.

### Step 3 — hierarchy inference (you reason; human confirms)

**After** apply-mapping has produced `draft-dir/assets.csv`. Hierarchy inference may require adding synthetic parent rows and re-running apply-mapping with an updated rule set — that is normal.

A Trakk register is a tree: every asset has a `parent` (or is a root). People coming from flat spreadsheets consistently skip this step and produce unmaintainable registers. This is where the work is.

**Read `reference/inheritance.md` before advising on hierarchy.** The key point is the opposite of what people assume: inheritance is a **fallback for data not yet collected**, not a data-entry strategy. Attributes are facts about the individual asset, so capture every one you can — never advise rolling values up to a parent to "simplify" a register.

Use the profile output's hierarchy-candidates section plus these heuristics:
1. **Explicit FK found** — a column in the input that maps directly to values in another file's key column. Use it.
2. **Categorical stratification** — multiple columns where A has N₁ unique values and B has N₂ >> N₁, and each B value is associated with exactly one A value. A is a parent level of B.
3. **Naming convention** — a `label` or similar column containing "/" or ">" separators. Parse the separator and propose a tree from the parsed levels.

Always show the proposed tree with row counts at each level:

```
Site (5 nodes)
  └─ System (28 nodes)
       └─ Component (340 nodes)
```

Say "this is a proposal — does it look right?" and wait for confirmation before assigning `assetID` and `parent` values.

**When to recommend more levels.** A flat list of 500 assets all parented to one site is technically valid but means every install-date change touches 500 rows. If the data has natural sub-groupings (buildings, systems, circuits), propose them.

### Step 4 — draft the register

After the user confirms the column mapping and hierarchy, draft `assets.csv` in a local working directory. Use the confirmed mapping and the confirmed tree. Assign `assetID` values: preserve any existing stable IDs from the source; mint new ones only for synthetic parent nodes (e.g. "Site" rows that did not exist in the source).

If the source data has lifecycle-relevant columns (`ds_inst`, `c_inst`), draft a `renewal.csv` stub too — one row per asset, with `asset_id` populated and all assumption fields blank. The lifecycle skill fills those in.

### Step 5 — validate

```bash
node bin/asset-register.mjs validate <draft-dir> [--json] [--schema-json schema.json]
```

Checks the draft against the register contract and lifecycle readiness. See `reference/checks.md` for the full finding catalogue.

Supply `--schema-json` when the user has a `schema.json` from the lifecycle export ZIP or from the app's merged-schema export (`exportMergedJSON`). With it, `validate` runs `A08` against real type names and `A12` against real attribute keys — the difference between "looks plausible" and "will import cleanly".

**Findings are categorised:**
- **error** — the register will not load or will silently corrupt data. Must fix before `emit`.
- **warn** — the register will load but assets will go red in a lifecycle forecast. Worth fixing.
- **info** — something worth a human's attention; not a defect.

For each error, tell the user what it means and how to fix it. Do not rerun `validate` until they have made the fix — do not loop on the same error without a change.

### Step 6 — emit

```bash
node bin/asset-register.mjs emit <draft-dir> -o <outdir>
```

Writes:
- `assets.csv` — in Trakk's column order
- `renewal.csv` — stub with `asset_id` populated, all assumptions blank (ready for the lifecycle skill)
- `trakk-config.yaml` — metadata stub

Refuses if `validate` finds any errors. Warn findings are allowed through with a note in the output.

**After emit.** There are two import destinations — know which applies:

- **New register (greenfield):** import via **Trakk Assets** (`app.trakkassets.com` → Assets → Import/Export). The app importer creates new assets from the CSV. Every column except `assetID`, `parent`, `latitude`, and `longitude` is written into `attributes.<column-name>` — which is why `emit` writes only intentional columns.
- **Merge into existing assets:** use **Lifecycle → Import model (.zip)** (admin only). This merges `assets.csv` attributes into existing assets on `assetID` match, writing only the editable subset (`label`, `man`, `mod`, `ser`, `ds_inst`, `opstat`, `crit`, `description`, `c_inst`, `replace_cost`). It does not create assets.

See `reference/register-format.md` for the full details on both paths.

## Two concepts to teach as you go

**Parent inheritance.** When an asset has no value, the engine walks up the tree and uses the nearest ancestor's — at compute time, not import time. This is a **fallback for data you do not have yet**, not a reason to leave fields blank. Capture facts per asset wherever the source data has them. A gap is a gap; inheritance makes it degrade gracefully, but the right fix is to source the fact. Report which values were inherited rather than measured. Read `reference/inheritance.md` — it explains the full corrected picture.

**Required fields.** There are two kinds:
- **Required for the app importer to match and load a row:** `assetID` (the match key), `parent` (the app reads it specially for hierarchy). `type` and `label` go into `attributes.type` / `attributes.label` verbatim — they are not enforced load gates, but a register without them is unusable.
- **Required for a lifecycle forecast:** `ds_inst` (own or inherited) drives the renewal year. The **cost** can come from any of three methods — `c_inst` for RESIDUAL, `manual_cost` for MANUAL, or a unit rate for UNIT — so `c_inst` is *not* universally required. Only an asset with no usable cost by *any* method goes red.

Say this explicitly when it comes up. "Required" means different things in different contexts and conflating them is how a client ends up confused about why their register "doesn't work".

## What this skill does not do

- It does not create assets directly — it produces a CSV that the Trakk Assets app importer uses to create (or update) them.
- It does not validate `type` values against the live Trakk schema without `--schema-json`. Supply `schema.json` from the lifecycle export ZIP, or `assetSchema.csv` from the Asset Type Mapping screen, to enable full type checking.
- It does not handle record linkage across two existing registers (merging duplicates from two sources). That is a different problem.
- It does not write lifecycle assumptions. The `renewal.csv` stub it emits is blank — the lifecycle skill populates it.
- It does not write to ZIPs. It writes loose CSV files. The lifecycle skill reads ZIPs or folders; the Trakk Assets importer reads a CSV directly.
