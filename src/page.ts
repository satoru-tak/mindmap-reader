/**
 * Page numbers for reading mode.
 * Accepted: "42", "42-45", "12, 15-18". Only digits, "-" and "," survive.
 */

const toHalfWidth = (s: string) => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))

/** While typing: convert full-width digits / various dashes and drop anything else. */
export function filterPageInput(raw: string): string {
  return toHalfWidth(raw)
    .replace(/[〜~ー－―‐−–—]/g, '-')
    .replace(/[、，,・\s]+/g, ',')
    .replace(/[^0-9,-]/g, '')
}

/**
 * On commit: tidy up the value.
 * - reversed ranges are swapped (45-42 → 42-45) instead of being rejected
 * - "42-42" becomes "42", empty parts are dropped
 */
export function normalizePage(raw: string): string {
  const parts = filterPageInput(raw.replace(/^\s*p\.?/i, ''))
    .split(',')
    .map((part) => {
      const nums = part.split('-').filter(Boolean).map(Number)
      if (!nums.length) return ''
      const lo = Math.min(...nums)
      const hi = Math.max(...nums)
      return lo === hi ? String(lo) : `${lo}-${hi}`
    })
    .filter(Boolean)
  return parts.join(', ')
}
