
// Case nature (Civil/Criminal); older records stored it in "type"
export function caseNatureOf(c) {
  return c?.caseNature || c?.type || ''
}

// One-line label like "Criminal • Bail • Regular Bail", skipping empty parts and duplicates
export function caseTypeLabel(c) {
  const parts = [caseNatureOf(c), c?.reliefSought, c?.caseType].filter(Boolean)

  return parts
    .filter((p, i) => parts.findIndex(q => q.toLowerCase() === p.toLowerCase()) === i)
    .join(' • ')
}
