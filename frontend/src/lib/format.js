export function formatNumber(n, digits = 2) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—'
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: digits })
}

export function prettyBytes(n) {
  if (n >= 1024 * 1024) return `${formatNumber(n / (1024 * 1024), 1)} MiB`
  if (n >= 1024) return `${formatNumber(n / 1024, 1)} KiB`
  return `${n} B`
}
