import { useEffect, useRef, useState } from 'react'
import api, { publicApi } from '../services/api'
import PricingCards from '../components/common/PricingCards'
import BrandMark from '../components/common/BrandMark'
import Icon from '../components/common/Icon'
import { getErrorMessage } from '../utils/errorMessages'

// Short list under the hero buttons
const HERO_CHECKS = [
  'Built for Delhi District Courts, Delhi High Court and Supreme Court',
  'Associates covered by your plan',
  'Sign up with email or Google',
]

// Four things InterNyay does that an advocate notices first, shown in the strip under the hero
const STRIP = [
  { icon: 'folder', title: 'Cases linked to eCourts',  text: 'Status, dates and orders read from eCourts' },
  { icon: 'court',  title: 'Cause list numbers',       text: 'Fetched for tomorrow\'s hearings at 6 PM' },
  { icon: 'chat',   title: 'WhatsApp reminders',       text: 'Hearing and payment reminders to your clients' },
  { icon: 'search', title: 'AI assistant',             text: 'Ask questions about your own records' },
]

// Points listed next to the cause list spotlight
const CAUSE_LIST_POINTS = [
  'Fetched automatically at 6 PM for tomorrow\'s hearings',
  'Court number, judge and cause list number on every hearing card',
  'Judges on leave are flagged before you travel',
  'Works for cases linked to eCourts with a CNR number',
]

// Smaller tools that do not get a full feature row
const MORE = [
  { icon: 'user',    title: 'Clients',        text: 'Client records with their cases, documents and contact details, ready when the phone rings.' },
  { icon: 'bolt',    title: 'Quick access',   text: 'Judges list, successor courts, bail roster, duty magistrates, police directory and jurisdiction lookup a click away.' },
  { icon: 'bell',    title: 'Court notifications', text: 'Notifications and circulations from courts and bar associations, with their PDFs one click away.' },
  { icon: 'beach',   title: 'Judges on leave', text: 'Daily judge-leave updates for the courts you appear in.' },
  { icon: 'note',    title: 'To-do list',     text: 'Tasks for you and your associates so nothing slips between hearings.' },
  { icon: 'receipt', title: 'Office expenses', text: 'Chamber expenses recorded alongside your fee income.' },
  { icon: 'chat',    title: 'AI assistant',   text: 'Ask about your cases, hearings, fees and tasks in plain language. It reads, it never edits.' },
]

// Trust section: practical safeguards the app really has
const TRUST = [
  { icon: 'mail',  title: 'Verified sign-up',          text: 'A new email sign-up confirms its address with a 6-digit code before the account is created.' },
  { icon: 'lock',  title: 'Finances behind a PIN',     text: 'Fees and transactions open only after your 4-digit PIN. A forgotten PIN is reset with your password or Google.' },
  { icon: 'eye',   title: 'A read-only assistant',     text: 'The AI assistant answers from your own records and has no way to change them.' },
  { icon: 'user',  title: 'Associates on your terms',  text: 'Associates sign up with your advocate code and work under your plan. Fees and transactions stay hidden from them.' },
]

// Frequently asked questions (plain details elements, no script needed)
const FAQS = [
  { q: 'Who is InterNyay for?',
    a: 'Advocates practising in the Delhi District Courts, the Delhi High Court and the Supreme Court, and the associates who work with them, from a solo practice to a chamber with several juniors. It is built around how these courts work: CNR numbers, cause lists, court numbers, court holidays and the Court Fees Act.' },
  { q: 'Which courts does InterNyay cover?',
    a: 'For now: the Delhi District Courts (Saket, Patiala House, Rouse Avenue, Tis Hazari, Rohini, Karkardooma and Dwarka), the Delhi High Court and the Supreme Court of India. Cases, hearings, clients, fees and documents are available for all three, and eCourts updates use the case\'s CNR number. Judges on leave, the bail and duty magistrate rosters, the police directory and the DRT and consumer commission jurisdiction lookup cover the Delhi District Courts and Delhi. Courts in other states are not covered yet.' },
  { q: 'Where do hearing dates and orders come from?',
    a: 'InterNyay reads a case\'s status, next date, past hearing dates and order files from eCourts. You can still enter or correct dates yourself, and orders you upload by hand are kept with the hearing.' },
  { q: 'How do cause list numbers work?',
    a: 'Every evening at 6 PM, InterNyay fetches the cause list numbers for tomorrow\'s hearings of your CNR-linked cases. They appear on the dashboard hearing card next to the court number and judge.' },
  { q: 'Who receives the WhatsApp reminders?',
    a: 'Your clients. A hearing reminder goes to every client on the case who has a WhatsApp number saved, 1 or 2 days before the hearing, and you can switch it on or off per case. You can also send a payment reminder when fees are pending. WhatsApp reminders are part of the plans that include them, and payment reminders also need a plan with fees and transactions.' },
  { q: 'Do my associates need their own subscription?',
    a: 'No. Associates work under the advocate\'s plan, and each plan includes a set number of associates. The pricing section above shows the number for every plan.' },
  { q: 'Can the AI assistant change my cases?',
    a: 'No. It only reads. It answers questions about your own cases, hearings, fees, documents and tasks, plus directory data such as police stations and jurisdiction. It is part of the plans that include it.' },
  { q: 'Does it work on my phone?',
    a: 'Yes. InterNyay runs in your phone\'s browser and adapts to the screen, so tomorrow\'s hearings are one tap away on the way to court.' },
  { q: 'How do I change my plan?',
    a: 'Open My Plan inside the app to see what your plan includes. Free plans switch instantly; for any other plan you send a request, or use the contact form on this page.' },
]

// Holidays for the sample calendar (November 2026 starts on a Sunday, so 1, 8, 15, 22 and 29 are Sundays)
const CAL_HOLIDAYS = [9]           // High Court holiday (red in the app)
const CAL_DISTRICT_HOLIDAYS = [16]  // District Court holiday (green in the app)
const CAL_BOTH_HOLIDAYS = [23]      // Holiday at both District and High Court (half green, half red in the app)
const CAL_NO_HEARING = [20]         // A day the advocate crossed out as a no-hearing day
// Order in which the marked days light up in turn, one after another
const CAL_ORDER = [9, 16, 23, 20]
const CAL_DAYS = Array.from({ length: 30 }, (_, i) => i + 1)

// Basic email format check for the contact form
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Smooth-scroll back to the top of the landing page (used by the logo)
function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
  // Back to the plain address (no #section)
  try { window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search) } catch { /* keep the address */ }
}

// Smooth-scroll to the section with the given id, and put it in the address (/#pricing) so the link can be copied or shared.
// The current history state is kept as it is, so the router's back/forward handling is not disturbed
function scrollToId(id, updateAddress = true) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  if (updateAddress) {
    try { window.history.replaceState(window.history.state, '', `#${id}`) } catch { /* the address stays as it is */ }
  }
}

// A real link to a section of this page. Copying it, opening it in a new tab or following it without JavaScript
// all work (/#pricing); a plain click still scrolls smoothly
function SectionLink({ id, onGo, children }) {
  const href = `${(import.meta.env.BASE_URL || '/').replace(/\/+$/, '')}/#${id}`
  function onClick(e) {
    // Let the browser handle ctrl/cmd/shift/middle clicks (new tab or window)
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    onGo(id)
  }
  return <a href={href} onClick={onClick}>{children}</a>
}

// Words that scroll across the ticker under the hero (decorative)
const TICKER = [
  'Cases', 'Hearings', 'Cause lists', 'Clients', 'Fees & invoices', 'Documents', 'Legal forms',
  'Court fee calculator', 'WhatsApp reminders', 'Court notifications', 'Judges on leave', 'Bail roster', 'Police directory', 'AI assistant',
]

// A number that counts up from zero the first time it scrolls into view (shows the final value at once when motion is reduced)
function CountUp({ to, prefix = '', className }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const show = v => { el.textContent = prefix + Math.round(v).toLocaleString('en-IN') }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce || !('IntersectionObserver' in window)) { show(to); return }
    show(0)
    let raf = 0
    const io = new IntersectionObserver(([en]) => {
      if (!en.isIntersecting) return
      io.disconnect()
      const t0 = performance.now()
      const tick = now => {
        const p = Math.min(1, (now - t0) / 1400)
        show(to * (1 - Math.pow(1 - p, 3)))
        if (p < 1) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }, { threshold: 0.6 })
    io.observe(el)
    return () => { io.disconnect(); cancelAnimationFrame(raf) }
  }, [to, prefix])
  return <b ref={ref} className={className}>{prefix}{to.toLocaleString('en-IN')}</b>
}

// Check-mark list used next to every feature
function Points({ items }) {
  return (
    <ul className="lx-points">
      {items.map(t => (
        <li key={t}><Icon name="check" />{t}</li>
      ))}
    </ul>
  )
}

// Public landing page: features, pricing, FAQ and a contact form (onSignIn and onRegister come from the parent)
export default function LandingPage({ onSignIn, onRegister }) {
  // Plans from the public API, shown in the pricing section
  const [plans, setPlans] = useState([])
  const [plansLoaded, setPlansLoaded] = useState(false)
  useEffect(() => {
    publicApi.plans().then(setPlans).catch(() => setPlans([])).finally(() => setPlansLoaded(true))
  }, [])
  useEffect(() => {
    const idle = window.requestIdleCallback || (cb => setTimeout(cb, 1500))
    const cancel = window.cancelIdleCallback || clearTimeout
    const id = idle(() => { import('../components/auth/AuthPage') })
    return () => cancel(id)
  }, [])
  // Phone menu open state and whether the page has scrolled (adds a line under the header)
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  // Gold reading-progress line under the header and the hero mock that tilts with the mouse
  const progressRef = useRef(null)
  const stageRef = useRef(null)
  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      setScrolled(window.scrollY > 8)
      const max = document.documentElement.scrollHeight - window.innerHeight
      if (progressRef.current) progressRef.current.style.transform = `scaleX(${max > 0 ? Math.min(1, window.scrollY / max) : 0})`
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [])
  // Scroll reveal: sections and cards fade up the first time they enter the viewport
  useEffect(() => {
    const sel = '.lx-strip__item, .lx-spot__grid > *, .lx-head, .lx-row__text, .lx-row__mock, .lx-more__item, .lx-trust__item, .lx-faq__item, .lx-cta__inner, .lx-footer__grid > *'
    const els = Array.from(document.querySelectorAll(`.lx ${sel.split(', ').join(', .lx ')}`))
    if (!('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target) }
      })
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' })
    els.forEach(el => {
      const sib = el.parentElement ? Array.from(el.parentElement.children).indexOf(el) : 0
      el.style.setProperty('--lx-d', `${Math.min(sib, 5) * 70}ms`)
      el.classList.add('lx-reveal')
      io.observe(el)
    })
    return () => io.disconnect()
  }, [])
  // Looping sample screens (.lx-live) only play while they are on screen, and start from the top each time they come into view
  useEffect(() => {
    const els = Array.from(document.querySelectorAll('.lx .lx-live'))
    if (!('IntersectionObserver' in window)) { els.forEach(el => el.classList.add('is-live')); return }
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => en.target.classList.toggle('is-live', en.isIntersecting))
    }, { threshold: 0.25 })
    els.forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [])
  // Pricing cards rise in one after another once the plans have loaded
  useEffect(() => {
    if (!plans.length || !('IntersectionObserver' in window)) return
    const cards = Array.from(document.querySelectorAll('.lx .lx-pricing .pricing-card')).filter(el => !el.classList.contains('lx-popin'))
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (en.isIntersecting) { en.target.classList.remove('lx-await'); en.target.classList.add('lx-popin'); io.unobserve(en.target) }
      })
    }, { threshold: 0.15 })
    cards.forEach((el, i) => { el.style.setProperty('--lx-d', `${i * 90}ms`); el.classList.add('lx-await'); io.observe(el) })
    return () => io.disconnect()
  }, [plans])
  // The hero sample record tilts a few degrees toward the pointer (mouse only, not when motion is reduced)
  function onHeroMove(e) {
    if (!stageRef.current || !window.matchMedia('(hover: hover) and (prefers-reduced-motion: no-preference)').matches) return
    stageRef.current.style.setProperty('--mx', ((e.clientX / window.innerWidth) * 2 - 1).toFixed(3))
    stageRef.current.style.setProperty('--my', ((e.clientY / window.innerHeight) * 2 - 1).toFixed(3))
  }
  function onHeroLeave() {
    stageRef.current?.style.setProperty('--mx', '0')
    stageRef.current?.style.setProperty('--my', '0')
  }

  // Contact form values, submit status (idle, sending, done) and error message
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')

  // Validate the email and description, then send the contact request
  async function submit(e) {
    e.preventDefault()
    const clean = email.trim()
    if (!EMAIL_RE.test(clean)) {
      setError('Please enter a valid email address.')
      return
    }
    const text = description.trim()
    if (text.length < 10) {
      setError('Please describe how we can help (at least 10 characters).')
      return
    }
    setError('')
    setStatus('sending')
    try {
      await api.publicApi.contact({ email: clean, name: name.trim() || undefined, description: text })
      setStatus('done')
    } catch (err) {
      setStatus('idle')
      setError(getErrorMessage(err, 'Something went wrong. Please try again.'))
    }
  }

  // Scroll to a section and close the phone menu
  function go(id) {
    setMenuOpen(false)
    scrollToId(id)
  }

  // Opening the page at /#pricing (or editing the hash by hand) scrolls to that section.
  // Delayed a moment so the router's own scroll-to-top has finished first
  useEffect(() => {
    function fromHash() {
      let id = window.location.hash.replace(/^#/, '')
      try { id = decodeURIComponent(id) } catch { /* malformed hash: use it as it is */ }
      if (id) setTimeout(() => scrollToId(id, false), 120)
    }
    fromHash()
    window.addEventListener('hashchange', fromHash)
    return () => window.removeEventListener('hashchange', fromHash)
  }, [])

  return (
    <div className="lp lx">
      <a className="lx-skip" href="#main">Skip to content</a>
      {/* Top navigation: brand, section links, Sign in and Get started */}
      <header className={`lx-nav${scrolled ? ' is-scrolled' : ''}${menuOpen ? ' is-menu' : ''}`}>
        <div className="lx-wrap lx-nav__row">
          <button type="button" className="lx-brand brand-link" onClick={scrollToTop} aria-label="InterNyay home">
            <BrandMark size="md" />
            <span>InterNyay</span>
          </button>
          <nav className="lx-nav__links" aria-label="Sections">
            <SectionLink id="features" onGo={go}>Features</SectionLink>
            <SectionLink id="pricing" onGo={go}>Pricing</SectionLink>
            <SectionLink id="faq" onGo={go}>FAQ</SectionLink>
            <SectionLink id="contact" onGo={go}>Contact us</SectionLink>
          </nav>
          <div className="lx-nav__actions">
            <button type="button" className="lx-textbtn" onClick={onSignIn}>Sign in</button>
            <button type="button" className="lp-btn lp-btn--gold" onClick={onRegister}>Get started</button>
            <button
              type="button" className="lx-menubtn" aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen} aria-controls="lx-menu" onClick={() => setMenuOpen(o => !o)}
            >
              <Icon name={menuOpen ? 'close' : 'list'} size={22} />
            </button>
          </div>
        </div>
        {/* Phone menu */}
        <nav id="lx-menu" className={`lx-menu${menuOpen ? ' is-open' : ''}`} aria-label="Sections (menu)">
          <SectionLink id="features" onGo={go}>Features</SectionLink>
          <SectionLink id="pricing" onGo={go}>Pricing</SectionLink>
          <SectionLink id="faq" onGo={go}>FAQ</SectionLink>
          <SectionLink id="contact" onGo={go}>Contact us</SectionLink>
        </nav>
        <i className="lx-progress" ref={progressRef} aria-hidden="true" />
      </header>

      <main id="main">
      {/* Hero: headline and sign-up buttons on the left, a sample case record on the right */}
      <section className="lx-hero lx-live" onMouseMove={onHeroMove} onMouseLeave={onHeroLeave}>
        <i className="lx-orb lx-orb--a" aria-hidden="true" />
        <i className="lx-orb lx-orb--b" aria-hidden="true" />
        <div className="lx-wrap lx-hero__grid">
          <div className="lx-hero__copy">
            <p className="lx-pill"><Icon name="gavel" />Legal practice management for Delhi advocates</p>
            <h1>Manage your entire legal practice, <span className="lx-shine">digitally.</span></h1>
            <p className="lx-hero__sub">
              Cases, hearings, clients, fees, documents and court updates, organised for the way
              advocates and their associates actually work.
            </p>
            <div className="lx-hero__cta">
              <button type="button" className="lp-btn lp-btn--gold lp-btn--lg" onClick={onRegister}>Create your account</button>
              <button type="button" className="lp-btn lx-btn-line lp-btn--lg" onClick={() => scrollToId('features')}>See what's inside</button>
            </div>
            <ul className="lx-checks">
              {HERO_CHECKS.map(t => <li key={t}><Icon name="check" />{t}</li>)}
            </ul>
          </div>

          {/* Sample case record (sample data) */}
          <div className="lx-stage" ref={stageRef} aria-hidden="true">
            <div className="lx-case lx-mock">
              <div className="lx-case__head">
                <div>
                  <strong>Verma v. Kapoor</strong>
                  <span>Civil Suit (recovery) · CS 118/2025</span>
                </div>
                <em className="lx-chip lx-chip--green">Pending</em>
              </div>
              <dl className="lx-case__facts">
                <div><dt>Court</dt><dd>Saket Court · No. 14</dd></div>
                <div><dt>Judge</dt><dd>Ms. Anjali Rao</dd></div>
                <div><dt>Filing date</dt><dd>14 Mar 2025</dd></div>
                <div><dt>Next hearing</dt><dd>12 Nov 2026</dd></div>
              </dl>
              <p className="lx-case__label">Hearing history</p>
              <ul className="lx-case__history">
                <li><span>14 Aug 2026</span>Evidence recorded<b><Icon name="pdf" />Order</b></li>
                <li><span>09 May 2026</span>Arguments on interim application<b><Icon name="pdf" />Order</b></li>
                <li><span>21 Feb 2026</span>Issues framed<b><Icon name="pdf" />Order</b></li>
              </ul>
              <p className="lx-case__foot"><Icon name="check" />Status, dates and orders read from eCourts</p>
            </div>
            <div className="lx-float">
              <Icon name="bell" />
              <span><strong>Client reminder set</strong>2 days before 12 Nov</span>
            </div>
            {/* Notifications that pop in and out one after another */}
            <div className="lx-notif lx-notif--wa">
              <span className="lx-notif__dot"><Icon name="chat" /></span>
              <span><strong>WhatsApp reminder sent</strong>Rohit Verma · Verma v. Kapoor</span>
            </div>
            <div className="lx-notif lx-notif--order">
              <span className="lx-notif__dot lx-notif__dot--gold"><Icon name="pdf" /></span>
              <span><strong>Order fetched from eCourts</strong>14 Aug 2026 · saved to the case</span>
            </div>
          </div>
        </div>
      </section>

      {/* Strip: four things advocates notice first */}
      <section className="lx-strip" aria-label="Highlights">
        <div className="lx-wrap lx-strip__row">
          {STRIP.map(s => (
            <div key={s.title} className="lx-strip__item">
              <span className="lx-strip__icon"><Icon name={s.icon} duotone /></span>
              <div><strong>{s.title}</strong><span>{s.text}</span></div>
            </div>
          ))}
        </div>
      </section>

      {/* Ticker of what is inside (decorative, pauses on hover) */}
      <section className="lx-marquee" aria-hidden="true">
        <div className="lx-marquee__track">
          {[...TICKER, ...TICKER].map((t, i) => <span key={i}><i />{t}</span>)}
        </div>
      </section>

      {/* Spotlight: cause list numbers and judge leave on tomorrow's hearings */}
      <section className="lx-spot">
        <div className="lx-wrap lx-spot__grid">
          <div>
            <p className="lx-tag lx-tag--dark"><Icon name="court" />Never miss a hearing</p>
            <h2>Know your cause list number before you leave home</h2>
            <p className="lx-spot__lead">
              Each evening InterNyay looks up tomorrow's cause list numbers for your cases and puts them on your
              dashboard, next to the court number and the judge. Nobody has to prepare it, and nobody has to remember.
            </p>
            <ul className="lx-points lx-points--dark">
              {CAUSE_LIST_POINTS.map(t => <li key={t}><Icon name="check" />{t}</li>)}
            </ul>
          </div>

          {/* Sample hearing cards (sample data) */}
          <div className="lx-hearings lx-mock lx-live" aria-hidden="true">
            <div className="lx-hearings__head">
              <strong>Tomorrow's hearings</strong>
              <span className="lx-sync">
                <b className="lx-sync__a"><i className="lx-spin" />Fetching cause list…</b>
                <b className="lx-sync__b"><Icon name="check" />3 matters ready</b>
              </span>
            </div>
            <div className="lx-hearing">
              <div>
                <strong>Verma v. Kapoor</strong>
                <span>Saket Court · Court No. 14</span>
                <span>Ms. Anjali Rao</span>
              </div>
              <em className="lx-chip lx-chip--navy">Cause List No. 9</em>
            </div>
            <div className="lx-hearing">
              <div>
                <strong>State v. Rawat</strong>
                <span>Patiala House Court · Court No. 3</span>
                <span>Mr. K. Sethi</span>
              </div>
              <em className="lx-chip lx-chip--navy">Cause List No. 21</em>
            </div>
            <div className="lx-hearing lx-hearing--warn">
              <div>
                <strong>Gupta Traders v. Mehra Estates</strong>
                <span>Dwarka Court · Court No. 7</span>
                <span className="lx-hearing__leave"><Icon name="warning" />Judge on leave tomorrow</span>
              </div>
              <em className="lx-chip lx-chip--amber">Check date</em>
            </div>
          </div>
        </div>
      </section>

      {/* Features: four rows with a sample screen each, then the smaller tools */}
      <section id="features" className="lx-section lx-features">
        <div className="lx-wrap">
          <div className="lx-head">
            <h2>Run your entire practice in one place</h2>
            <p>Every tool a chamber needs for the daily work, built around the Delhi District Courts, the Delhi High Court and the Supreme Court, and working together.</p>
          </div>

          {/* Hearings and calendar */}
          <article className="lx-row">
            <div className="lx-row__text">
              <p className="lx-tag"><Icon name="calendar" />Hearings &amp; calendar</p>
              <h3>Court holidays are already on your calendar, and you can cross out your own non-hearing days</h3>
              <p>Browse the month, pick a day and see that day's hearings, with the next date tracked for each case. Holidays are colour-coded by court, Sundays stand out in red, and a day you cross out is clearly marked, so you plan around the court's calendar and not against it.</p>
              <Points items={[
                'Next date tracked for every case',
                'District Court, High Court and both-court holidays colour-coded, Sundays in red',
                'Cross out a day as a non-hearing day, with a warning if cases are already listed on it',
                'Pick any day to see its hearings with court, judge and file details',
                'Daily judge-leave updates for your courts',
              ]} />
            </div>
            <div className="lx-row__mock lx-live" aria-hidden="true">
              <div className="lx-cal lx-mock">
                <div className="lx-cal__head"><strong>November 2026</strong></div>
                <div className="lx-cal__grid">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i} className="lx-cal__dow">{d}</span>)}
                  {CAL_DAYS.map(d => (
                    <span
                      key={d}
                      style={{ '--n': d, '--k': CAL_ORDER.indexOf(d) }}
                      className={`lx-cal__day${d % 7 === 1 ? ' is-sunday' : ''}${CAL_HOLIDAYS.includes(d) ? ' is-holiday' : ''}${CAL_DISTRICT_HOLIDAYS.includes(d) ? ' is-holiday-district' : ''}${CAL_BOTH_HOLIDAYS.includes(d) ? ' is-holiday-both' : ''}${CAL_NO_HEARING.includes(d) ? ' is-nohearing' : ''}`}
                    >
                      {d}
                      {CAL_NO_HEARING.includes(d) && (
                        <svg className="lx-cal__cross" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" pathLength="40" /></svg>
                      )}
                    </span>
                  ))}
                </div>
                <ul className="lx-cal__legend">
                  <li><i className="lx-dot lx-dot--green" />District Court holiday</li>
                  <li><i className="lx-dot lx-dot--red" />High Court holiday</li>
                  <li><i className="lx-dot lx-dot--both" />Both courts</li>
                  <li><svg className="lx-dot-x" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" /></svg>No hearing</li>
                </ul>
              </div>
            </div>
          </article>

          {/* Client updates over WhatsApp */}
          <article className="lx-row lx-row--flip">
            <div className="lx-row__text">
              <p className="lx-tag"><Icon name="chat" />Client updates</p>
              <h3>Clients hear from you before they have to ask</h3>
              <p>Switch on an automatic WhatsApp reminder for a case, and send a payment reminder when fees are pending. Your clients stay informed without a single call from your chamber.</p>
              <Points items={[
                'Hearing reminders 1 or 2 days ahead, set per case',
                'Goes to every client on the case who has a WhatsApp number saved',
                'Payment reminders with the amount due',
                'Manual reminders send only after you confirm',
              ]} />
              <p className="lx-note">Available on plans that include WhatsApp reminders. Payment reminders also need a plan with fees and transactions.</p>
            </div>
            <div className="lx-row__mock lx-live" aria-hidden="true">
              <div className="lx-phone">
                <div className="lx-phone__bar"><span className="lx-phone__avatar">IN</span><div><strong>InterNyay</strong><span>WhatsApp</span></div></div>
                <div className="lx-phone__chat">
                  <div className="lx-msg lx-msg--1">
                    <p className="lx-typing"><i /><i /><i /></p>
                    <p className="lx-bubble">
                      Hello Rohit Verma, your matter <b>Verma v. Kapoor</b> (CS 118/2025) is listed on Thursday, 12 November 2026 at Saket Court, Court No. 14.
                      <small>Hearing reminder · 2 days before<span className="lx-ticks">✓✓</span></small>
                    </p>
                  </div>
                  <div className="lx-msg lx-msg--2">
                    <p className="lx-typing"><i /><i /><i /></p>
                    <p className="lx-bubble">
                      Hello Rohit Verma, Rs. 15,000 is pending for <b>Verma v. Kapoor</b> (CS 118/2025).
                      <small>Payment reminder<span className="lx-ticks">✓✓</span></small>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </article>

          {/* Fees and billing */}
          <article className="lx-row">
            <div className="lx-row__text">
              <p className="lx-tag"><Icon name="money" />Fees &amp; transactions</p>
              <h3>Fees, payments and invoices for every case</h3>
              <p>Choose how you charge for each case, mark every fee paid as it comes in, and always see what is still due. Your office expenses sit next to your fee income, so the whole picture is in one app.</p>
              <Points items={[
                'One-time, date-wise (per hearing) or stage-wise fees; corporate panel clients are billed stage wise',
                'Mark fees paid as they are received, with the amount due always shown',
                'Invoices and a full transaction history',
                'Transactions stay behind your PIN, and associates cannot see fees',
              ]} />
            </div>
            <div className="lx-row__mock lx-live" aria-hidden="true">
              <div className="lx-fees lx-mock">
                <div className="lx-toast"><Icon name="check" />Payment received · ₹15,000</div>
                <div className="lx-fees__head"><strong>Verma v. Kapoor</strong><span>Date Wise</span></div>
                <ul className="lx-fees__rows">
                  <li><div><b>Initial Amount</b><span>₹25,000</span></div><em className="lx-chip lx-chip--green">Paid</em></li>
                  <li><div><b>Hearing Fee — 14 Aug 2026</b><span>₹15,000</span></div><em className="lx-chip lx-chip--green">Paid</em></li>
                  <li><div><b>Hearing Fee — 12 Nov 2026</b><span>₹15,000</span></div><em className="lx-chip lx-chip--amber">Due</em></li>
                </ul>
                <div className="lx-fees__sum">
                  <div><span>Total</span><CountUp to={55000} prefix="₹" /></div>
                  <div><span>Received</span><CountUp to={40000} prefix="₹" /></div>
                  <div><span>Due</span><CountUp to={15000} prefix="₹" className="is-due" /></div>
                </div>
                <div className="lx-fees__bar"><i /></div>
                <p className="lx-fees__pct">₹15,000 due · send a payment reminder from the fee screen</p>
              </div>
            </div>
          </article>

          {/* Documents, forms and calculator */}
          <article className="lx-row lx-row--flip">
            <div className="lx-row__text">
              <p className="lx-tag"><Icon name="file" />Documents &amp; forms</p>
              <h3>Documents, legal forms and the court fee calculator</h3>
              <p>Keep case, client and evidence documents where you can preview them, fill standard forms from your case details, and work out court fees without opening a separate sheet.</p>
              <Points items={[
                'Upload and preview case, client and evidence documents',
                'Legal forms filled from your case details, ready to print or download',
                'Court fees worked out under the Court Fees Act, 1870',
              ]} />
            </div>
            <div className="lx-row__mock lx-live" aria-hidden="true">
              <div className="lx-docs lx-mock">
                <div className="lx-docs__head"><strong>Documents</strong><span>Verma v. Kapoor</span></div>
                <ul className="lx-docs__list">
                  <li><Icon name="pdf" /><div><b>Plaint.pdf</b><span>Case document</span></div></li>
                  <li><Icon name="word" /><div><b>Vakalatnama.docx</b><span>Client document</span></div></li>
                  <li><Icon name="image" /><div><b>Site photograph.jpg</b><span>Evidence</span></div></li>
                  <li className="lx-fetch-row"><Icon name="pdf" /><div><b>Order — 14 Aug 2026.pdf</b><span className="lx-upl"><i /></span></div><em className="lx-chip lx-chip--navy lx-swap"><s>Fetching…</s><u>Saved</u></em></li>
                </ul>
                <div className="lx-docs__form">
                  <Icon name="clipboard" />
                  <div><b>Legal form</b><span>Filled from case details</span></div>
                  <em className="lx-chip lx-chip--navy">Download</em>
                </div>
              </div>
            </div>
          </article>

          {/* Smaller tools */}
          <div className="lx-more">
            <h3>And the rest of the daily toolkit</h3>
            <div className="lx-more__grid">
              {MORE.map(f => (
                <div key={f.title} className="lx-more__item">
                  <span className="lx-more__icon"><Icon name={f.icon} /></span>
                  <div><strong>{f.title}</strong><p>{f.text}</p></div>
                </div>
              ))}
            </div>
          </div>
          <p className="lx-sample">Screens on this page show sample data.</p>
        </div>
      </section>

      {/* Trust: practical safeguards */}
      <section className="lx-section lx-trust">
        <div className="lx-wrap">
          <div className="lx-head">
            <h2>Built to keep client work private</h2>
            <p>Practical safeguards around sign-up, finances and team access.</p>
          </div>
          <div className="lx-trust__grid">
            {TRUST.map(t => (
              <div key={t.title} className="lx-trust__item">
                <span className="lx-trust__icon"><Icon name={t.icon} /></span>
                <h3>{t.title}</h3>
                <p>{t.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing: selecting a plan opens registration */}
      <section id="pricing" className="lx-section lx-pricing">
        <div className="lx-wrap">
          <div className="lx-head">
            <h2>Simple plans for every kind of practice</h2>
            <p>
              Choose monthly or yearly. Associates are covered by their advocate's plan, and each plan
              includes a number of associates.
            </p>
          </div>
          <PricingCards plans={plans} onSelect={() => onRegister()} cta="Get started" />
          {plansLoaded && !plans.length && (
            <p className="lx-pricing__empty">Plans could not be loaded right now. Please try again shortly, or use the contact form below.</p>
          )}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="lx-section lx-faq">
        <div className="lx-wrap lx-faq__wrap">
          <div className="lx-head lx-head--left">
            <h2>Frequently asked questions</h2>
            <p>Can't find your answer? Send us a message below.</p>
          </div>
          <div className="lx-faq__list">
            {FAQS.map(f => (
              <details key={f.q} className="lx-faq__item">
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Closing call to action */}
      <section className="lx-cta lx-live">
        <i className="lx-orb lx-orb--c" aria-hidden="true" />
        <i className="lx-orb lx-orb--d" aria-hidden="true" />
        <div className="lx-wrap lx-cta__inner">
          <h2>Bring your whole practice into one place</h2>
          <p>Create an account, add your first case, and let InterNyay keep track of the next date.</p>
          <div className="lx-cta__buttons">
            <button type="button" className="lp-btn lp-btn--gold lp-btn--lg" onClick={onRegister}>Create your account</button>
            <button type="button" className="lp-btn lx-btn-ghost lp-btn--lg" onClick={onSignIn}>Sign in</button>
          </div>
        </div>
      </section>

      {/* Contact section: form, or a thank-you message once sent */}
      <section id="contact" className="lx-section lx-contact">
        <div className="lx-wrap lp-narrow">
          <div className="lx-head">
            <h2>Contact us</h2>
            <p>Tell us how we can help. Your message goes to our team and we'll reply to your email.</p>
          </div>

          {/* Thank-you message after sending, otherwise the form */}
          {status === 'done' ? (
            <div className="lp-thanks" role="status">
              <Icon name="check" />
              <div>
                <strong>Thank you!</strong>
                <span>We've received your message and will reply to {email.trim()}.</span>
              </div>
            </div>
          ) : (
            <form className="lp-form" onSubmit={submit} noValidate>
              <label className="lp-field">
                <span>Name <em>(optional)</em></span>
                <input
                  type="text" value={name} maxLength={100} placeholder="Full Name"
                  onChange={e => setName(e.target.value)} autoComplete="name"
                />
              </label>
              <label className="lp-field">
                <span>Email *</span>
                <input
                  type="email" value={email} maxLength={190} placeholder="you@email.com"
                  onChange={e => { setEmail(e.target.value); setError('') }} autoComplete="email" required
                />
              </label>
              <label className="lp-field">
                <span>Description *</span>
                <textarea
                  value={description} rows={5} maxLength={3000}
                  placeholder="How can we help you?"
                  onChange={e => { setDescription(e.target.value); setError('') }} required
                />
              </label>
              {/* Validation or server error */}
              {error && <p className="lp-error" role="alert">{error}</p>}
              <button type="submit" className="lp-btn lp-btn--gold lp-btn--lg" disabled={status === 'sending'}>
                {status === 'sending' ? 'Sending…' : 'Send message'}
              </button>
              <p className="lp-fineprint">We'll only use your email to reply to your message.</p>
            </form>
          )}
        </div>
      </section>

      </main>

      {/* Footer: brand line and link columns */}
      <footer className="lx-footer">
        <div className="lx-wrap lx-footer__grid">
          <div className="lx-footer__brand">
            <span className="lx-footer__logo"><BrandMark size="md" /><span>InterNyay</span></span>
            <p>Practice management for advocates at the Delhi District Courts, Delhi High Court and Supreme Court. Cases, hearings, clients, fees and documents in one place.</p>
          </div>
          <nav className="lx-footer__col" aria-label="Product">
            <h4>Product</h4>
            <SectionLink id="features" onGo={scrollToId}>Features</SectionLink>
            <SectionLink id="pricing" onGo={scrollToId}>Pricing</SectionLink>
            <SectionLink id="faq" onGo={scrollToId}>FAQ</SectionLink>
          </nav>
          <nav className="lx-footer__col" aria-label="Account">
            <h4>Account</h4>
            <button type="button" onClick={onSignIn}>Sign in</button>
            <button type="button" onClick={onRegister}>Create an account</button>
            <SectionLink id="contact" onGo={scrollToId}>Contact us</SectionLink>
          </nav>
        </div>
        <div className="lx-wrap lx-footer__legal">
          <span>© {new Date().getFullYear()} InterNyay. All rights reserved.</span>
        </div>
      </footer>
    </div>
  )
}