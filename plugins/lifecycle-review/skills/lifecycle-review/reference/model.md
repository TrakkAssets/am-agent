# The Trakk Lifecycle costing model — concepts

Trakk Lifecycle turns an asset register into a long-run spending forecast. For every asset
it answers three questions — *how long does it last*, *what does replacing it cost*, and
*what maintenance happens in between* — then projects those answers forward over a horizon
and sums them by period.

This page is the **concept guide**: what each term means and how to read a result. It is
deliberately not the specification. The exact resolution order, the cost formulas, the
unit-rate matching algorithm and the escalation arithmetic are in the **extended
reference**, which ships alongside the model engine rather than in this repo —
see [Extended reference](#extended-reference) at the bottom.

## Expected life

How many years an asset is expected to last before renewal. It can be set on the asset's
own plan, or inherited from the asset's **renewal class**, or fall back to a design life
recorded against the asset.

An asset with no expected life anywhere is **red**: it generates no renewal cycle and
contributes nothing to the forecast. That matters because a model can look complete and
still forecast too little.

## Install year

Renewal years are derived from when the asset went in, taken from its installation date.
An asset with no date of its own **inherits one from the nearest ancestor** in the
hierarchy, and failing that the engine uses a fixed fallback year.

A consequence worth knowing: an asset with no date can still show a plausible replacement
year, because the date came from its parent. `asset <id>` reports when a date was
inherited and from where.

## Replacement year

The first replacement, either set explicitly on the plan or derived from the install year
and the expected life. Renewals then repeat every expected life out to the end of the
horizon.

**Overdue** means the replacement year is already in the past. The engine flags these and
leaves that first missed renewal **out of the forecast** — later cycles still appear. The
backlog is real spend that shows up in no forecast total, which is why the review reports
it separately and why it is usually the most important number on the page.

## The three cost methods

Set per asset. The default is RESIDUAL.

| Method | What it means | Confidence |
|---|---|---|
| **RESIDUAL** | Replacement is priced from what the asset cost to install, less a residual percentage, escalated to today. The weakest method — it assumes replacement costs what installation cost. Caps plan status at yellow | Derived |
| **MANUAL** | A figure the user entered, escalated from the year they costed it | Whatever they recorded |
| **UNIT** | Priced from the organisation's unit-rate library, multiplied by a measured quantity taken from an asset attribute | From the matched rate |

### How UNIT matching behaves

An asset's type selects candidate rates; those candidates are narrowed by matching
attributes on the asset. A user can also **pin** a specific rate, which bypasses matching.

Matching can fail in several distinct ways, and the review names which one:

| Reason | Meaning |
|---|---|
| `no-type` / `no-type-code` | The asset has no type, or its type reaches no renewal class |
| `no-rates` | No rates exist for that class |
| `missing-attributes` | The asset lacks an attribute the rates key on |
| `no-match` | Rates exist but none match this asset |
| `ambiguous` | Several rates match equally well — the rate definitions need narrowing |

A pinned rate that has since been deleted **degrades quietly**: the asset is flagged and
falls back to automatic matching, which can produce a different number than the user
intended. The review reports this (`R06`).

## Cost indexing

Every cost is held in the dollars of the year it was captured and escalated to today using
a cost-index series. The series is part of the organisation's configuration and travels
with an export.

The practical consequence: **without a cost index, costs cannot be escalated at all**, so
the engine refuses to run rather than reporting unescalated or zero figures. The review
says so plainly (`X01`, `E05`).

## Planned maintenance

Each schedule has a label, a first year, a recurrence interval, a cost and the year that
cost was captured. Schedules repeat within each renewal cycle, re-based at every
replacement — so maintenance stays in phase with renewals rather than drifting away from
them.

Two behaviours to watch for, both reported:

- A schedule with **no first year generates nothing at all** (`N04`). It sits in the data
  and appears in no number.
- A schedule with **no interval** fires once per renewal cycle. Correct for a one-off, a
  mistake if it was meant to recur (`N05`).

## Annualised lifecycle cost

A per-year figure combining renewal and the maintenance falling within one expected life.
It is honestly a $/yr rate and composes by addition across a register, so it can be summed
by class or by site.

Without an expected life the renewal share is zero and only maintenance contributes.

## Parent assets and rollup

An asset hierarchy needs a rule for whether a parent is costed, its children, or both.
That is `model_level`, falling back to an organisation-wide default:

| Mode | Meaning |
|---|---|
| `exclude` | The parent is not costed — all cost is assumed to sit in its children. **The default** |
| `include` | Parent and children are both costed independently |
| `rollup` | The parent absorbs its whole subtree; every descendant is excluded |

Resolution is hierarchical: if **any** ancestor is in `rollup`, the asset is excluded no
matter what it asked for. The review reports which rule fired per asset
(`parent-default`, `rolled-up`, `include-overridden`, `leaf-excluded` and so on), so an
asset missing from a total can always be explained.

A large `parent-default` count is normal. A large `rolled-up` count means the forecast is
coarse-grained by design, not broken.

## Plan status

| Status | Meaning |
|---|---|
| `green` | A confident, component-level or user-entered cost, and a known life |
| `yellow` | Computes, but the cost is residual, or confidence is below good |
| `red` | No expected life, or no cost. **Contributes nothing** |
| `rollup` | Cost sits on a parent, or the asset is excluded |

**Status is tree-aware.** A parent takes the **worst status among its descendants**, which
is what the app shows and what an export records. So a parent reported as `rollup` on its
own terms still reads `red` if anything beneath it is broken — which is the point, since
that is the level a portfolio gets read at.

## The forecast

Over a window (30 years from the current year by default), events from included assets are
collected, binned into periods, and summed. The review reports the grand total, the annual
average, how many assets are excluded, and how many carry cost flags.

An event outside the window is **dropped, not clamped** — so a horizon shorter than an
asset's expected life shows no renewal for it at all. Widen the horizon (`--years`) if a
total looks suspiciously small.

## Extended reference

The precise resolution orders, cost formulas, matching algorithm, escalation arithmetic and
event-projection rules are documented in **`reference/model-extended.md`**, which ships
with the model engine rather than in this repo.

After installing the engine, find it next to the scripts:

```bash
node bin/lifecycle.mjs doctor      # prints the resolved engine directory
# the extended reference is at <that directory>/reference/model-extended.md
```

Read it when you need to explain *why* a specific number came out as it did, rather than
what the number means.
