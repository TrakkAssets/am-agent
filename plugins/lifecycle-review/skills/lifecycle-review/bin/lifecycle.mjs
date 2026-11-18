#!/usr/bin/env node
// lifecycle.mjs — the launcher. This file ships IN the skill; the model code does not.
//
// The skill is installable from a public repo (Claude marketplace) and carries only
// instructions and domain documentation. The engine, the CLI and the checks live
// separately — in the monorepo at `apps/lifecycle/offline-scripts/`, delivered to a
// customer as a directory. This resolves that directory and hands over to it.
//
// Until there is download infrastructure, "delivery" is: put the scripts somewhere and
// point at them. Resolution order, first hit wins:
//
//   1. --scripts <dir>                     explicit, wins over everything
//   2. $TRAKK_LIFECYCLE_SCRIPTS            per-shell or per-machine
//   3. ./trakk-lifecycle.json              per-project: { "scripts": "<dir>" }
//   4. ~/.trakk/lifecycle/scripts/         the conventional install location
//   5. ../../scripts/ relative to here     the dev checkout, where both halves are together
//
// Run `node bin/lifecycle.mjs doctor` to see exactly which of those fired and why the
// others did not. That command works even with no scripts installed — it is the thing to
// run first when a deployment is not behaving.

import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ENV_VAR = 'TRAKK_LIFECYCLE_SCRIPTS'
const PROJECT_FILE = 'trakk-lifecycle.json'

/** A scripts directory is only usable if it has both the CLI and the engine. */
const REQUIRED = ['lifecycle.mjs', join('lib', 'engine.mjs'), join('lib', 'schema.mjs')]

function inspect(dir, origin, note) {
  // A candidate with no directory is still reported — "why didn't my env var work?"
  // is exactly the question doctor exists to answer.
  if (!dir) return { origin, path: null, exists: false, missing: [], usable: false, note }
  const path = resolve(dir)
  const missing = REQUIRED.filter((f) => !existsSync(join(path, f)))
  return {
    origin,
    path,
    exists: existsSync(path) && statSync(path).isDirectory(),
    missing,
    usable: existsSync(path) && missing.length === 0,
  }
}

function fromProjectFile() {
  const p = resolve(process.cwd(), PROJECT_FILE)
  if (!existsSync(p)) return { dir: null, note: `no ${PROJECT_FILE} in ${process.cwd()}` }
  try {
    const cfg = JSON.parse(readFileSync(p, 'utf8'))
    if (!cfg.scripts) return { dir: null, note: `${PROJECT_FILE} has no "scripts" key` }
    // A relative path in the file is relative to the file, not the cwd.
    return { dir: resolve(dirname(p), cfg.scripts), note: `from ${p}` }
  } catch (err) {
    return { dir: null, note: `${PROJECT_FILE} is not valid JSON: ${err.message}` }
  }
}

/** @returns {{ candidates: object[], chosen: object|null }} */
export function resolveScripts(explicit) {
  const project = fromProjectFile()
  const candidates = [
    inspect(explicit, '--scripts flag', 'not given'),
    inspect(process.env[ENV_VAR], `$${ENV_VAR}`, 'not set'),
    inspect(project.dir, `./${PROJECT_FILE}`, project.note),
    inspect(join(homedir(), '.trakk', 'lifecycle', 'scripts'), 'conventional install', '~/.trakk/lifecycle/scripts'),
    inspect(resolve(HERE, '..', '..', '..', 'scripts'), 'dev checkout', 'alongside the skill'),
  ]
  return { candidates, chosen: candidates.find((c) => c.usable) ?? null }
}

function doctor({ candidates, chosen }) {
  const L = ['trakk-lifecycle — where are the model scripts?', '']
  for (const c of candidates) {
    const mark = c.usable ? 'USE ' : c.exists ? 'PART' : '  . '
    L.push(`  [${mark}] ${c.origin}`)
    if (c.path) {
      L.push(`         ${c.path}`)
      if (c.usable) L.push('         has the model scripts')
      else if (c.exists) L.push(`         directory exists but is missing: ${c.missing.join(', ')}`)
      else L.push('         directory does not exist')
    } else {
      L.push(`         ${c.note}`)
    }
  }
  L.push('')
  if (chosen) {
    L.push(`Resolved: ${chosen.path}`)
    L.push(`Via:      ${chosen.origin}`)
    // The extended reference ships with the engine; the skill only has the concept guide.
    const ext = join(chosen.path, 'reference', 'model-extended.md')
    L.push(`Extended reference: ${existsSync(ext) ? ext : '(not present in this install)'}`)
  } else {
    L.push('NOT RESOLVED — no candidate directory has the model scripts.')
    L.push('')
    L.push('The skill carries the instructions and the domain reference; the engine is')
    L.push('delivered separately. To install it for testing, do one of:')
    L.push('')
    L.push(`  export ${ENV_VAR}=/path/to/offline-scripts`)
    L.push(`  echo '{"scripts":"/path/to/offline-scripts"}' > ${PROJECT_FILE}`)
    L.push('  mkdir -p ~/.trakk/lifecycle && cp -r /path/to/offline-scripts ~/.trakk/lifecycle/scripts')
    L.push('')
    L.push('A scripts directory must contain: ' + REQUIRED.join(', '))
  }
  process.stdout.write(L.join('\n') + '\n')
  return chosen ? 0 : 3
}

// --- main -------------------------------------------------------------------

const argv = process.argv.slice(2)

// Pull --scripts out before handing argv on; the CLI does not know this flag.
let explicit = null
const passthrough = []
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--scripts') { explicit = argv[++i]; continue }
  passthrough.push(argv[i])
}

const resolved = resolveScripts(explicit)

if (passthrough[0] === 'doctor' || passthrough[0] === 'where') {
  process.exit(doctor(resolved))
}

if (!resolved.chosen) {
  console.error('error: the lifecycle model scripts are not installed.\n')
  console.error('Run `node bin/lifecycle.mjs doctor` for where it looked and how to install them.')
  process.exit(3)
}

// Rewrite argv so the CLI's own `process.argv.slice(2)` sees exactly its own arguments.
process.argv = [process.argv[0], join(resolved.chosen.path, 'lifecycle.mjs'), ...passthrough]
await import(join(resolved.chosen.path, 'lifecycle.mjs'))
