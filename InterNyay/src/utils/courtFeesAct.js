// Court fee rules. The built-in defaults below follow the Court Fees Act, 1870 (Act 7 of 1870), as printed in the central text.
// The admin can change every filing, fee scale and note in Admin -> Fee Calculator; the saved copy is read from the backend and
// replaces these defaults. Everything the calculator needs is worked out from one config object (see buildFeeRules).
//
// Basis: Schedule I (ad valorem fees, Art. 1 and the Table of Rates), Schedule II (fixed fees), and the valuation rules in
// ss. 7 and 8 of the Act. Old currency is converted at 16 annas = Rs 1 (so 1 anna = Rs 0.0625) and shown to the nearest paisa.
// The Act itself says rates in the States / U.T.s are as per their own State Amendments, so confirm the local rate before filing.
// Consumer complaints and Labour Court matters are not governed by this Act; they are kept here as separate, clearly-labelled entries.

const LAKH = 100000
const CRORE = 100 * LAKH

// Case types shown as buttons in Step 1 (the filings under each come from the config)
export const COURT_TYPES = [
  { value: 'civil',    label: 'Civil Suit',          icon: 'scale',   desc: 'Money, possession, probate, execution' },
  { value: 'criminal', label: 'Criminal Case',       icon: 'lock',    desc: 'Complaints, bail, CRL.M.C., appeals'   },
  { value: 'family',   label: 'Family / Matrimonial',icon: 'family',  desc: 'Marriage, divorce, maintenance'         },
  { value: 'labour',   label: 'Labour Court',        icon: 'factory', desc: 'Industrial disputes'                   },
  { value: 'consumer', label: 'Consumer Commission', icon: 'cart',    desc: 'District / State / National'           },
  { value: 'writ',     label: 'Writ / High Court',   icon: 'scroll',  desc: 'Art. 226, High Court petitions'        },
  { value: 'appeal',   label: 'Appeal',              icon: 'bank',    desc: 'From decree or other orders'           },
]

// Fee types a filing can have, as shown in the admin editor
export const FEE_KINDS = [
  { value: 'adv',   label: 'Ad valorem (Schedule I scale)' },
  { value: 'half',  label: 'Half of the ad valorem fee' },
  { value: 'fixed', label: 'Fixed amount' },
  { value: 'scale', label: 'Own fee scale' },
]

// Fee scales a filing of type "Own fee scale" can use, and what each is called in the admin editor
export const SCALE_NAMES = {
  adValorem:  'Ad valorem (Sch. I, Art. 1)',
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
  filings: [
  { caseType:"civil", key:"suit", label:"Money suit (recovery,  damages,  compensation)", kind:"adv", ref:"Sch. I,  Art. 1; s. 7(i)", valueLabel:"Amount claimed (₹)" },
  { caseType:"civil", key:"maintenance", label:"Suit for maintenance or annuity", kind:"adv", ref:"Sch. I,  Art. 1; s. 7(ii)", mult:10, valueLabel:"Amount claimed per year (₹)" },
  { caseType:"civil", key:"possession", label:"Suit for possession of land,  house or garden", kind:"adv", ref:"Sch. I,  Art. 1; s. 7(v)", valueLabel:"Value of the property under s. 7(v) (₹)" },
  { caseType:"civil", key:"spec_perf", label:"Specific performance of a contract of sale", kind:"adv", ref:"Sch. I,  Art. 1; s. 7(x)(a)", valueLabel:"Amount of the consideration (₹)" },
  { caseType:"civil", key:"mortgage", label:"Suit to redeem or foreclose a mortgage", kind:"adv", ref:"Sch. I,  Art. 1; s. 7(ix)", valueLabel:"Principal money secured by the mortgage (₹)" },
  { caseType:"civil", key:"landlord", label:"Suit between landlord and tenant (rent,  ejectment etc.)", kind:"adv", ref:"Sch. I,  Art. 1; s. 7(xi)", valueLabel:"Annual rent of the premises (₹)" },
  { caseType:"civil", key:"preemption", label:"Suit to enforce a right of pre-emption", kind:"adv", ref:"Sch. I,  Art. 1; s. 7(vi)", valueLabel:"Value of the land / house under s. 7(v) (₹)" },
  { caseType:"civil", key:"partition", label:"Suit for share in joint family property / partition", kind:"adv", ref:"Sch. I,  Art. 1; s. 7(iv)(b)", valueLabel:"Value of the relief as stated in the plaint (₹)" },
  { caseType:"civil", key:"decl_conseq", label:"Declaration with consequential relief", kind:"adv", ref:"Sch. I,  Art. 1; s. 7(iv)(c)", valueLabel:"Value of the relief as stated in the plaint (₹)" },
  { caseType:"civil", key:"injunction", label:"Suit for injunction", kind:"adv", ref:"Sch. I,  Art. 1; s. 7(iv)(d)", valueLabel:"Value of the relief as stated in the plaint (₹)" },
  { caseType:"civil", key:"accounts", label:"Suit for accounts", kind:"adv", ref:"Sch. I,  Art. 1; s. 7(iv)(f)", valueLabel:"Value of the relief as stated in the plaint (₹)" },
  { caseType:"civil", key:"sra_possess", label:"Possession suit under s. 6,  Specific Relief Act", kind:"half", ref:"Sch. I,  Art. 2", valueLabel:"Value of the property (₹)" },
  { caseType:"civil", key:"declaration", label:"Declaration only (no consequential relief)", kind:"fixed", ref:"Sch. II,  Art. 17(iii)", amount:10 },
  { caseType:"civil", key:"no_value", label:"Any other suit where value cannot be estimated in money", kind:"fixed", ref:"Sch. II,  Art. 17(vi)", amount:10 },
  { caseType:"civil", key:"award", label:"Suit to set aside an award", kind:"fixed", ref:"Sch. II,  Art. 17(iv)", amount:10 },
  { caseType:"civil", key:"adoption", label:"Suit to set aside an adoption", kind:"fixed", ref:"Sch. II,  Art. 17(v)", amount:10 },
  { caseType:"civil", key:"occupancy", label:"Suit to establish or disprove right of occupancy", kind:"fixed", ref:"Sch. II,  Art. 5 (8 annas)", amount:0.5 },
  { caseType:"civil", key:"review_90", label:"Review application before 90 days of decree", kind:"half", ref:"Sch. I,  Art. 5", valueLabel:"Value of the original suit / appeal (₹)" },
  { caseType:"civil", key:"review_late", label:"Review application on or after 90 days", kind:"adv", ref:"Sch. I,  Art. 4", valueLabel:"Value of the original suit / appeal (₹)" },
  { caseType:"civil", key:"execution", label:"Execution petition / other application in a civil court", kind:"fixed", ref:"Sch. II,  Art. 1(b) (8 annas)", amount:0.5 },
  { caseType:"civil", key:"pauper", label:"Application for leave to sue as a pauper", kind:"fixed", ref:"Sch. II,  Art. 2 (8 annas)", amount:0.5 },
  { caseType:"civil", key:"caveat", label:"Caveat", kind:"fixed", ref:"Sch. II,  Art. 12", amount:5 },
  { caseType:"civil", key:"probate", label:"Probate / letters of administration", kind:"scale", ref:"Sch. I,  Art. 11", scale:"probate", valueLabel:"Value of the estate (₹)" },
  { caseType:"civil", key:"succession", label:"Succession certificate", kind:"scale", ref:"Sch. I,  Art. 12", scale:"succession", valueLabel:"Value of the debts / securities (₹)" },
  { caseType:"appeal", key:"decree", label:"Appeal from a decree or order having the force of a decree", kind:"adv", ref:"Sch. I,  Art. 1", valueLabel:"Value of the subject matter of the appeal (₹)" },
  { caseType:"appeal", key:"compensation", label:"Appeal against an order on compensation (land acquisition)", kind:"adv", ref:"Sch. I,  Art. 1; s. 8", valueLabel:"Difference between amount awarded and amount claimed (₹)" },
  { caseType:"appeal", key:"other_civil", label:"Appeal not from a decree – civil court other than High Court", kind:"fixed", ref:"Sch. II,  Art. 11(a) (8 annas)", amount:0.5 },
  { caseType:"appeal", key:"other_hc", label:"Appeal not from a decree – High Court", kind:"fixed", ref:"Sch. II,  Art. 11(b)", amount:2 },
  { caseType:"appeal", key:"pauper_dist", label:"Leave to appeal as a pauper – District Court", kind:"fixed", ref:"Sch. II,  Art. 3(a)", amount:1 },
  { caseType:"appeal", key:"pauper_hc", label:"Leave to appeal as a pauper – High Court", kind:"fixed", ref:"Sch. II,  Art. 3(b)", amount:2 },
  { caseType:"family", key:"hma", label:"Petition under Hindu Marriage Act / Special Marriage Act (divorce,  custody etc.)", kind:"fixed", ref:"Sch. II,  Art. 17(vi),  applied by analogy", amount:10 },
  { caseType:"family", key:"divorce_act", label:"Petition under Indian Divorce Act,  1869 (other than s. 44) or appeal under s. 55", kind:"fixed", ref:"Sch. II,  Art. 20", amount:20 },
  { caseType:"family", key:"parsi", label:"Plaint or appeal under Parsi Marriage and Divorce Act", kind:"fixed", ref:"Sch. II,  Art. 21", amount:20 },
  { caseType:"family", key:"convert", label:"Petition under Native Converts Marriage Dissolution Act,  1866", kind:"fixed", ref:"Sch. II,  Art. 14", amount:5 },
  { caseType:"family", key:"maint125", label:"Maintenance application (s. 125 CrPC / s. 144 BNSS)", kind:"fixed", ref:"Sch. II,  Art. 1(b) (8 annas)", amount:0.5 },
  { caseType:"family", key:"misc_app", label:"Miscellaneous / interim application", kind:"fixed", ref:"Sch. II,  Art. 1(b) (8 annas)", amount:0.5 },
  { caseType:"criminal", key:"complaint", label:"Criminal complaint (offence not arrestable without warrant)", kind:"fixed", ref:"Sch. II,  Art. 1(b) (8 annas)", amount:0.5 },
  { caseType:"criminal", key:"app_dist", label:"Application / bail in a criminal court (Magistrate / Sessions)", kind:"fixed", ref:"Sch. II,  Art. 1(b) (8 annas)", amount:0.5 },
  { caseType:"criminal", key:"hc_crl", label:"High Court – bail,  anticipatory bail,  quashing,  revision or other criminal petition", kind:"fixed", ref:"Sch. II,  Art. 1(d)", amount:2 },
  { caseType:"criminal", key:"appeal_dist", label:"Criminal appeal – Sessions Court", kind:"fixed", ref:"Sch. II,  Art. 11(a) (8 annas)", amount:0.5 },
  { caseType:"criminal", key:"appeal_hc", label:"Criminal appeal – High Court", kind:"fixed", ref:"Sch. II,  Art. 11(b)", amount:2 },
  { caseType:"writ", key:"writ", label:"Writ petition (Art. 226 / habeas corpus)", kind:"fixed", ref:"Sch. II,  Art. 1(d)", amount:2 },
  { caseType:"writ", key:"hc_other", label:"Any other petition / application in the High Court", kind:"fixed", ref:"Sch. II,  Art. 1(d)", amount:2 },
  { caseType:"writ", key:"hc_caveat", label:"Caveat in the High Court", kind:"fixed", ref:"Sch. II,  Art. 12", amount:5 },
  { caseType:"consumer", key:"complaint", label:"Consumer complaint (value of goods / services paid)", kind:"scale", ref:"Rule 7,  CP (CDRC) Rules,  2020 (not under the 1870 Act)", scale:"consumer", valueLabel:"Value of goods / services paid as consideration (₹)" },
  { caseType:"labour", key:"claim", label:"Industrial dispute / claim before the Labour Court", kind:"fixed", ref:"Industrial Disputes Act – no court fee (not under the 1870 Act)", amount:0 },
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
  // Quick Reference rows: mode 'adv' = the ad valorem fee on `value`; mode 'filing' = the fee of one filing (caseType + key) on `value`
  quickRef: [
    { label: 'Civil suit (₹1 lakh)',        mode: 'adv',    value: 100000 },
    { label: 'Civil suit (₹4 lakh)',        mode: 'adv',    value: 400000 },
    { label: 'Civil suit (₹10 lakh, max)',  mode: 'adv',    value: 1000000 },
    { label: 'Declaration only / no value', mode: 'filing', caseType: 'civil',    key: 'declaration' },
    { label: 'Writ / High Court petition',  mode: 'filing', caseType: 'writ',     key: 'writ' },
    { label: 'Consumer (₹5 lakh)',          mode: 'filing', caseType: 'consumer', key: 'complaint', value: 500000 },
  ],
  // Notes shown beside the result
  notes: [
    'Rates are those of the Court Fees Act, 1870: Schedule I (ad valorem) and Schedule II (fixed fees). Old anna amounts are converted at 16 annas = ₹1 and shown to the nearest paisa.',
    'The ad valorem fee on a plaint or memorandum of appeal is capped at ₹3,000 (any value above ₹4,10,000 pays the maximum).',
    'The Act says rates in each State / Union Territory are as per its own State Amendments. Check the local schedule if your court\'s State has amended these rates.',
    'The claim value is worked out under s. 7 of the Act (for example, maintenance is valued at 10 times one year\'s amount, a mortgage suit at the principal money, a landlord–tenant suit at one year\'s rent). In s. 7(iv) suits the plaintiff states the value.',
    'If a suit covers two or more distinct subjects, the fees for each are added together (s. 17). If the Court refers the parties to settlement under s. 89 CPC, the full plaint fee is refunded (s. 16).',
    'Some documents carry no fee (s. 19), such as written statements called for after the first hearing, and probate or letters of administration where the property does not exceed ₹1,000.',
    'Consumer complaints and Labour Court matters are not governed by this Act. Consumer fees follow Rule 7 of the CP (CDRC) Rules, 2020.',
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
  const cfg = config && Array.isArray(config.filings) && config.scales ? config : DEFAULT_CONFIG
  const scales = { ...DEFAULT_CONFIG.scales, ...cfg.scales }

  // Filings grouped by case type, in the order the admin set
  const matters = {}
  COURT_TYPES.forEach(t => { matters[t.value] = [] })
  cfg.filings.forEach(f => { if (matters[f.caseType]) matters[f.caseType].push(f) })

  const adValoremExact = v => scaleFee(scales.adValorem, v)
  const adValorem = v => money(adValoremExact(v))

  // Whether a filing needs a claim value entered
  const matterNeedsValue = m => m.kind === 'adv' || m.kind === 'half' || (m.kind === 'scale' && !!m.valueLabel)

  // The value the fee is actually charged on (e.g. maintenance is valued at 10 x one year's amount, s. 7(ii))
  const chargeableValue = (m, value) => (Number(value) || 0) * (Number(m?.mult) || 1)

  // Fee for a chosen filing
  function calcMatterFee(m, value) {
    if (!m) return 0
    const v = chargeableValue(m, value)
    if (m.kind === 'adv')   return adValorem(v)
    if (m.kind === 'half')  return money(adValoremExact(v) / 2)   // Sch. I, Art. 2 / 5: one-half of the Art. 1 scale
    if (m.kind === 'scale') return money(scaleFee(scales[m.scale], v))
    return money(Number(m.amount) || 0)
  }

  // Forum for a consumer complaint by value
  function consumerForum(value) {
    const list = cfg.forums?.length ? cfg.forums : DEFAULT_CONFIG.forums
    const hit = list.find(f => f.upTo === null || f.upTo === undefined || value <= Number(f.upTo))
    return (hit || list[list.length - 1]).label
  }

  // Quick Reference rows as [label, fee text]; a row whose filing was removed is left out
  const quickRef = (Array.isArray(cfg.quickRef) ? cfg.quickRef : DEFAULT_CONFIG.quickRef).flatMap(r => {
    const value = Number(r.value) || 0
    let fee
    if (r.mode === 'filing') {
      const m = matters[r.caseType]?.find(x => x.key === r.key)
      if (!m) return []
      fee = calcMatterFee(m, value)
    } else {
      fee = adValorem(value)
    }
    const text = fee === 0 ? 'Nil' : '₹' + fee.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(fee) ? 0 : 2, maximumFractionDigits: 2 })
    return [[r.label, text]]
  })

  return {
    quickRef, matters, adValorem, matterNeedsValue, chargeableValue, calcMatterFee, consumerForum,
    notes: Array.isArray(cfg.notes) ? cfg.notes : DEFAULT_CONFIG.notes,
  }
}
