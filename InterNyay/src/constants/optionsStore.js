// Dropdown choices managed by the admin (Admin > Dropdown Options).
// The lists below are exported from their own files as plain arrays and objects, and are refreshed in place when the
// server's choices arrive, so every screen that reads them shows the admin's choices. The values written in those files
// are only the built-in fallback, used when the server cannot be reached.
import { useSyncExternalStore } from 'react'
import { publicApi } from '../services/api'
import { CLIENT_TYPES, CLIENT_LABELS, DOCUMENT_TYPES, CLIENT_DOCUMENT_TYPES, MISC_APPLICATION_CHOICES } from './data'
import { SPECIALIZATIONS } from './specializations'
import { CONTACT_CATEGORIES } from './contact'
import { CONSUMER_PECUNIARY_OPTIONS, DRT_AMOUNT_OPTIONS } from './jurisdiction'
import { setCaseCatalog } from './caseCatalog'

// Replaces the contents of an array without changing the array itself
const fill = (target, items) => { target.length = 0; target.push(...items) }

// The lists above change in place, which React cannot see. This counter goes up whenever the admin's choices really changed,
// and useOptionsVersion() lets a component re-draw when that happens.
let version = 0
let lastJson = ''
const listeners = new Set()
const subscribe = l => { listeners.add(l); return () => listeners.delete(l) }
export const useOptionsVersion = () => useSyncExternalStore(subscribe, () => version)

// Applies a response of GET /public/options. A list missing from the response keeps its built-in values.
export function applyOptions(data) {
  if (!data || typeof data !== 'object') return
  const json = JSON.stringify(data)
  const changed = json !== lastJson
  lastJson = json

  const has = key => Array.isArray(data[key])
  const values = key => data[key].map(o => o.value)

  if (has('CLIENT_TYPE'))           fill(CLIENT_TYPES, data.CLIENT_TYPE.map(o => [o.value, o.label]))
  if (has('CLIENT_LABEL'))          fill(CLIENT_LABELS, values('CLIENT_LABEL'))
  if (has('DOCUMENT_TYPE'))         fill(DOCUMENT_TYPES, values('DOCUMENT_TYPE'))
  if (has('CLIENT_DOCUMENT_TYPE'))  fill(CLIENT_DOCUMENT_TYPES, values('CLIENT_DOCUMENT_TYPE'))
  if (has('MISC_APPLICATION_TYPE')) fill(MISC_APPLICATION_CHOICES, values('MISC_APPLICATION_TYPE'))
  if (has('SPECIALIZATION'))        fill(SPECIALIZATIONS, values('SPECIALIZATION'))
  if (has('CONTACT_CATEGORY'))      fill(CONTACT_CATEGORIES, values('CONTACT_CATEGORY'))
  if (has('CONSUMER_PECUNIARY'))    fill(CONSUMER_PECUNIARY_OPTIONS, data.CONSUMER_PECUNIARY.map(o => ({ id: o.value, label: o.label })))
  if (has('DRT_AMOUNT'))            fill(DRT_AMOUNT_OPTIONS, data.DRT_AMOUNT.map(o => ({ id: o.value, label: o.label })))

  if (has('CASE_RELIEF') && has('CASE_TYPE')) setCaseCatalog(data.CASE_RELIEF, data.CASE_TYPE)

  if (changed) { version += 1; listeners.forEach(l => l()) }
}

// Fetches the choices and applies them. Gives up after a few seconds and keeps what is already there.
export async function loadOptions(timeoutMs = 5000) {
  try {
    const data = await Promise.race([
      publicApi.options(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ])
    applyOptions(data)
    return true
  } catch {
    return false
  }
}
