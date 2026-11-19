#!/usr/bin/env node
/**
 * asset-register apply-mapping <source-file> [source-file2 ...]
 *                               --mapping mapping.json
 *                               -o <draft-dir>
 *
 * Applies a mapping.json rule set to source CSV(s) and writes assets.csv to
 * <draft-dir>. This is the compilation step between column-mapping authorship
 * and validation — the agent authors the rules in conversation, the human
 * confirms, and this script applies them deterministically.
 *
 * Rule shape (reuses the DEC-0036 where/set grammar from scenario.mjs):
 *
 *   {
 *     "rules": [
 *       { "where": "*",             "set": { "assetID": "{AssetId}", "type": "{AssetType} - {AssetSubType}", "label": "{AssetDescription}" } },
 *       { "where": { "Unit": "m3" },"set": { "vol_m3": "{Size}" } },
 *       { "where": { "Unit": "mm" },"set": { "dia_mm": "{Size}" } },
 *       { "where": { "Unit": "m" }, "set": { "len_m":  "{Size}" } }
 *     ]
 *   }
 *
 * where:
 *   - `where` is an object of { sourceColumn: matchValue } or "*" to match all rows.
 *     Match semantics: exact string (case-insensitive), array matches any member,
 *     "*" matches everything, "" matches blank, "!" matches non-blank.
 *   - `set` maps output column names to template strings. "{ColumnName}" is replaced
 *     with the value from the source row's ColumnName column.
 *   - Rules apply in order: later rules can refine or overwrite earlier ones.
 *
 * Output: draft-dir/assets.csv (column union of all set targets from all rules, in
 * the order they appear across rules). Per-rule audit is printed to stdout.
 *
 * The emit step writes only the canonical Trakk columns in the right order.
 * apply-mapping writes ALL columns that any rule set, so validate can check them.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseCsv, serialiseCsv } from './csv-utils.mjs'

function matchOne(actual, want) {
  if (want === '*' || want === undefined || want === null) return true
  if (Array.isArray(want)) return want.some(w => matchOne(actual, w))
  const s = String(want).trim()
  const a = actual === null || actual === undefined ? '' : String(actual).trim()
  if (s === '') return a === ''
  if (s === '!') return a !== ''
  const cmp = s.match(/^(<=|>=|<|>|!=)\s*(.+)$/)
  if (cmp) {
    const [, op, rhs] = cmp
    const lv = parseFloat(a), rv = parseFloat(rhs)
    if (!isNaN(lv) && !isNaN(rv)) {
      if (op === '<') return lv < rv
      if (op === '<=') return lv <= rv
      if (op === '>') return lv > rv
      if (op === '>=') return lv >= rv
      return lv !== rv
    }
    if (op === '!=') return a.toLowerCase() !== rhs.trim().toLowerCase()
    return false
  }
  return a.toLowerCase() === s.toLowerCase()
}

function matchRow(row, where) {
  if (where === '*' || !where || Object.keys(where).length === 0) return true
  return Object.entries(where).every(([col, want]) => matchOne(row[col] ?? '', want))
}

function expandTemplate(template, row) {
  if (typeof template !== 'string') return String(template ?? '')
  return template.replace(/\{([^}]+)\}/g, (_, col) => row[col] ?? '')
}

function applyMapping(sourceFiles, mappingPath, outDir) {
  let mapping
  try {
    mapping = JSON.parse(readFileSync(mappingPath, 'utf8'))
  } catch (e) {
    console.error(`Cannot read mapping.json: ${e.message}`)
    return 1
  }
  const rules = mapping.rules ?? []
  if (!rules.length) {
    console.error('mapping.json has no rules')
    return 1
  }

  // Load all source files and merge rows
  const allRows = []
  for (const f of sourceFiles) {
    let rows
    try { rows = parseCsv(readFileSync(f, 'utf8')) }
    catch (e) { console.error(`Cannot read ${f}: ${e.message}`); return 1 }
    allRows.push(...rows)
  }

  if (!allRows.length) {
    console.error('No rows found in source files')
    return 1
  }

  // Discover output column order from rule set order
  const outputCols = []
  const colSet = new Set()
  for (const rule of rules) {
    for (const col of Object.keys(rule.set ?? {})) {
      if (!colSet.has(col)) { outputCols.push(col); colSet.add(col) }
    }
  }

  // Apply rules per row
  const auditCounts = rules.map(() => 0)
  const outputRows = allRows.map(srcRow => {
    const out = {}
    for (const [i, rule] of rules.entries()) {
      if (!matchRow(srcRow, rule.where)) continue
      auditCounts[i]++
      for (const [col, template] of Object.entries(rule.set ?? {})) {
        out[col] = expandTemplate(template, srcRow)
      }
    }
    return out
  })

  // Write to draft dir
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, 'assets.csv')
  writeFileSync(outPath, serialiseCsv(outputRows, outputCols))

  // Audit report
  console.log(`✓ assets.csv (${outputRows.length} rows) → ${outPath}`)
  console.log('\nRule audit:')
  for (const [i, rule] of rules.entries()) {
    const whereDesc = rule.where === '*' || !rule.where ? '(all rows)' : JSON.stringify(rule.where)
    const setDesc = Object.keys(rule.set ?? {}).join(', ')
    console.log(`  Rule ${i + 1}: where ${whereDesc} → set ${setDesc}  [${auditCounts[i]} rows matched]`)
  }

  const unmatched = outputRows.filter(r => Object.keys(r).length === 0).length
  if (unmatched) console.log(`\n⚠ ${unmatched} source row(s) matched no rules — they will appear as empty rows`)
  return 0
}

const args = process.argv.slice(2)
const mappingIdx = args.indexOf('--mapping')
const outIdx = args.indexOf('-o')
if (!args.length || mappingIdx < 0 || outIdx < 0) {
  console.error(`Usage: node scripts/apply-mapping.mjs <source-file> [source-file2 ...] --mapping mapping.json -o <draft-dir>`)
  process.exit(1)
}
const mappingPath = args[mappingIdx + 1]
const outDir = args[outIdx + 1]
const sourceFiles = args.filter((_, i) => i !== mappingIdx && i !== mappingIdx + 1 && i !== outIdx && i !== outIdx + 1)
process.exit(applyMapping(sourceFiles, mappingPath, outDir))
