// Colour used for each case status badge
export const STATUS_COLORS = {
  Pending: '#0B7A75',
  'Decided': '#C62828',
  'Withdrawn': '#6A4C93',
  'On Hold': '#1F5FAF',
}
 
// Fee structures an advocate can choose for a case
export const FEE_TYPES = [
  { value: 'TOTAL',      label: 'One-Time' },
  { value: 'DATEWISE',   label: 'Date Wise' },
]

// Stage-wise fee is kept separate because it is only available in some cases
export const STAGEWISE_FEE_TYPE = { value: 'STAGEWISE', label: 'Stage Wise' }

// Client categories as [value, label] pairs for the client form dropdown
export const CLIENT_TYPES = [
  ['INDIVIDUAL',                 'Individual'],
  ['COMPANY',                    'Company'],
  ['BANK',                       'Bank'],
  ['FINANCIAL INSTITUTE',        'Financial Institute'],
  ['SOCIETY/NGO',                'Society/NGO'],
  ['FOREIGN CLIENT',             'Foreign Client'],
  ['HOSPITAL/MEDICAL INSTITUTE', 'Hospital/Medical Institute'],
  ['ASSOCIATION',                'Association'],
  ['OTHER',                      'Other'],
]

// Optional tags that can be attached to a client
export const CLIENT_LABELS = [
  'Legal Aid', 'Pro Bono', 'Corporate Panel', 'Private',
]

// Tag with special behaviour, so the name is kept in one place
export const CORPORATE_PANEL_LABEL = 'Corporate Panel'

// Statuses that mean the case is over
export const CLOSED_CASE_STATUSES = ['Decided', 'Withdrawn']

// Status and outcome name used when a case is withdrawn
export const WITHDRAWN_STATUS = 'Withdrawn'

export const WITHDRAWN_OUTCOME = 'Withdrawn'

// True if the case is decided or withdrawn
export const isClosedCase = c => CLOSED_CASE_STATUSES.includes(c?.status)

// Statuses the advocate can pick manually from the dropdown
export const CASE_STATUS_OPTIONS = ['Pending', 'On Hold', 'Decided', 'Withdrawn']

// Document types for case documents
export const DOCUMENT_TYPES = [
  'Petition/Complaint/Chargesheet',
  'Written Submission',
  'Replication',
  'Re-Joinder',
  'Bail Application',
  'Bail Reply',
  'Bail Order',
  'Bail Bond',
  'Reply of Application',
  'Income Affidavit',
  'Evidence by way of Affidavit',
  'Ex-Parte Evidence by way of Affidavit',
  'Misc. Application (Type Manually)',
]

// Document types for documents attached to a client
export const CLIENT_DOCUMENT_TYPES = [
  'ID Proof',
  'Address Proof',
  'Vakalatnama',
  'Authority Letter',
  'Agreement / Engagement Letter',
  'Other (Type Manually)',
]

// Whether an evidence file belongs to a client or to a case
export const EVIDENCE_CATEGORIES = [
  'Client',
  'Case',
]

// No restriction on evidence file types (undefined = file picker accepts anything)
export const EVIDENCE_ACCEPT = undefined

// Return memo reasons offered when entering cheque bounce details
export const CHEQUE_BOUNCE_REASONS = [
  'Insufficient Funds',
  'Funds Insufficient',
  'Exceeds Arrangement',
  'Account Closed',
  'Account Blocked / Frozen',
  'Payment Stopped by Drawer',
  "Signature Differs / Mismatch with Bank's Record",
  'Signature Incomplete',
  'Cheque Post Dated',
  'Cheque Stale / Expired',
  'Amount in Words and Figures Differ',
  "Alteration Requires Drawer's Authentication",
  'Not Arranged For (NAF)',
  'Refer to Drawer (RTD)',
  'Account Under Litigation',
]