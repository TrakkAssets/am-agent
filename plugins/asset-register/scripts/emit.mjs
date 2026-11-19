#!/usr/bin/env node
/**
 * asset-register emit <draft-dir> -o <outdir>
 *
 * Writes assets.csv (Trakk column order), renewal.csv stub, and
 * trakk-config.yaml to <outdir>. Refuses if validate finds errors.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { parseCsv, serialiseCsv } from './csv-utils.mjs'

const ASSETS_COLUMNS = ['assetID', 'parent', 'type', 'label', 'ds_inst', 'c_inst', 'replace_cost', 'man', 'mod', 'ser', 'opstat', 'crit', 'description']
const RENEWAL_COLUMNS = ['asset_id', 'model_level', 'exp_life', 'rep_year', 'residual_pct', 'cost_method', 'manual_cost', 'cost_year', 'confidence', 'preferred_rate_code', 'plan_comment']

function validateErrors(draftDir) {
  const assetsPath = join(draftDir, 'assets.csv')
  if (!existsSync(assetsPath)) return ['assets.csv not found']
  const assets = parseCsv(readFileSync(assetsPath, 'utf8'))
  if (!assets.length) return []
  const errors = []
  const cols = Object.keys(assets[0])
  for (const req of ['assetID', 'parent', 'type', 'label']) {
    if (!cols.includes(req)) errors.push(`Required column missing: ${req}`)
  }
  const idCounts = {}
  for (const r of assets) idCounts[r.assetID] = (idCounts[r.assetID] || 0) + 1
  const dups = Object.entries(idCounts).filter(([, c]) => c > 1).map(([id]) => id)
  if (dups.length) errors.push(`Duplicate assetIDs: ${dups.join(', ')}`)
  const allIds = new Set(assets.map(r => r.assetID))
  const orphans = assets.filter(r => r.parent && !allIds.has(r.parent))
  if (orphans.length) errors.push(`Broken parent references on: ${orphans.map(r => r.assetID).join(', ')}`)
  return errors
}

function emit(draftDir, outDir) {
  // Check for errors first
  const errors = validateErrors(draftDir)
  if (errors.length) {
    console.error('✗ Cannot emit — validation errors must be fixed first:')
    for (const e of errors) console.error('  ' + e)
    console.error('\nRun: node scripts/validate.mjs ' + draftDir)
    return 1
  }

  mkdirSync(outDir, { recursive: true })

  // Read source assets
  const assetsPath = join(draftDir, 'assets.csv')
  const assets = parseCsv(readFileSync(assetsPath, 'utf8'))

  // Write assets.csv in canonical column order
  const assetsOut = join(outDir, 'assets.csv')
  writeFileSync(assetsOut, serialiseCsv(assets, ASSETS_COLUMNS))
  console.log(`✓ assets.csv  (${assets.length} rows) → ${assetsOut}`)

  // Write renewal.csv stub
  const renewalPath = join(draftDir, 'renewal.csv')
  const hasRenewal = existsSync(renewalPath)
  let renewalRows = []

  if (hasRenewal) {
    const existing = parseCsv(readFileSync(renewalPath, 'utf8'))
    const existingIds = new Set(existing.map(r => r.asset_id))
    // Carry over any rows already populated; add stubs for missing
    renewalRows = existing.map(r => ({ ...r }))
    for (const a of assets) {
      if (!existingIds.has(a.assetID)) {
        renewalRows.push({ asset_id: a.assetID })
      }
    }
  } else {
    renewalRows = assets.map(a => ({ asset_id: a.assetID }))
  }

  const renewalOut = join(outDir, 'renewal.csv')
  writeFileSync(renewalOut, serialiseCsv(renewalRows, RENEWAL_COLUMNS))
  console.log(`✓ renewal.csv (${renewalRows.length} rows, stub) → ${renewalOut}`)

  // Write trakk-config.yaml
  const sourceFiles = [basename(assetsPath)]
  if (hasRenewal) sourceFiles.push(basename(renewalPath))
  const config = [
    'app:',
    '  type: asset-register',
    `  generated: ${new Date().toISOString()}`,
    '  source_files:',
    ...sourceFiles.map(f => `    - ${f}`),
    '',
  ].join('\n')
  const configOut = join(outDir, 'trakk-config.yaml')
  writeFileSync(configOut, config)
  console.log(`✓ trakk-config.yaml → ${configOut}`)

  // Report any warnings
  const warns = []
  for (const a of assets) {
    if (!a.ds_inst) {
      let cur = a.parent
      let found = false
      const parentOf = {}
      for (const r of assets) { if (r.parent) parentOf[r.assetID] = r.parent }
      while (cur) { if (assets.find(r => r.assetID === cur)?.ds_inst) { found = true; break } cur = parentOf[cur] }
      if (!found) warns.push(a.assetID)
    }
  }
  if (warns.length) {
    console.log(`\n⚠ ${warns.length} asset(s) have no ds_inst and no ancestor fallback — these will go red in a lifecycle forecast.`)
  }

  console.log('\nDone. Import assets.csv into Trakk via Import/Export → Import model (.zip).')
  return 0
}

const args = process.argv.slice(2)
if (args.length < 3 || args[1] !== '-o') {
  console.error('Usage: node scripts/emit.mjs <draft-dir> -o <outdir>')
  process.exit(1)
}
process.exit(emit(args[0], args[2]))
