// Topic used for plan change requests sent from My Plan and Choose Plan (must be one of CONTACT_CATEGORIES)
export const CONTACT_CATEGORY_PLANS = 'Plans and billing'

// Topics a user can choose on the Contact Us form; kept in sync with ContactService.CATEGORIES in the backend
export const CONTACT_CATEGORIES = [
  'General enquiry',
  'Technical issue',
  'Account, login or security',
  CONTACT_CATEGORY_PLANS,
  'Associates and team access',
  'Court or directory data correction',
  'WhatsApp reminders and notifications',
  'Feature request',
  'Feedback',
]

// Form limits, kept in sync with the backend validation
export const CONTACT_SUBJECT_MAX = 150
export const CONTACT_MESSAGE_MIN = 10
export const CONTACT_MESSAGE_MAX = 3000

// Photos, videos and PDFs that can be attached to a message; kept in sync with ContactService in the backend
export const CONTACT_ATTACH_MAX = 5
export const CONTACT_ATTACH_MAX_BYTES = 10 * 1024 * 1024
export const CONTACT_ATTACH_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'webm', 'pdf']
export const CONTACT_ATTACH_ACCEPT = CONTACT_ATTACH_EXT.map(e => `.${e}`).join(',')

// File size as "850 KB" or "2.4 MB"
export function formatFileSize(bytes) {
  const n = Number(bytes) || 0
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

// Kind of an attached file from its file name or content type: 'image', 'video' or 'pdf'
export function attachmentKind(name = '', mime = '') {
  const ext = String(name).split('.').pop().toLowerCase()
  if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image'
  if (mime.startsWith('video/') || ['mp4', 'mov', 'webm'].includes(ext)) return 'video'
  return 'pdf'
}

// Display names for the status of a contact message
export const CONTACT_STATUS_LABELS = {
  NEW:      'New',
  READ:     'Read',
  RESOLVED: 'Resolved',
}

// Where the admin's reply to a contact message is delivered, with a hint shown in the reply form
export const REPLY_CHANNELS = [
  { value: 'EMAIL',   label: 'Email only',   hint: "Sent to their account email only. They won't see it under Contact Us." },
  { value: 'ACCOUNT', label: 'Account only', hint: 'Shown under Contact Us in their account. No email is sent.' },
  { value: 'BOTH',    label: 'Both',         hint: 'Shown under Contact Us in their account and sent to their account email.' },
]

// Short labels shown on a reply to indicate how it was delivered
export const REPLY_CHANNEL_TAGS = {
  EMAIL:   'Email only',
  ACCOUNT: 'Account only',
  BOTH:    'Email + account',
}

// Formats a timestamp like "5 Mar 2025, 4:30 pm" (en-IN); shows a dash if the value is missing or invalid
export function formatContactDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

// Legal phrases such as "child support" or "spousal support" must not be mistaken for a request for customer support
const LEGAL_SUPPORT = /\b(child|spousal|family|marital|maintenance)\s+support\b/gi
// Phrases that suggest the user wants to talk to InterNyay support or a human agent
const SUPPORT_PATTERNS = [
  /\b(human|live|real)\s+(agent|person|support|being|representative)\b/,
  /\b(customer|technical|tech|internyay|app)\s+(support|care|service|helpdesk|help desk)\b/,
  /\bsupport\s+(team|agent|desk|number|email|contact|staff|person)\b/,
  /\b(contact|reach|call|email|talk|speak|chat|connect|write)\b.{0,30}\b(support|helpdesk|help desk|agent|representative|human)\b/,
  /\b(need|want|get|require)\b.{0,20}\b(support|helpdesk|help desk|an agent|a human)\b/,
  /\bhelp\s*(&|and)\s*support\b/,
]

// True if a chat message looks like a request for customer support rather than a legal question
export function isSupportRequest(text) {
  const t = String(text || '').toLowerCase().replace(LEGAL_SUPPORT, ' ')
  return SUPPORT_PATTERNS.some(re => re.test(t))
}

// Canned answer shown when the chat assistant detects a support request
export const SUPPORT_REPLY =
  "I'm an AI assistant, so I can't connect you to a person from here. "
  + 'To reach the InterNyay team, use the **Contact Us** page: send your message there, '
  + 'and our reply will appear on that page or be emailed to you.'
