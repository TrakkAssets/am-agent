# Finding catalogue

Every finding carries a stable id, so two reviews of the same model can be
diffed. Severity means:

- **error** — the model is wrong, or will not re-import cleanly. Numbers are affected.
- **warn** — the model loads and computes, but a result is unreliable.
- **info** — worth a human's attention; not a defect.

## X — reference tables (the cost engine's inputs)

| id | Severity | Trigger | Fix |
|---|---|---|---|
| `X01` | error / warn | A reference table was not supplied | `costIndex.csv` and `renewalClasses.csv` are errors — the engine cannot run without them. `assetSchema.csv` is a warning: the engine runs, but class resolution will be thin. A missing **legacy** table is not reported at all |
| `X02` | error | **No** asset type resolves to a renewal class | The register stores display labels and `renewalClasses.types` holds keys. Supply `assetSchema.csv` (`type_key,type_name`), or `--asset-schema <csv>`. Until then every asset falls back to its own `exp_life` override or goes red |
| `X03` | warn | *Some* asset types do not resolve | Usually the mapping table is older than the register. Re-export it. The finding names the unresolved types |
| `X04` | warn | No type maps to a unit-rate `class_code` | `renewalClasses.code` is empty and no type key matches a rate's `class_code`, so UNIT auto-matching is dead — only a pinned `preferred_rate_code` can produce a unit cost |
| `X05` | error | The cost index has no usable current value | Escalation needs a current index value; without one every escalated cost resolves to 0 |
| `X06` | info | `assetSchema.csv` supplied | Good news, not a problem. Types resolve from the export itself, held once per type rather than repeated on every register row. The current shape |
| `X07` | info / warn | No `assetSchema.csv` | Info when something else bridges (the legacy `assetTypeMapping.csv`, or the one-day inline `type_key` shape) — re-export when convenient. **Warn** when nothing bridges at all, in which case see `X02` |
| `X10` | warn | `assetSchema.csv` does not name a type the register uses | The staleness failure this design introduces: the schema travels in its own table, so it can be exported from a different moment than the register. A type the extract does not name resolves to nothing. Re-export both together. A *superset* extract is fine and does not trigger this |
| `X08` | warn | The two type→class stores disagree | Some type keys in use are in no `renewalClasses.types[]`, yet `assetTypeMapping.csv` names a class for them. The Renewal Classes config and the Asset Type Mapping screen have drifted, so the class an asset gets depends on which table you read. The engine reads `types[]` first |
| `X09` | info | Type keys in use are mapped to no class anywhere | A genuine gap in the org's lifecycle config, not an export problem. Those assets get no class default |

## S — structure

| id | Severity | Trigger | Fix |
|---|---|---|---|
| `S01` | error / warn | An expected member is missing from the ZIP | The ZIP was not produced by **Export model (.zip)**, or was edited after export. Re-export |
| `S02` | info | The ZIP holds files the app does not read | Harmless — they are ignored on import. Check nothing was meant to be in them |
| `S03` | error | A member is missing expected columns | The importer reads by column name, so the field imports as absent for every row. Restore the header |
| `S04` | warn | A member has columns the app ignores | PapaParse drops unknown headers silently — any data in them is lost on import |
| `S05` | info | A legacy column name is in use (`unit_code` for `preferred_rate_code`) | Still accepted. The ZIP predates the rename, or came from the WWL converter |
| `S06` | warn / info | A member has a header but no rows | Usually data never entered rather than genuinely empty. Empty `maintenance.csv` is only a note |
| `S07` | error | Duplicate key values | The importer keys on this column, so only the **last** duplicate survives. Earlier rows are discarded without warning. De-duplicate before re-import |
| `S08` | error | A key value contains commas or quotes | The row collapsed into the key column — an unescaped quote upstream swallowed the line. Every other column on that row is empty. Fix the quoting in the source register |

## D — value domains

| id | Severity | Trigger | Consequence |
|---|---|---|---|
| `D01` | error | `renewal.cost_method` outside `RESIDUAL`/`MANUAL`/`UNIT` | Silently falls back to `RESIDUAL` — the costing method changes without a warning |
| `D02` | error | `renewal.model_level` outside `include`/`exclude`/`rollup` | An unrecognised value resolves to `exclude`, dropping the asset from the forecast total |
| `D03` | error | `renewal.confidence` outside `good`/`average`/`poor` | Carried to reports as-is; plan status stays yellow because it is not `good` |
| `D04` | error | `unitRates.confidence` out of domain | Same — the rate's confidence feeds the asset's plan status |
| `D05` | error | `model.status` outside `green`/`yellow`/`red`/`rollup` | `model.csv` was not produced by this version of the engine |
| `D06` | error | `model.excluded_reason` out of domain | Same |

## R — referential integrity

| id | Severity | Trigger | Consequence |
|---|---|---|---|
| `R01` | error | `renewal.asset_id` not in `assets.csv` | The plan describes an asset that is not in the register — either it was deleted after the plan was written, or the tables came from different exports |
| `R02` | error | `maintenance.asset_id` not in `assets.csv` | Same, for PM schedules |
| `R03` | error | `model.assetID` not in `assets.csv` | The forecast ran over a different asset set than the snapshot |
| `R04` | error | `assets.parent` is not an asset | Ancestor resolution stops at the dangling link, so a child that should roll up is costed independently and may be double-counted |
| `R05` | error | The hierarchy contains a cycle | The review will not hang, but inheritance and rollup resolution stop at the cycle and give an arbitrary answer |
| `R06` | error | `preferred_rate_code` / `unit_code` is not in `unitRates.csv` | The asset is flagged and **falls back to attribute auto-matching** — the pinned rate is ignored and the cost may differ from what the user chose |
| `R07` | warn | A unit rate has no `class_code` | It can never be auto-matched. It can still be pinned by code |
| `R08` | warn | An asset has no row in `model.csv` | The export's totals do not cover that asset |

## N — numeric sanity

| id | Severity | Trigger | Consequence |
|---|---|---|---|
| `N01` | error | A numeric column holds a non-number | The value reads as **absent**. A stray `$`, comma or unit silently zeroes a cost |
| `N02` | error | `exp_life` ≤ 0, or `residual_pct` outside 0–100 | A non-positive life makes the asset red. A residual outside 0–100 inverts the residual cost calculation, which can produce a negative replacement cost |
| `N03` | error | A year outside 1900–(this year + 200) | Almost always a typo or a value in the wrong column. The forecast generates events from it regardless |
| `N04` | error | A PM schedule has no `first_yr` | The schedule produces **no events and no annualised cost** while still sitting in the data |
| `N05` | info | A PM schedule has no `interval_yr` | Treated as one-off, firing once per renewal cycle. Correct for a one-off; a mistake if it was meant to recur |
| `N06` | warn | A PM schedule has no `label` | It appears unnamed in the PM calendar |
| `N07` | warn | A rate has supply/install costs but no `rate` | The UNIT method uses the rate field only and does **not** sum the supply and install components. The rate costs 0 and flags every asset it matches |
| `N08` | error | A rate has a `unit_attribute` but no `unit` > 0 | A measured rate needs a unit size greater than zero, so it flags every matching asset with *"unit rate has no unit size"* |

## E — engine consistency

| id | Severity | Trigger | Consequence |
|---|---|---|---|
| `E01` | warn | `model.cost_method` disagrees with `renewal.cost_method` | The plan was edited after the forecast ran — the costs in `model.csv` are stale. Re-export |
| `E02` | warn | An included asset's replacement year is already past | The review marks it overdue and leaves the missed renewal out of the forecast. **This backlog appears in no forecast total** |
| `E03` | warn | An asset has `red` status | No life, or no cost. It is in the forecast contributing zero, so the total understates |
| `E04` | warn | An included asset has no renewal class | No class defaults for life or residual, and unit-rate matching reports `no-type-code`, so UNIT cannot work for it |
| `E05` | info | No cost index was supplied | Maintenance costs are nominal, in the dollars of their `cost_basis_yr`, and the engine cannot run at all. Pass `--price-index <csv>` |
| `E06` | warn | `model.csv` has `renewal_class` blank on every row, but the classes do resolve | A defect in the exporter, not bad data: the column is left blank for a register whose types are display labels. The exported **costs** are unaffected — only the column is. Fixed in app exports from 2026-11 onward |
