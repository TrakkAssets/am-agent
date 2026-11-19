#!/usr/bin/env node
/**
 * asset-register profile <file1> [file2 ...]
 *
 * Profiles each CSV file: row count, columns, inferred type, unique count,
 * % blank, sample values, candidate key columns, cross-file FK candidates,
 * and hierarchy candidates.
 */

import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { parseCsv } from './csv-utils.mjs'

const SAMPLE_N = 5
const NUMERIC_RE = /^-?\d+(\.\d+)?$/
const DATE_RE = /^\d{4}(-\d{2}(-\d{2})?)?$|^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/
const ID_MAX_LEN = 40

function inferType(values) {
  const nonBlank = values.filter(v => v !== '')
  if (!nonBlank.length) return 'blank'
  const numericFrac = nonBlank.filter(v => NUMERIC_RE.test(v)).length / nonBlank.length
  if (numericFrac > 0.85) return 'numeric'
  const dateFrac = nonBlank.filter(v => DATE_RE.test(v)).length / nonBlank.length
  if (dateFrac > 0.60) return 'date'
  const isIdCandidate = nonBlank.every(v => v.length <= ID_MAX_LEN && !/\s{2,}/.test(v))
  const uniqueFrac = new Set(nonBlank).size / nonBlank.length
  if (uniqueFrac > 0.95 && isIdCandidate) return 'identifier'
  return 'text'
}

function profileFile(filePath) {
  let raw
  try { raw = readFileSync(filePath, 'utf8') }
  catch (e) { return { error: `Cannot read ${filePath}: ${e.message}` } }

  const rows = parseCsv(raw)
  if (!rows.length) return { file: basename(filePath), rowCount: 0, columns: [] }

  const cols = Object.keys(rows[0])
  const colStats = cols.map(col => {
    const values = rows.map(r => r[col] ?? '')
    const nonBlank = values.filter(v => v !== '')
    const unique = new Set(nonBlank)
    const type = inferType(values)
    const sample = [...unique].slice(0, SAMPLE_N)
    return {
      name: col,
      type,
      rowCount: values.length,
      blankPct: ((values.length - nonBlank.length) / values.length * 100).toFixed(1) + '%',
      uniqueCount: unique.size,
      uniquePct: nonBlank.length ? (unique.size / nonBlank.length * 100).toFixed(1) + '%' : '—',
      sample,
    }
  })

  const keyCandidates = colStats
    .filter(c => c.type === 'identifier' || (c.uniquePct === '100.0%' && c.uniqueCount === rows.length))
    .map(c => c.name)

  const hierarchyCandidates = colStats
    .filter(c => c.type === 'text' && c.uniqueCount >= 2 && c.uniqueCount <= Math.min(50, rows.length * 0.1))
    .sort((a, b) => a.uniqueCount - b.uniqueCount)
    .map(c => ({ name: c.name, uniqueCount: c.uniqueCount }))

  return {
    file: basename(filePath),
    rowCount: rows.length,
    columns: colStats,
    keyCandidates,
    hierarchyCandidates,
    _rows: rows,
    _path: filePath,
  }
}

function findCrossFileFKCandidates(profiles) {
  const candidates = []
  for (let i = 0; i < profiles.length; i++) {
    for (let j = 0; j < profiles.length; j++) {
      if (i === j) continue
      const src = profiles[i]
      const tgt = profiles[j]
      if (!src._rows || !tgt._rows) continue
      for (const keyCol of tgt.keyCandidates) {
        const keyVals = new Set(tgt._rows.map(r => r[keyCol]).filter(v => v))
        for (const srcCol of src.columns) {
          if (srcCol.type !== 'identifier' && srcCol.type !== 'text') continue
          const srcVals = src._rows.map(r => r[srcCol.name]).filter(v => v)
          if (!srcVals.length) continue
          const matchFrac = srcVals.filter(v => keyVals.has(v)).length / srcVals.length
          if (matchFrac > 0.70) {
            candidates.push({
              fromFile: src.file,
              fromColumn: srcCol.name,
              toFile: tgt.file,
              toColumn: keyCol,
              matchPct: (matchFrac * 100).toFixed(1) + '%',
            })
          }
        }
      }
    }
  }
  return candidates
}

function printProfile(profile) {
  if (profile.error) { console.log(profile.error); return }
  console.log(`\n=== ${profile.file} (${profile.rowCount} rows) ===`)
  console.log('\nColumns:')
  for (const c of profile.columns) {
    console.log(`  ${c.name.padEnd(28)} ${c.type.padEnd(12)} unique=${c.uniqueCount} (${c.uniquePct}) blank=${c.blankPct}`)
    console.log(`    samples: ${c.sample.join(' | ')}`)
  }
  if (profile.keyCandidates.length) {
    console.log(`\nKey candidates: ${profile.keyCandidates.join(', ')}`)
  } else {
    console.log('\nKey candidates: none detected')
  }
  if (profile.hierarchyCandidates.length) {
    console.log('\nHierarchy candidates (potential parent levels, lowest cardinality first):')
    for (const h of profile.hierarchyCandidates) {
      console.log(`  ${h.name} (${h.uniqueCount} unique values)`)
    }
  }
}

const files = process.argv.slice(2)
if (!files.length) {
  console.error('Usage: node scripts/profile.mjs <file1> [file2 ...]')
  process.exit(1)
}

const profiles = files.map(f => profileFile(f))
profiles.forEach(printProfile)

const fkCandidates = findCrossFileFKCandidates(profiles)
if (fkCandidates.length) {
  console.log('\n=== Cross-file FK candidates ===')
  for (const fk of fkCandidates) {
    console.log(`  ${fk.fromFile}.${fk.fromColumn} → ${fk.toFile}.${fk.toColumn}  (${fk.matchPct} match)`)
  }
}
