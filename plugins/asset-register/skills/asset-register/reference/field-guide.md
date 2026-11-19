# Field guide

Common mistakes and disambiguation for each `assets.csv` field.

## assetID

The primary key. Must be unique within the org. Trakk uses it as a stable reference — once an asset is live, its ID cannot change without breaking history, renewal plans, and report links.

**Choosing IDs.** If the client has an existing stable identifier (a GIS ID, a maintenance-system number, a tag number on a plate), use it. If not, the simplest approach is a sequential number padded to 6 digits (`000001`, `000002`, ...). Avoid special characters, spaces, and anything that looks like a date.

**Synthetic parent nodes.** When you create parent nodes that did not exist in the source data (e.g. a "Site" row to sit above all buildings), mint an ID in a recognisable namespace (`SITE_001`, `SYS_001`) so it is obvious which IDs are native and which were created for the hierarchy.

## parent

FK to another asset's `assetID`. Blank for root assets (assets with no parent). The column must exist even if all values are blank.

**Common mistake.** Pointing `parent` at a label or a name from the source data rather than an `assetID`. The app resolves `parent` by ID, not by name. If your source data has a "Site Name" column that you want to use as the hierarchy, you must first create Site rows with their own `assetID` values and then set `parent` to those IDs.

## type

**A display label, not a code.** The value in `assets.type` must match a name on the Trakk Asset Type screen exactly (case-insensitive). "Pump - Centrifugal" is correct; "pump_centrifugal" or "PUMP" are not.

**How to check.** Supply `assetSchema.csv` from the app's Asset Type Mapping screen (Config → Asset Type Mapping → Export). `validate` runs finding `A08` against it. Without `assetSchema.csv`, type values go in as-is and are only checked at import time.

**What happens with an unrecognised type.** The asset loads, but its type resolves to no renewal class. It will have no default expected life, and the UNIT costing method will not match a rate for it. The asset goes yellow or red in a lifecycle forecast.

## label

The display name shown in the register and reports. Usually maps directly to the client's "asset name" or "description" column.

**Common mistake.** Using a code as the label. Labels appear in the register UI, in reports, and in the lifecycle skill's output. A label like "P-001-A" tells a user nothing without a lookup. Prefer "Pump — Duty (Station 2)" or similar.

## ds_inst

Install date. The lifecycle engine extracts the year from whatever format is supplied — `2010`, `2010-01-01`, `01/01/2010` all resolve to 2010. Only the year is used.

**Inherited.** A blank `ds_inst` is resolved from the nearest ancestor at compute time. See `reference/inheritance.md`.

**Common mistake.** Using a service date or a last-replaced date instead of the original install date. The engine uses `ds_inst` as the start of the first asset cycle. If you use a 2019 replacement date for an asset installed in 1990, the engine will start the renewal cycle from 2019 and miss the asset's real age.

**When the install date is unknown.** Use the site construction date (often knowable) for the whole site via inheritance. Flag assets where this is a guess — `plan_comment` in `renewal.csv` is the place to note it.

## c_inst

Capital cost at install, in dollars at the install date. The RESIDUAL costing method escalates this to today's dollars and applies the residual percentage to compute replacement cost.

**Inherited.** A blank `c_inst` is resolved from the nearest ancestor. This is intentional — a system node with a known total cost can supply it to all its components via inheritance.

**Common mistake.** Using a current replacement cost here instead of the original install cost. Use `replace_cost` for a known current cost.

## replace_cost

A known current (or recent) replacement cost in today's dollars. Used when `c_inst` is not known or when the MANUAL cost method is selected. The RESIDUAL method ignores `replace_cost` and uses `c_inst`.

## man, mod, ser

Manufacturer, model, and serial number. Free text. Not required for lifecycle, but valuable for procurement and insurance.

## opstat

Operational status. Free text — examples: "in service", "standby", "decommissioned". Not constrained to a list.

## crit

Criticality. Free text — examples: "high", "medium", "low". Not constrained to a list, but be consistent within a register so it can be filtered.

## description

Free text. The purpose, context, or notes about the asset. Does not appear in the lifecycle forecast but is useful for asset managers reading the register.
