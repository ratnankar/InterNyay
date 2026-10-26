import { isClosedCase } from '../constants/data'

// Court time: the "Update next date" button follows Indian time, whatever the time zone of the device
function istNow(now) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)
  const get = type => parts.find(p => p.type === type)?.value
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) }
}

// True when the case's next hearing date is over (from 6 PM on the day itself) and the case is still open, so the date
// should have moved on. The button shows only then and goes away as soon as the case gets a later date
export function needsNextHearingUpdate(c, now = new Date()) {
  if (!c?.nextHearing || isClosedCase(c)) return false

  const cnr = String(c.cnrNo || '').toUpperCase().replace(/[\s-]/g, '')
  if (!/^[A-Z0-9]{16}$/.test(cnr)) return false

  const today = istNow(now)
  const date = String(c.nextHearing).slice(0, 10)
  return date < today.date || (date === today.date && today.hour >= 18)
}
