#!/usr/bin/env node
/**
 * asset-register — launcher
 *
 * Usage:
 *   node bin/asset-register.mjs profile <file1> [file2 ...]
 *   node bin/asset-register.mjs validate <draft-dir> [--json] [--schema assetSchema.csv]
 *   node bin/asset-register.mjs emit <draft-dir> -o <outdir>
 */

import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts')

const [,, cmd, ...rest] = process.argv
const COMMANDS = {
  profile: 'profile.mjs',
  'apply-mapping': 'apply-mapping.mjs',
  validate: 'validate.mjs',
  emit: 'emit.mjs',
}

if (!cmd || !COMMANDS[cmd]) {
  console.error(`asset-register — build a Trakk register from BYO spreadsheets

Commands:
  profile        <file1> [file2 ...]             Profile CSV files — columns, types, FK candidates, hierarchy hints
  apply-mapping  <file1> [...] --mapping f.json  Apply mapping.json rules to source CSVs → draft assets.csv
                               -o <draft-dir>
  validate       <draft-dir> [--json]            Validate a draft register in <draft-dir>
  emit           <draft-dir> -o <outdir>         Write Trakk-ready output files

Options (validate):
  --json                                         Emit findings as JSON
  --schema      assetSchema.csv                  Check type values against the app's asset type list (2-column CSV)
  --schema-json schema.json                      Check types and attribute keys against the full merged schema
`)
  process.exit(cmd ? 1 : 0)
}

// Re-exec via dynamic import so the scripts can be standalone too
const scriptPath = join(SCRIPTS, COMMANDS[cmd])
process.argv = [process.argv[0], scriptPath, ...rest]
await import(scriptPath)
