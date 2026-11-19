#!/usr/bin/env node
/**
 * asset-register validate <draft-dir> [--json] [--schema assetSchema.csv] [--schema-json schema.json]
 *
 * Validates assets.csv (and optionally renewal.csv) in <draft-dir>.
 * Emits findings with stable IDs (A01-A12. Exit code 1 if any errors.
 *
 * --schema assetSchema.csv    Two-column type label→key bridge. Enables A08.
 * --schema-json schema.json   Full merged-schema JSON (exportMergedJSON format).
 *                             Enables A08 (types) and A12 (unknown attribute keys).
 *                             When both are supplied, schema.json takes precedence for
 *                             type validation.
 */

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { parseCsv } from './csv-utils.mjs'

const REQUIRED_COLS = ['assetID', 'parent', 'type', 'label']

function validate(draftDir, opts = {}) {
  const { json = false, schemaPath = null } = opts
  const findings = []
  const add = (id, sev, msg, detail) => findings.push({ id, severity: sev, message: msg, detail: detail || null })

  // Load assets.csv
  const assetsPath = join(draftDir, 'assets.csv')
  if (!existsSync(assetsPath)) {
    add('A04', 'error', 'assets.csv not found in draft directory', assetsPath)
    report(findings, json)
    return findings.some(f => f.severity === 'error') ? 1 : 0
  }

  let assets
  try {
    assets = parseCsv(readFileSync(assetsPath, 'utf8'))
  } catch (e) {
    add('A04', 'error', `Cannot parse assets.csv: ${e.message}`, null)
    report(findings, json)
    return 1
  }

  // A04 — required columns present
  const cols = assets.length ? Object.keys(assets[0]) : []
  for (const req of REQUIRED_COLS) {
    if (!cols.includes(req)) add('A04', 'error', `Required column missing: ${req}`, `Found: ${cols.join(', ')}`)
  }
  if (findings.some(f => f.id === 'A04')) {
    report(findings, json)
    return 1
  }

  // A01 — duplicate assetIDs
  const idCounts = {}
  for (const r of assets) { idCounts[r.assetID] = (idCounts[r.assetID] || 0) + 1 }
  const dups = Object.entries(idCounts).filter(([, c]) => c > 1).map(([id]) => id)
  if (dups.length) add('A01', 'error', `Duplicate assetID values: ${dups.slice(0, 10).join(', ')}${dups.length > 10 ? ' …' : ''}`, `${dups.length} duplicate(s)`)

  // A05 — blank type
  const blankType = assets.filter(r => !r.type).map(r => r.assetID)
  if (blankType.length) add('A05', 'error', `type is blank on ${blankType.length} asset(s): ${blankType.slice(0, 5).join(', ')}`, null)

  // A02 — parent FK integrity
  const allIds = new Set(assets.map(r => r.assetID))
  const orphans = assets.filter(r => r.parent && !allIds.has(r.parent))
  if (orphans.length) {
    const examples = orphans.slice(0, 5).map(r => `${r.assetID} → ${r.parent}`).join('; ')
    add('A02', 'error', `parent references unknown assetID on ${orphans.length} asset(s)`, examples)
  }

  // A03 — cycle detection
  const parentOf = {}
  for (const r of assets) { if (r.parent) parentOf[r.assetID] = r.parent }
  const cycleIds = []
  for (const r of assets) {
    let cur = r.assetID
    const seen = new Set()
    while (parentOf[cur]) {
      if (seen.has(cur)) { cycleIds.push(r.assetID); break }
      seen.add(cur); cur = parentOf[cur]
    }
  }
  if (cycleIds.length) {
    add('A03', 'error', `Hierarchy cycle detected involving ${[...new Set(cycleIds)].length} asset(s)`, [...new Set(cycleIds)].slice(0, 5).join(', '))
  }

  // A06 — ds_inst missing with no ancestor fallback
  const dsInstOf = {}
  for (const r of assets) { if (r.ds_inst) dsInstOf[r.assetID] = true }
  const missingDs = assets.filter(r => {
    if (r.ds_inst) return false
    let cur = r.parent
    while (cur) {
      if (dsInstOf[cur]) return false
      cur = parentOf[cur]
    }
    return true
  })
  if (missingDs.length) {
    add('A06', 'warn', `ds_inst blank with no ancestor fallback on ${missingDs.length} asset(s)`, missingDs.slice(0, 5).map(r => r.assetID).join(', '))
  }

  // A07 — both c_inst and replace_cost blank, no ancestor
  const costOf = {}
  for (const r of assets) { if (r.c_inst || r.replace_cost) costOf[r.assetID] = true }
  const noCost = assets.filter(r => {
    if (r.c_inst || r.replace_cost) return false
    let cur = r.parent
    while (cur) {
      if (costOf[cur]) return false
      cur = parentOf[cur]
    }
    return true
  })
  if (noCost.length) {
    add('A07', 'warn', `c_inst and replace_cost both blank on ${noCost.length} asset(s) — RESIDUAL costing method will produce zero cost (unit-rate and manual-estimate methods work without it)`, noCost.slice(0, 5).map(r => r.assetID).join(', '))
  }

  // A08 — type not in schema (assetSchema.csv or schema.json when supplied)
  // Load schema.json if present (takes precedence over assetSchema.csv for type validation)
  let schemaJson = null
  if (opts.schemaJsonPath && existsSync(opts.schemaJsonPath)) {
    try { schemaJson = JSON.parse(readFileSync(opts.schemaJsonPath, 'utf8')) }
    catch { schemaJson = null }
  }

  if (schemaJson) {
    // Extract type names from merged-schema JSON (types array or object)
    const typesList = Array.isArray(schemaJson.types) ? schemaJson.types : Object.values(schemaJson.types ?? {})
    const schemaTypeNames = new Set(typesList.map(t => (t.name || '').toLowerCase()).filter(Boolean))
    const badType = assets.filter(r => r.type && !schemaTypeNames.has(r.type.toLowerCase()))
    if (badType.length) {
      const examples = [...new Set(badType.map(r => r.type))].slice(0, 5)
      add('A08', 'warn', `type value not found in schema.json types on ${badType.length} asset(s)`, examples.join(', '))
    }

    // A12 — column in assets.csv not in known fields and not a schema attribute key
    const KNOWN_FIELDS = new Set(['assetID', 'parent', 'type', 'label', 'ds_inst', 'c_inst', 'replace_cost', 'man', 'mod', 'ser', 'opstat', 'crit', 'description'])
    const attrList = Array.isArray(schemaJson.attributes) ? schemaJson.attributes : Object.values(schemaJson.attributes ?? {})
    const schemaAttrKeys = new Set(attrList.map(a => (a.key || a.name || '').toLowerCase()).filter(Boolean))
    const extraCols = cols.filter(c => !KNOWN_FIELDS.has(c) && !schemaAttrKeys.has(c.toLowerCase()))
    if (extraCols.length) {
      add('A12', 'warn', `${extraCols.length} column(s) in assets.csv are not known Trakk fields or schema attribute keys — the app importer will stamp these onto assets verbatim as attributes.<key>`, extraCols.join(', '))
    }
  } else if (schemaPath && existsSync(schemaPath)) {
    let schema
    try { schema = parseCsv(readFileSync(schemaPath, 'utf8')) }
    catch { schema = [] }
    const schemaNames = new Set(schema.map(r => (r.type_name || r.name || '').toLowerCase()))
    const badType = assets.filter(r => r.type && !schemaNames.has(r.type.toLowerCase()))
    if (badType.length) {
      const examples = [...new Set(badType.map(r => r.type))].slice(0, 5)
      add('A08', 'warn', `type value not found in assetSchema.csv on ${badType.length} asset(s)`, examples.join(', '))
    }
  }

  // A09 — no renewal.csv row (info, requires renewal.csv to be present)
  const renewalPath = join(draftDir, 'renewal.csv')
  if (existsSync(renewalPath)) {
    let renewal
    try { renewal = parseCsv(readFileSync(renewalPath, 'utf8')) }
    catch { renewal = [] }
    const withPlan = new Set(renewal.map(r => r.asset_id))
    const withoutPlan = assets.filter(r => !withPlan.has(r.assetID))
    if (withoutPlan.length) {
      add('A09', 'info', `${withoutPlan.length} asset(s) have no entry in renewal.csv`, withoutPlan.slice(0, 5).map(r => r.assetID).join(', '))
    }
  }

  // A10 — over-population signal (>50% same ds_inst in a sibling group)
  const byParent = {}
  for (const r of assets) {
    const p = r.parent || '__root__'
    byParent[p] = byParent[p] || []
    byParent[p].push(r)
  }
  for (const [p, group] of Object.entries(byParent)) {
    if (group.length < 3) continue
    const freq = {}
    for (const r of group) { if (r.ds_inst) freq[r.ds_inst] = (freq[r.ds_inst] || 0) + 1 }
    for (const [val, count] of Object.entries(freq)) {
      if (count / group.length > 0.5) {
        add('A10', 'info', `${count}/${group.length} siblings under parent "${p}" share ds_inst=${val} — confirm these are individually measured dates, not a placeholder`, null)
        break
      }
    }
  }

  // A11 — root assets present (info)
  const roots = assets.filter(r => !r.parent)
  if (roots.length) {
    add('A11', 'info', `${roots.length} root asset(s) with blank parent`, roots.slice(0, 5).map(r => r.assetID).join(', '))
  }

  report(findings, json)
  return findings.some(f => f.severity === 'error') ? 1 : 0
}

function report(findings, json) {
  if (json) {
    console.log(JSON.stringify(findings, null, 2))
    return
  }
  if (!findings.length) {
    console.log('✓ No findings.')
    return
  }
  const order = { error: 0, warn: 1, info: 2 }
  findings.sort((a, b) => order[a.severity] - order[b.severity])
  for (const f of findings) {
    const icon = f.severity === 'error' ? '✗' : f.severity === 'warn' ? '⚠' : 'ℹ'
    console.log(`${icon} [${f.id}] ${f.severity.toUpperCase()}: ${f.message}`)
    if (f.detail) console.log(`    ${f.detail}`)
  }
  const errors = findings.filter(f => f.severity === 'error').length
  const warns = findings.filter(f => f.severity === 'warn').length
  const infos = findings.filter(f => f.severity === 'info').length
  console.log(`\n${errors} error(s)  ${warns} warning(s)  ${infos} info(s)`)
}

const args = process.argv.slice(2)
if (!args.length || args[0] === '--help') {
  console.error('Usage: node scripts/validate.mjs <draft-dir> [--json] [--schema assetSchema.csv] [--schema-json schema.json]')
  process.exit(1)
}
const draftDir = args[0]
const jsonMode = args.includes('--json')
const schemaIdx = args.indexOf('--schema')
const schemaPath = schemaIdx !== -1 ? args[schemaIdx + 1] : null
const schemaJsonIdx = args.indexOf('--schema-json')
const schemaJsonPath = schemaJsonIdx !== -1 ? args[schemaJsonIdx + 1] : null
process.exit(validate(draftDir, { json: jsonMode, schemaPath, schemaJsonPath }))
