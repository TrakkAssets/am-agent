# Trakk register format

The minimum deliverable from this skill is `assets.csv`. An optional `renewal.csv` stub and a `trakk-config.yaml` are also emitted.

## assets.csv

One row per asset. Column order matters for the app importer.

| Column | Required to load | Required for lifecycle | Notes |
|---|---|---|---|
| `assetID` | yes | — | Primary key. Unique within the org. Stable — once an asset is in Trakk, changing its ID breaks history |
| `parent` | — | — | FK to another `assetID`. Blank for root assets. The column must exist even if all values are blank |
| `type` | — | — | **Display label** — must match a name on the Trakk Asset Type screen. Not a code or key. The app importer writes this into `attributes.type` verbatim; the RPC `resolveAssetType` accepts key or label |
| `label` | — | — | Display name. The app importer writes this into `attributes.label` verbatim |
| `ds_inst` | — | — | Install date. Year is what matters — `2010`, `2010-01-01` and `01/01/2010` all resolve to 2010. Capture it per asset wherever the source has it. Falls back to an ancestor's value at forecast time only when blank |
| `c_inst` | — | — | Capital cost at install, in dollars at the install date. Input to the RESIDUAL costing method **only** — an asset without it can still be costed by a unit rate or a manual estimate. Blank is a gap to fill, not a design. Falls back to an ancestor's value at forecast time |
| `replace_cost` | — | — | Fallback when `c_inst` is absent. Used for MANUAL method |
| `man` | — | — | Manufacturer |
| `mod` | — | — | Model |
| `ser` | — | — | Serial number |
| `opstat` | — | — | Operational status |
| `crit` | — | — | Criticality |
| `description` | — | — | Free text |

**Extra columns are NOT ignored — they become attributes.** The Trakk Assets importer lower-cases every column name it does not recognise and writes the cell straight into `attributes.<lowercased-column-name>`, with no schema validation, no datatype coercion and no list-value checking. `AssetContacts` becomes `attributes.assetcontacts` on every asset in the file — invisible to the schema UI and carried forever. (`''`, `' '` and `'null'` clear the value rather than skipping it.) `emit` must therefore write **only** intended columns, and `validate` should flag any column that is neither a known field nor a schema-defined attribute key. The canonical statement is `repos/dev/reference/export-contract.md` §3.

## renewal.csv (optional stub)

One row per asset that has a lifecycle plan. The `emit` command writes a stub with `asset_id` populated and all other fields blank. The lifecycle skill fills in the assumptions.

| Column | Notes |
|---|---|
| `asset_id` | FK to `assets.assetID` |
| `model_level` | `include` / `exclude` / `rollup` / blank |
| `exp_life` | Expected life in years. Overrides the renewal-class default |
| `rep_year` | Calendar year. Overrides install year + expected life |
| `residual_pct` | 0–100. RESIDUAL method only |
| `cost_method` | `RESIDUAL` / `MANUAL` / `UNIT` / blank |
| `manual_cost` | $ at `cost_year`. MANUAL method only |
| `cost_year` | Source year for cost escalation |
| `confidence` | `good` / `average` / `poor` / blank |
| `preferred_rate_code` | Pins a unit rate. UNIT method only |
| `plan_comment` | Free text |

## trakk-config.yaml

A metadata stub produced by `emit`. It records the source files and timestamp so the register's provenance is readable when the folder is opened later.

```yaml
app:
  type: asset-register
  generated: 2026-11-19T00:00:00.000Z
  source_files:
    - sites.csv
    - assets.csv
```

## The type namespace

`assets.type` holds a **display label** — "Pipe Fitting - End", "Pump - Centrifugal", etc. — not a schema key. The app stores and displays labels; the schema maps keys to labels.

If the user's source data has codes or abbreviations, the mapping step must resolve them to labels before the register is emitted. Supply `assetSchema.csv` from the app's Asset Type Mapping screen (export via Config) and use it as the lookup: `type_key → type_name`. The register must carry the `type_name` column, not the `type_key` column.

If `assetSchema.csv` is supplied, `validate` runs finding `A08` (type value not in schema). Without it, type values go into the register as-is and finding `A08` is skipped.

## How the importers use this

There are two distinct import paths in the Trakk platform. Know which one you are targeting.

### Trakk Assets CSV importer — greenfield and update

**Where:** `app.trakkassets.com` → Assets → Import/Export panel.

**What it does:** reads `assetID` to match rows. For each row:
- If `assetID` matches an existing asset → updates attributes.
- If `assetID` is new → creates the asset (allocates from the org's reserved-ID pool, remaps parents by CSV position using a topological sort, requires a default parent target).

The importer writes **every column except `assetID`, `parent`, `latitude`, and `longitude`** straight into `attributes.<column-name>` on the asset — verbatim, with no schema validation, no datatype coercion, and no list-value checking. `type` and `label` are not special here; they land in `attributes.type` and `attributes.label`. The `emit` command therefore writes only intentional columns. Unknown columns that arrive in `assets.csv` will be stamped onto every imported asset as unvalidated attributes.

**The right target for a greenfield register.** When the client has no existing assets in Trakk, this is the path that creates them. The skill's output feeds directly into it.

### Lifecycle app "Import model (.zip)" — merge only

**Where:** Trakk Lifecycle (apps/lifecycle) → Import/Export → Import model (.zip).

**What it does:** merges `assets.csv` attributes into *existing* assets on `assetID` match, writing only the editable subset: `label`, `man`, `mod`, `ser`, `ds_inst`, `opstat`, `crit`, `description`, `c_inst`, `replace_cost`. It never creates an asset and never touches `type` or `parent`. An unknown `assetID` in the CSV is silently skipped.

**Use case:** updating lifecycle-relevant attributes (install dates, costs) on assets that already exist in the register. Not the target for onboarding a new client.

### Schema.json and full validation

When the lifecycle export ZIP carries a `schema.json` (the full merged-schema JSON — `app.type: asset-register`, produced by `exportMergedJSON`), supply it to `validate` with `--schema-json`. This enables finding `A12`: columns in `assets.csv` that are neither known Trakk fields nor schema-defined attribute keys. Without `schema.json`, unknown columns are only flagged when they appear in the emitted file (by the note above).

The `type` column benefits most: with `schema.json`, `validate` can confirm that `type` values match the org's actual type list, not just the two-column `assetSchema.csv` bridge.
