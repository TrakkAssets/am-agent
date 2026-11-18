# The export ZIP format

**Filename:** `lifecycle-model-{orgId}.zip`, DEFLATE-compressed. CSVs are
`\r\n`-terminated with a UTF-8 BOM. Every value is a string on the way in —
nothing is type-coerced at parse time, so `''` and `0` are different.

Produced by **Export model (.zip)** on the Import/Export panel (admin only).

| Member | Direction | Key | Contents |
|---|---|---|---|
| `renewal.csv` | round-trip | `asset_id` | Per-asset renewal assumptions — the user's plan |
| `maintenance.csv` | round-trip | `asset_id` (many) | Planned-maintenance schedules, flattened |
| `unitRates.csv` | round-trip | `code` | The org's unit-rate library |
| `assets.csv` | round-trip* | `assetID` | Asset register snapshot |
| `model.csv` | **export only** | `assetID` | The engine's computed results |

\* `assets.csv` is re-imported only when the org has `allowDirectEdits`; it is
skipped otherwise, and even then only the editable attribute subset is written
back.

The ZIP does **not** carry the renewal classes, the asset-type mapping, the cost
index, or the org's parent-mode default. Those are separate per-screen CSV
exports — and the first three are exactly what the cost engine needs, so without
them a forecast cannot be recomputed. See **Reference tables** at the end.

## renewal.csv

One row per asset that has a plan — typically far fewer rows than the register.
An absent row means the asset is modelled entirely on class defaults.

| Column | Values | Notes |
|---|---|---|
| `asset_id` | — | FK to `assets.assetID` |
| `model_level` | `include` \| `exclude` \| `rollup` \| blank | Blank falls through to the org default, then `exclude`. Anything unrecognised → `exclude` |
| `exp_life` | years | Overrides the renewal-class default |
| `rep_year` | calendar year | Overrides install year + expected life |
| `residual_pct` | 0–100 | RESIDUAL only. Overrides the class default, then 0 |
| `cost_method` | `RESIDUAL` \| `MANUAL` \| `UNIT` \| blank | Blank or unrecognised → `RESIDUAL` |
| `manual_cost` | $ | MANUAL only |
| `cost_year` | calendar year | Source year for indexing; defaults to install year |
| `confidence` | `good` \| `average` \| `poor` \| blank | Caps plan status at yellow unless `good` |
| `preferred_rate_code` | FK to `unitRates.code` | Pins a rate, bypassing auto-match. **Legacy name: `unit_code`** — still accepted on import |
| `plan_comment` | free text | The user's reasoning. Carried, never computed on |

## maintenance.csv

Many rows per asset — one per schedule.

| Column | Notes |
|---|---|
| `asset_id` | FK to `assets.assetID` |
| `schedule_id` | Stable id within the asset; may be blank |
| `label` | Shown in the PM calendar |
| `description` | Free text |
| `interval_yr` | Blank or ≤ 0 → fires once per renewal cycle |
| `first_yr` | Calendar year in the first cycle. **Blank → the schedule generates nothing** |
| `cost` | $ at `cost_basis_yr` |
| `cost_basis_yr` | Source year for indexing; defaults to install year |
| `cost_source` | Free text provenance |

## unitRates.csv

| Column | Notes |
|---|---|
| `code` | Primary key; also the pin target for `preferred_rate_code` |
| `class_code` | Renewal-class code the rate belongs to. **Blank → can never auto-match** |
| `description` | Free text |
| `att1` / `val1`, `att2` / `val2` | Up to two attribute/value pairs the asset must match. A populated pair with a blank attribute name never matches |
| `unit_attribute` | Asset attribute holding the measure. Blank → quantity 1 |
| `unit` | Size of one unit of that measure. **Needs to be > 0 when `unit_attribute` is set** |
| `supply_cost`, `install_cost` | Informational — **not summed into the cost** |
| `rate` | $ per unit. This is the only field the UNIT method reads |
| `cost_date` | Source year for indexing comes from here |
| `confidence` | `good` \| `average` \| `poor` |
| `location`, `notes` | Free text |

## assets.csv

| Column | Notes |
|---|---|
| `assetID` | Primary key |
| `parent` | FK to another `assetID`; blank for a root |
| `type` | Asset type key; resolves to a renewal class |
| `label` | Display name |
| `ds_inst` | Install date. Year taken from the first four digits. Inherited from the nearest ancestor when blank |
| `c_inst` | Capital cost at install — the RESIDUAL method's input |
| `replace_cost` | Fallback when `c_inst` is absent |
| `man`, `mod`, `ser` | Make / model / serial |
| `opstat`, `crit`, `description` | Operational status, criticality, free text |

Editable on re-import (with `allowDirectEdits`): `label`, `man`, `mod`, `ser`,
`ds_inst`, `opstat`, `crit`, `description`, `c_inst`, `replace_cost`.

## model.csv

Export-only. A snapshot of one forecast run — **it can be stale relative to
`renewal.csv`** if the plan was edited after the forecast was computed. The
review tool cross-checks the two and reports the drift (`E01`).

| Column | Notes |
|---|---|
| `assetID`, `label`, `type`, `parent` | Denormalised from the register |
| `status` | `green` \| `yellow` \| `red` \| `rollup` |
| `cost_method` | The method actually used |
| `renewal_class` | Resolved class name; blank when the type is unmapped |
| `exp_life` | Resolved expected life |
| `replacement_year` | First replacement |
| `replacement_cost` | **Already indexed to today** |
| `confidence` | From the plan or the matched rate |
| `included` | `true` / `false` — whether the asset is in the forecast total |
| `excluded_reason` | Which inclusion rule fired |

## Reference tables

Not in the ZIP. Each is a separate per-screen export. Supply them as extra CSVs
in the same folder as the five members — the loader picks them up by name, and
accepts several spellings (`costIndex.csv`, `cost-index.csv`, `price-index.csv`;
`assetSchema.csv`, `asset-schema.csv`).

### costIndex.csv — `date,civil_index,plant_index`

The escalation series, from the Cost Index screen. Only `plant_index` is used.
`date` may be fractional (`2018.25` = Q2 2018); the engine compares numerically.
The **current index** is the `plant_index` of the newest row — the app keeps the
same number in `modelParams.current_index` (default 1060).

**Required.** Without it no cost can be escalated between years, so the engine
refuses to run rather than report unescalated or zero figures.

### renewalClasses.csv — `name,exp_life,residual_pct,code,types`

The classes, from the Renewal Classes screen.

| Column | Notes |
|---|---|
| `name` | Class name — what `model.csv.renewal_class` holds |
| `exp_life` | Default expected life for assets of this class |
| `residual_pct` | Default residual %, used by the RESIDUAL method |
| `code` | Unit-rate `class_code` to search. **Empty in real exports** — see below |
| `types` | Comma-separated asset **type keys** mapped to this class |

### assetSchema.csv — `type_key,type_name`

A **limited extract of the merged schema**: one row per asset type, pairing the
schema key with its display label.

| Column | Notes |
|---|---|
| `type_key` | The schema type **key** (`pipe_fit_end`) |
| `type_name` | The **display label** (`Pipe Fitting - End`) — what `assets.type` holds |

**This is the table that makes the others work.** The app builds the label → key
map from the platform's `schema.merged`, which an export cannot carry. Without
this bridge the register's labels never match `renewalClasses.types`' keys and
**nothing resolves**.

It deliberately carries **no `renewal_class`**. A renewal class is a lifecycle
fact, not a schema fact, and `renewalClasses.types[]` already owns that relation
— keeping it out leaves exactly one place the type→class relation lives.

Kelly, 2026-11-17: *"a basic assetSchema.csv being a limited extract of the merged
schema aligns better with our architecture and allows future flexibility."*
Expect it to grow (unit attributes, option lists, parent type) without the
existing columns changing.

**Its failure mode is staleness.** Because the schema now travels in its own
table rather than on each asset row, the register and the extract can be
exported from different moments. A register type the extract does not name
resolves to nothing — check `X10`.

### assetTypeMapping.csv — `code,class_name,renewal_class` *(legacy)*

What exports before 2026-11 shipped instead. Still read when `assetSchema.csv` is
absent, so older exports keep working.

| Column | Notes |
|---|---|
| `code` | The type key |
| `class_name` | The display label |
| `renewal_class` | The renewal class name — **duplicates `renewalClasses.types[]`**, which is the drift behind TPD-339 |

A third shape existed for one day: `assets.csv` carrying an inline `type_key`
column (2026-11-17, reverted the same day because it repeated a schema fact on
every register row). Exports from that window still load.

### The two namespace quirks to expect

1. **`renewalClasses.code` is empty** in real exports, so the engine's
   `typeCodeByName` would be empty and UNIT auto-matching dead. In practice
   `unitRates.class_code` holds values from the **asset-type-key** namespace
   (`site_mon`, `bld_shed`), so the identity mapping — type key → itself — is the
   working fallback, and it is what this tool uses. `X04` fires when even that
   finds nothing.
2. **`assets.type` is a label, `renewalClasses.types` are keys.** Zero overlap.
   Any importer, editor or analysis tool has to transpose between the two.
