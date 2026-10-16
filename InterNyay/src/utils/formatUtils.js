// Formats a number as Indian rupees with lakh/crore grouping, e.g. ₹1,50,000
export function formatCurrency(n) {
  const num = Number(n) || 0
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 0 })
}
