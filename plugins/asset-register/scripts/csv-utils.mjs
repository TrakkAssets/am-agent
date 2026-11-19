/**
 * Minimal CSV parser/serialiser. Zero dependencies, Node 18+.
 * Handles quoted fields, embedded commas and newlines.
 */

export function parseCsv(text) {
  const rows = []
  let col = ''
  let row = []
  let inQuote = false
  const n = text.length
  for (let i = 0; i < n; i++) {
    const ch = text[i]
    if (inQuote) {
      if (ch === '"') {
        if (text[i + 1] === '"') { col += '"'; i++ }
        else inQuote = false
      } else {
        col += ch
      }
    } else if (ch === '"') {
      inQuote = true
    } else if (ch === ',') {
      row.push(col); col = ''
    } else if (ch === '\n') {
      row.push(col); col = ''
      rows.push(row); row = []
    } else if (ch !== '\r') {
      col += ch
    }
  }
  if (col || row.length) { row.push(col); rows.push(row) }
  if (!rows.length) return []
  const headers = rows[0]
  const result = []
  for (let r = 1; r < rows.length; r++) {
    if (rows[r].length === 1 && rows[r][0] === '') continue
    const obj = {}
    headers.forEach((h, i) => { obj[h.trim()] = (rows[r][i] ?? '').trim() })
    result.push(obj)
  }
  return result
}

export function serialiseCsv(rows, columns) {
  if (!rows.length) return columns.join(',') + '\n'
  const quoteIfNeeded = v => {
    const s = v == null ? '' : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? '"' + s.replace(/"/g, '""') + '"'
      : s
  }
  const lines = [columns.join(',')]
  for (const row of rows) {
    lines.push(columns.map(c => quoteIfNeeded(row[c] ?? '')).join(','))
  }
  return lines.join('\n') + '\n'
}

export function headersOf(text) {
  const first = text.split('\n')[0]
  return parseCsv(first + '\n' + 'dummy')[0] ? Object.keys(parseCsv(first + '\n' + '\n')[0] ?? {}) : []
}
