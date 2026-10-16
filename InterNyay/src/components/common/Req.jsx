// Red star for a required field
export default function Req() {
  return <span className="req-star" aria-hidden="true">*</span>
}

// Turns a label ending in " *" into text with a red star, so required fields can be written as plain strings
export function starLabel(label) {
  const text = String(label)
  return /\s\*$/.test(text)
    ? <>{text.replace(/\s\*$/, '')}<Req /></>
    : text
}
