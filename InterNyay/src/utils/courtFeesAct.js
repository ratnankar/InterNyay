// Court fee rules. The built-in defaults below follow the Court Fees Act, 1870 (Act 7 of 1870), as printed in the central text.
// The admin can change every case type's fee rule, fee scale and note in Admin -> Fee Calculator; the saved copy is read from the backend and
// replaces these defaults. Everything the calculator needs is worked out from one config object (see buildFeeRules).
//
// Basis: Schedule I (ad valorem fees, Art. 1 and the Table of Rates), Schedule II (fixed fees), and the valuation rules in
// ss. 7 and 8 of the Act. Old currency is converted at 16 annas = Rs 1 (so 1 anna = Rs 0.0625) and shown to the nearest paisa.
// The Act itself says rates in the States / U.T.s are as per their own State Amendments, so the ad valorem scale is picked per State /
// U.T. (see `jurisdictions` below): Delhi & Chandigarh, Haryana and Uttar Pradesh & Uttarakhand use the tables in stateFeeTables.js, and
// other States use the Central Act scale. Confirm the local rate before filing.
// Consumer complaints and Labour Court matters are not governed by this Act; they are kept here as separate, clearly-labelled entries.

import { DELHI_SCALE, HARYANA_SCALE, UTTAR_PRADESH_SCALE } from './stateFeeTables'

const LAKH = 100000
const CRORE = 100 * LAKH

// Case types shown as buttons in Step 1 (each has one fee rule in the config)
export const COURT_TYPES = [
  { value: 'civil',    label: 'Civil Suit',          icon: 'scale',   desc: 'Money, possession, probate, execution' },
  { value: 'criminal', label: 'Criminal Case',       icon: 'lock',    desc: 'Complaints, bail, CRL.M.C., appeals'   },
  { value: 'family',   label: 'Family / Matrimonial',icon: 'family',  desc: 'Marriage, divorce, maintenance'         },
  { value: 'labour',   label: 'Labour Court',        icon: 'factory', desc: 'Industrial disputes'                   },
  { value: 'consumer', label: 'Consumer Commission', icon: 'cart',    desc: 'District / State / National'           },
  { value: 'writ',     label: 'Writ / High Court',   icon: 'scroll',  desc: 'Art. 226, High Court petitions'        },
  { value: 'appeal',   label: 'Appeal',              icon: 'bank',    desc: 'From decree or other orders'           },
]

// Fee types a case type can have, as shown in the admin editor
export const FEE_KINDS = [
  { value: 'adv',   label: 'Ad valorem (scale of the chosen State)' },
  { value: 'half',  label: 'Half of the ad valorem fee' },
  { value: 'fixed', label: 'Fixed amount' },
  { value: 'scale', label: 'Own fee scale' },
]

// Fee scales a case type of type "Own fee scale" can use, and what each is called in the admin editor
export const SCALE_NAMES = {
  adValorem:        'Ad valorem – Central Act (Sch. I, Art. 1)',
  adValoremDelhi:   'Ad valorem – Delhi & Chandigarh',
  adValoremHaryana: 'Ad valorem – Haryana',
  adValoremUP:      'Ad valorem – Uttar Pradesh & Uttarakhand',
  consumer:   'Consumer complaint (Rule 7, CP (CDRC) Rules, 2020)',
  probate:    'Probate / letters of administration (Sch. I, Art. 11)',
  succession: 'Succession certificate (Sch. I, Art. 12)',
}

// A fee scale is a list of value bands, each running from the previous band's "upTo" (0 for the first) to its own "upTo"
// (null = no upper limit, last band only). A band charges:
//   percent                    -> that % of the whole value
//   stepSize + stepFee         -> base + stepFee for every block of stepSize (or part of one) above the band's start
//   otherwise                  -> the flat amount in base
// maxFee, when set, caps the fee of the scale (the Act caps a plaint at Rs 3,000).
export const DEFAULT_CONFIG = {
  caseTypes: [
    { caseType:"civil", label:"Civil suit (plaint)", kind:"adv", ref:"Sch. I,  Art. 1; s. 7", valueLabel:"Value of the suit as stated in the plaint (₹)" },
    { caseType:"appeal", label:"Appeal from a decree", kind:"adv", ref:"Sch. I,  Art. 1", valueLabel:"Value of the subject matter of the appeal (₹)" },
    { caseType:"criminal", label:"Criminal application / complaint", kind:"fixed", ref:"Sch. II,  Art. 1(b) (8 annas)", amount:0.5 },
    { caseType:"family", label:"Family / matrimonial petition", kind:"fixed", ref:"Sch. II,  Art. 17(vi),  applied by analogy", amount:10 },
    { caseType:"writ", label:"Writ petition (Art. 226)", kind:"fixed", ref:"Sch. II,  Art. 1(d)", amount:2 },
    { caseType:"consumer", label:"Consumer complaint", kind:"scale", ref:"Rule 7,  CP (CDRC) Rules,  2020 (not under the 1870 Act)", scale:"consumer", valueLabel:"Value of goods / services paid as consideration (₹)" },
    { caseType:"labour", label:"Industrial dispute / claim", kind:"fixed", ref:"Industrial Disputes Act – no court fee (not under the 1870 Act)", amount:0 },
  ],
  // States / Union Territories shown in the calculator. Each one charges the ad valorem scale named in `scale`; the first one is the default.
  jurisdictions: [
    { key: 'delhi', label: 'Delhi & Chandigarh', scale: 'adValoremDelhi', notes: [
      'Delhi & Chandigarh table. Above ₹4,00,000 the fee increases by ₹48.80 for every ₹5,000 or part thereof.',
      'The source table prints ₹4,442.60 for ₹2,15,000; the series pattern gives ₹4,442.40, which is used here. Please verify against the official table.',
    ] },
    { key: 'haryana', label: 'Haryana', scale: 'adValoremHaryana', notes: [
      'Haryana table. Above ₹75,00,000 the fee increases by ₹25 for every ₹5,000 or part thereof.',
      'The source carries an editor\'s note that the Haryana Gazette notification of 10-9-2009 printed ₹500 in the table, probably a typing error. Please verify with the registry.',
    ] },
    { key: 'up', label: 'Uttar Pradesh & Uttarakhand', scale: 'adValoremUP', notes: [
      'Uttar Pradesh & Uttarakhand table. Above ₹30,000 the fee increases by ₹37.50 for every ₹500 or part thereof.',
      'The source table prints ₹2,180.00 for ₹23,500; the series pattern gives ₹2,170.00, which is used here. Please verify against the official table.',
    ] },
    { key: 'central', label: 'Other States (Central Act, 1870)', scale: 'adValorem', notes: [
      'Central Act scale (Sch. I, Art. 1), for States without a table here. The ad valorem fee on a plaint or memorandum of appeal is capped at ₹3,000 (any value above ₹4,10,000 pays the maximum).',
      'The Act says rates in each State / Union Territory are as per its own State Amendments. Check the local schedule for your court\'s State.',
    ] },
  ],
  scales: {
    adValorem: { maxFee: 3000, slabs: [
      { upTo: 100,   base: 0,     stepSize: 5,    stepFee: 0.375 },   // 6 annas per Rs 5 (or part), up to Rs 100
      { upTo: 1000,  base: 7.5,   stepSize: 10,   stepFee: 0.75 },    // 12 annas per Rs 10 over Rs 100
      { upTo: 5000,  base: 75,    stepSize: 100,  stepFee: 5 },       // Rs 5 per Rs 100 over Rs 1,000
      { upTo: 10000, base: 275,   stepSize: 250,  stepFee: 10 },      // Rs 10 per Rs 250 over Rs 5,000
      { upTo: 20000, base: 475,   stepSize: 500,  stepFee: 15 },      // Rs 15 per Rs 500 over Rs 10,000
      { upTo: 30000, base: 775,   stepSize: 1000, stepFee: 20 },      // Rs 20 per Rs 1,000 over Rs 20,000
      { upTo: 50000, base: 975,   stepSize: 2000, stepFee: 20 },      // Rs 20 per Rs 2,000 over Rs 30,000
      { upTo: null,  base: 1175,  stepSize: 5000, stepFee: 25 },      // Rs 25 per Rs 5,000 over Rs 50,000
    ] },
    // State tables (see stateFeeTables.js): the fee of each listed value, and a fixed amount per block above the last one. No cap.
    adValoremDelhi:   DELHI_SCALE,
    adValoremHaryana: HARYANA_SCALE,
    adValoremUP:      UTTAR_PRADESH_SCALE,
    // Consumer complaint fee (Rule 7, CP (CDRC) Rules, 2020), by value of goods or services paid. Not under the Court Fees Act.
    consumer: { slabs: [
      { upTo: 5 * LAKH,   base: 0 },
      { upTo: 10 * LAKH,  base: 200 },
      { upTo: 20 * LAKH,  base: 400 },
      { upTo: 50 * LAKH,  base: 1000 },
      { upTo: 1 * CRORE,  base: 2000 },
      { upTo: 2 * CRORE,  base: 2500 },
      { upTo: 4 * CRORE,  base: 3000 },
      { upTo: 6 * CRORE,  base: 4000 },
      { upTo: 8 * CRORE,  base: 5000 },
      { upTo: 10 * CRORE, base: 6000 },
      { upTo: null,       base: 7500 },
    ] },
    // Probate / letters of administration (Sch. I, Art. 11): % on the whole value; up to Rs 1,000 no fee (s. 19(viii))
    probate: { slabs: [
      { upTo: 1000,  base: 0 },
      { upTo: 10000, percent: 2 },
      { upTo: 50000, percent: 2.5 },
      { upTo: null,  percent: 3 },
    ] },
    // Succession certificate (Sch. I, Art. 12): 2% on the debt or security specified in the certificate
    succession: { slabs: [
      { upTo: null, percent: 2 },
    ] },
  },
  // Forum for a consumer complaint by value (Consumer Protection (Jurisdiction of the District Commission, the State Commission
  // and the National Commission) Rules, 2021)
  forums: [
    { upTo: 50 * LAKH, label: 'District Consumer Commission' },
    { upTo: 2 * CRORE, label: 'State Consumer Commission' },
    { upTo: null,      label: 'National Consumer Commission (NCDRC)' },
  ],
  // Quick Reference rows: mode 'adv' = the ad valorem fee on `value`; mode 'caseType' = the fee of that case type on `value`
  quickRef: [
    { label: 'Civil suit (₹1 lakh)', mode: 'adv', value: 100000 },
    { label: 'Civil suit (₹5 lakh)', mode: 'adv', value: 500000 },
    { label: 'Civil suit (₹10 lakh)', mode: 'adv', value: 1000000 },
    { label: 'Appeal (₹5 lakh)', mode: 'caseType', caseType: 'appeal', value: 500000 },
    { label: 'Family / matrimonial petition', mode: 'caseType', caseType: 'family' },
    { label: 'Writ / High Court petition', mode: 'caseType', caseType: 'writ' },
    { label: 'Consumer (₹5 lakh)', mode: 'caseType', caseType: 'consumer', value: 500000 },
  ],
  // Notes shown beside the result (a State's own notes, from `jurisdictions`, are shown with them)
  notes: [
    'Ad valorem fees (civil plaints and appeals) follow the State / Union Territory chosen above. Fixed fees (Schedule II) follow the Court Fees Act, 1870; old anna amounts are converted at 16 annas = ₹1 and shown to the nearest paisa.',
    'A State table gives the fee for a claim value up to each amount listed, so a value between two amounts pays the fee of the next amount up.',
    'The claim value is worked out under s. 7 of the Act (for example, maintenance is valued at 10 times one year\'s amount, a mortgage suit at the principal money, a landlord–tenant suit at one year\'s rent). In s. 7(iv) suits the plaintiff states the value.',
    'If a suit covers two or more distinct subjects, the fees for each are added together (s. 17). If the Court refers the parties to settlement under s. 89 CPC, the full plaint fee is refunded (s. 16).',
    'Some documents carry no fee (s. 19), such as written statements called for after the first hearing, and probate or letters of administration where the property does not exceed ₹1,000.',
    'Consumer complaints and Labour Court matters are not governed by this Act. Consumer fees follow Rule 7 of the CP (CDRC) Rules, 2020.',
    'The fee shown is the standard fee for the chosen case type. Other applications, High Court criminal petitions and appeals, reviews, caveats and probate carry their own fees under Schedules I and II.',
    'Always confirm with the court registry before filing.',
  ],
}

// Round to paise so floating point never leaks into the display
const money = n => Math.round(n * 100 + 1e-6) / 100

// Number of whole blocks of `size` (or part of one) in the excess `over`
const steps = (over, size) => Math.ceil(over / size - 1e-9)

// Fee of one scale (see DEFAULT_CONFIG) for a value
function scaleFee(scale, value) {
  const v = Number(value)
  const slabs = scale?.slabs
  if (!(v > 0) || !slabs?.length) return 0
  let from = 0
  let band = slabs[slabs.length - 1]
  for (const s of slabs) {
    if (s.upTo === null || s.upTo === undefined || v <= Number(s.upTo)) { band = s; break }
    from = Number(s.upTo)
  }
  const base = Number(band.base) || 0
  let fee
  if (Number(band.percent) > 0)      fee = v * Number(band.percent) / 100
  else if (Number(band.stepSize) > 0) fee = base + steps(v - from, Number(band.stepSize)) * (Number(band.stepFee) || 0)
  else                                fee = base
  const cap = Number(scale.maxFee)
  return cap > 0 ? Math.min(fee, cap) : fee
}

// Everything the calculator needs, worked out from a config (the admin's saved one, or DEFAULT_CONFIG)
export function buildFeeRules(config) {
  const cfg = config && Array.isArray(config.caseTypes) && config.scales ? config : DEFAULT_CONFIG
  const scales = { ...DEFAULT_CONFIG.scales, ...cfg.scales }

  const rulesByType = {}
  cfg.caseTypes.forEach(r => { if (r && r.caseType && !rulesByType[r.caseType]) rulesByType[r.caseType] = r })
  const ruleOf = caseType => rulesByType[caseType] || null

  // States / Union Territories, each with the ad valorem scale its courts charge. The first one is the default. Rules saved before
  // States existed have none, so the built-in list is used for them.
  const listed = Array.isArray(cfg.jurisdictions) ? cfg.jurisdictions.filter(j => j && j.key && scales[j.scale]) : []
  const jurisdictions = listed.length ? listed : DEFAULT_CONFIG.jurisdictions
  const jurisdictionOf = key => jurisdictions.find(j => j.key === key) || jurisdictions[0]

  // Ad valorem fee for a value in a State (the default State when none is given)
  const adValoremExact = (v, jKey) => scaleFee(scales[jurisdictionOf(jKey).scale], v)
  const adValorem = (v, jKey) => money(adValoremExact(v, jKey))

  // Fee of any one scale by its name, for the admin preview
  const feeOfScale = (name, v) => money(scaleFee(scales[name], v))

  // Whether a case type needs a claim value entered
  const matterNeedsValue = m => m.kind === 'adv' || m.kind === 'half' || (m.kind === 'scale' && !!m.valueLabel)

  // Whether the State matters for a case type: only the ad valorem fees differ between States (fixed fees, consumer and the rest do not)
  const usesJurisdiction = m => !!m && (m.kind === 'adv' || m.kind === 'half')

  // The value the fee is actually charged on (e.g. maintenance is valued at 10 x one year's amount, s. 7(ii))
  const chargeableValue = (m, value) => (Number(value) || 0) * (Number(m?.mult) || 1)

  // Fee for a case type's rule
  function calcFee(m, value, jKey) {
    if (!m) return 0
    const v = chargeableValue(m, value)
    if (m.kind === 'adv')   return adValorem(v, jKey)
    if (m.kind === 'half')  return money(adValoremExact(v, jKey) / 2)   // one-half of the ad valorem scale (Sch. I, Art. 2 / 5)
    if (m.kind === 'scale') return money(scaleFee(scales[m.scale], v))
    return money(Number(m.amount) || 0)
  }

  // Forum for a consumer complaint by value
  function consumerForum(value) {
    const list = cfg.forums?.length ? cfg.forums : DEFAULT_CONFIG.forums
    const hit = list.find(f => f.upTo === null || f.upTo === undefined || value <= Number(f.upTo))
    return (hit || list[list.length - 1]).label
  }

  // Quick Reference rows as [label, fee text] for a State; a row whose case type has no rule is left out
  const quickRefFor = jKey => (Array.isArray(cfg.quickRef) ? cfg.quickRef : DEFAULT_CONFIG.quickRef).flatMap(r => {
    const value = Number(r.value) || 0
    let fee
    if (r.mode === 'caseType') {
      const m = ruleOf(r.caseType)
      if (!m) return []
      fee = calcFee(m, value, jKey)
    } else {
      fee = adValorem(value, jKey)
    }
    const text = fee === 0 ? 'Nil' : '₹' + fee.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(fee) ? 0 : 2, maximumFractionDigits: 2 })
    return [[r.label, text]]
  })

  return {
    quickRef: quickRefFor(), quickRefFor, ruleOf, jurisdictions, jurisdictionOf, usesJurisdiction,
    adValorem, feeOfScale, matterNeedsValue, chargeableValue, calcFee, consumerForum,
    notes: Array.isArray(cfg.notes) ? cfg.notes : DEFAULT_CONFIG.notes,
  }
}
