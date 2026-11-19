# Parent inheritance in Trakk — what it is, and what it is not

> **Corrected 2026-11-19 by Kelly.** An earlier version of this page presented inheritance
> as a data-entry strategy — "set the value high in the tree, leave it blank below, so the
> register is easier to maintain". **That is wrong and it is the opposite of what you
> should advise.** The text below replaces it.

## Attributes are facts about an asset

An asset's attributes describe **that asset**. Its install date is when *it* was installed.
Its capital cost is what *it* cost. Its manufacturer is who made *it*. These are facts, and
facts do not need maintaining — they were true when recorded and they stay true.

So **data recorded against each asset is good**. More of it is better. A register where
every pump carries its own install date is a *better* register than one where the date sits
on the site and the pumps are blank. Never advise a client to strip values out of child
assets, and never present a populated register as something to simplify.

**The problem this domain actually has is collection, not maintenance.** Getting the facts
out of a consultant's workbook, an old maintenance system, or somebody's head is the hard
part. Once collected, they sit there.

## So what is inheritance for?

It is a **fallback for data you do not have yet**.

When an asset has no value for an attribute, the engine walks up the parent chain and uses
the nearest ancestor's value rather than treating the asset as unknowable. That turns an
incomplete register into one that still produces a usable forecast, instead of a wall of
red assets contributing nothing.

That is a resolution rule, not a recommendation. Read it as: *"a gap here degrades
gracefully"* — not *"leave a gap here on purpose"*.

## How it resolves

A child with a blank attribute gets the nearest ancestor's value **at compute time, not at
import time**. The register stores the blank; the engine reads the ancestor. Nothing is
written to the child.

`resolveInheritedAttr` in the lifecycle engine implements this and is generic by design —
it walks the ancestor chain until it finds a non-blank value, and reports which ancestor
supplied it. The lifecycle skill's `asset <id>` command shows that chain, so you can always
answer "where did this date come from?".

## What this means when you are building a register

- **Capture every fact you can.** If the source data has an install date per asset, keep it
  per asset. Do not roll it up.
- **A gap is a gap, not a design.** When an asset has no install date, say so and say what
  it costs — the forecast will fall back to an ancestor, and the result is approximate.
- **Report what was inherited rather than measured**, so nobody mistakes a fallback for a
  fact. An asset whose date came from its grandparent is less certain than one with its own.
- **Collection is the work.** The useful thing a register-building tool does is help get
  more facts in, and be honest about which values are real and which are inferred.
