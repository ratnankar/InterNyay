// Claim value brackets used to find the right consumer commission (District / State / National)
export const CONSUMER_PECUNIARY_OPTIONS = [
  { id: 'upto1',    label: 'Up to ₹1 Crore' },
  { id: '1to10',    label: 'Above ₹1 Crore up to ₹10 Crore' },
  { id: 'above10',  label: 'Above ₹10 Crore' },
]

// Claim amount options used to pick the right Debt Recovery Tribunal
export const DRT_AMOUNT_OPTIONS = [
  { id: 'lt100',  label: 'Less than one hundred crore rupees' },
  { id: 'gte100', label: 'One hundred crore rupees and above' },
]
