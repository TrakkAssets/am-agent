# Finding catalogue

Findings from `validate` carry stable IDs so two runs can be diffed. Severity:
- **error** — the register will not load or will silently corrupt data
- **warn** — the register loads but assets underperform in a lifecycle forecast
- **info** — worth a human's attention; not a defect

| ID | Severity | Trigger | Fix |
|---|---|---|---|
| `A01` | error | Duplicate `assetID` values | Each asset must have a unique ID. Rename duplicates or merge rows if they represent the same asset |
| `A02` | error | `parent` refers to an `assetID` not in the register | Add the missing parent asset, or correct the reference |
| `A03` | error | Hierarchy cycle detected | A node is its own ancestor. Reparent one node to break the cycle |
| `A04` | error | A required column is missing (`assetID`, `parent`, `type`, or `label`) | Add the column. `parent` may be blank for root assets, but the column must exist |
| `A05` | error | `type` is blank on an asset | Every asset needs a type. Use a type name that matches the Trakk Asset Type screen |
| `A06` | warn | `ds_inst` is blank and no ancestor supplies it | This asset will go red in a lifecycle forecast. Set `ds_inst` on this asset or on a parent above it |
| `A07` | warn | `c_inst` and `replace_cost` are both blank | The RESIDUAL costing method will produce zero cost. UNIT and MANUAL methods work without `c_inst`. If RESIDUAL is the intent, the value needs to be sourced from the client's cost records |
| `A08` | warn | `type` value does not appear in `assetSchema.csv` or `schema.json` types | The lifecycle skill will not resolve this type to a renewal class. Check the spelling against the Trakk Asset Type screen. Only fires when `--schema` or `--schema-json` is supplied |
| `A09` | info | An asset has no entry in `renewal.csv` | It will be modelled on renewal-class defaults only. That may be intentional |
| `A10` | info | >50% of assets in a group share a single `ds_inst` value | They may genuinely share a commissioning date, or the source may have applied one date across a group it did not really know. Worth asking which — a real per-asset date is better data. **Do not** read this as a prompt to roll the value up to a parent |
| `A11` | info | Root assets present (assets with blank `parent`) | Expected. Confirm these are intentional top-level assets, not rows with a missing parent reference |
| `A12` | warn | Column in `assets.csv` is not a known Trakk field or a schema attribute key | The app importer will stamp this column onto every asset as `attributes.<name>` — an unvalidated attribute. Remove the column from the emitted file, or confirm it maps to a schema attribute key and name it correctly. Only fires when `--schema-json` is supplied |
