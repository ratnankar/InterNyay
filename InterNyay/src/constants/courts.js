import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import api from '../services/api'
import { onLiveRefresh } from '../utils/liveRefresh'

// Courts, districts, buildings and court numbers all come from the court table in the database.
// Nothing about them is written in the frontend: this file only loads the table and answers questions about it.

const EMPTY = { rows: [], loaded: false, courtNames: [], districtNames: [], hierarchy: {}, highCourts: [] }

let snapshot = EMPTY
let inFlight = null
const listeners = new Set()

// Builds the lookups once per load so components get a stable object
function build(rows) {
  const hierarchy = {}
  const highCourts = []

  rows.forEach(r => {
    if (!hierarchy[r.court]) hierarchy[r.court] = []
    if (r.district && !hierarchy[r.court].includes(r.district)) hierarchy[r.court].push(r.district)
    if (r.highCourt && !highCourts.includes(r.court)) highCourts.push(r.court)
  })

  // A court flagged as a high court never has districts; every other court is a district court complex,
  // even when no district has been added to it yet
  const courtNames = Object.keys(hierarchy).filter(c => !highCourts.includes(c))
  return {
    rows,
    loaded: true,
    courtNames,
    districtNames: courtNames.flatMap(c => hierarchy[c]),
    hierarchy,
    highCourts,
  }
}

function publish(next) {
  snapshot = next
  listeners.forEach(l => l())
}

// Loads (or reloads) the court table
export function loadCourts(force = false) {
  if (snapshot.loaded && !force) return Promise.resolve(snapshot)
  if (inFlight) return inFlight

  inFlight = api.courts.list()
    .then(rows => { publish(build(Array.isArray(rows) ? rows : [])); return snapshot })
    .finally(() => { inFlight = null })
  return inFlight
}

// Pick up changes an admin made in another tab or session whenever this one is looked at again, and every few minutes
if (typeof window !== 'undefined') {
  onLiveRefresh(() => { if (snapshot.loaded) loadCourts(true).catch(() => {}) })
}

// Forget the table on sign-out so the next user loads a fresh copy
export function resetCourts() { publish(EMPTY) }

const subscribe = l => { listeners.add(l); return () => listeners.delete(l) }
const getSnapshot = () => snapshot

// Hook: current court table, loads it the first time it is needed
export function useCourts() {
  const data = useSyncExternalStore(subscribe, getSnapshot)
  useEffect(() => { if (!snapshot.loaded) loadCourts().catch(() => {}) }, [])
  return data
}

// ---------------------------------------------------------------------------------------------------------------
// Court preferences: the courts the signed-in user works at (Profile, or the question after sign-up).
// The server answers with the courts to open by default: the chosen ones, or, when nothing was chosen, the courts that
// have cases. The court with the most cases is first, so "first" is always the right court to start on.
// ---------------------------------------------------------------------------------------------------------------

const NO_PREFS = { loaded: false, custom: false, saved: [], effective: [], defaultId: null }

let prefSnapshot = NO_PREFS
let prefInFlight = null
const prefListeners = new Set()

function publishPrefs(next) {
  prefSnapshot = next
  prefListeners.forEach(l => l())
}

function normalizePrefs(d) {
  return {
    loaded: true,
    custom: !!d?.custom,
    saved: Array.isArray(d?.saved) ? d.saved : [],
    effective: Array.isArray(d?.effective) ? d.effective : [],
    defaultId: d?.defaultId ?? null,
  }
}

// Loads (or reloads) the preference. A failed load leaves the app on its normal defaults instead of blocking a page
export function loadCourtPreferences(force = false) {
  if (prefSnapshot.loaded && !force) return Promise.resolve(prefSnapshot)
  if (prefInFlight) return prefInFlight

  prefInFlight = api.courtPreferences.get()
    .then(d => { publishPrefs(normalizePrefs(d)); return prefSnapshot })
    .catch(() => { if (!prefSnapshot.loaded) publishPrefs({ ...NO_PREFS, loaded: true }); return prefSnapshot })
    .finally(() => { prefInFlight = null })
  return prefInFlight
}

// Uses the answer of a save straight away
export function setCourtPreferences(d) { publishPrefs(normalizePrefs(d)) }

// Forget the preference on sign-out so the next user starts clean
export function resetCourtPreferences() { publishPrefs(NO_PREFS) }

const prefSubscribe = l => { prefListeners.add(l); return () => prefListeners.delete(l) }
const getPrefSnapshot = () => prefSnapshot

// Hook: the court preference, loads it the first time it is needed
export function useCourtPreferences() {
  const data = useSyncExternalStore(prefSubscribe, getPrefSnapshot)
  useEffect(() => { if (!prefSnapshot.loaded) loadCourtPreferences() }, [])
  return data
}

// Label of a court + district place: "Saket · South", "Rouse Avenue" or "Delhi High Court"
export function placeLabel(place) {
  if (!place?.court) return ''
  if (!place.district || isOwnDistrict(place.court, place.district) || isHighCourt(place.court)) return place.court
  return `${place.court} · ${place.district}`
}

// Preferred places that still exist in the court table, most cases first. Pass districtOnly to leave out high courts
// (pages such as Judges on Leave only cover district courts)
function preferredPlaces(prefs, table, districtOnly) {
  return prefs.effective.filter(p => {
    if (!table.hierarchy[p.court]) return false
    if (table.highCourts.includes(p.court)) return !districtOnly
    return (table.hierarchy[p.court] || []).includes(p.district)
  })
}

// The court + district to start on: the preferred court with the most cases, else the first court of the table
function startPlace(table, prefs, districtOnly = true) {
  const first = preferredPlaces(prefs, table, districtOnly)[0]
  if (first) return { court: first.court, district: first.district }
  const c = table.courtNames[0] || ''
  return { court: c, district: c ? (table.hierarchy[c] || [])[0] || '' : '' }
}

// Hook: the courts to offer as quick buttons (district courts only, most cases first). Empty until the preference has loaded
export function useMyCourts() {
  const table = useCourts()
  const prefs = useCourtPreferences()
  return useMemo(() => (table.loaded && prefs.loaded ? preferredPlaces(prefs, table, true) : []), [table, prefs])
}

// Hook: the court + district a new case starts on (a high court is fine here), empty strings while nothing is known
export function useDefaultCourt() {
  const table = useCourts()
  const prefs = useCourtPreferences()
  return useMemo(() => {
    const ready = table.loaded && prefs.loaded
    const first = ready ? preferredPlaces(prefs, table, false)[0] : null
    return {
      ready,
      court: first?.court || '',
      district: first?.district || '',
      // Court complexes of the preferred courts, in order, for listing them first in a dropdown
      courts: ready ? [...new Set(preferredPlaces(prefs, table, false).map(p => p.court))] : [],
      // Preferred district of a court complex, when one was chosen
      districtOf: court => preferredPlaces(prefs, table, false).find(p => p.court === court)?.district || '',
    }
  }, [table, prefs])
}

// Hook for pages with a court + district filter. It starts on the user's preferred court (the one with the most cases
// when several were chosen, or when nothing was chosen the court with the most cases) and falls back to the first court
// of the table. `ready` turns true once both the court table and the preference are known, so a page loads its data once.
// Once the user presses a court button themselves their choice stays
export function useCourtSelection() {
  const table = useCourts()
  const prefs = useCourtPreferences()
  const ready = table.loaded && prefs.loaded
  const start = useMemo(() => startPlace(table, prefs), [table, prefs])

  const [court, setCourtState] = useState(start.court)
  const [district, setDistrictState] = useState(start.district)
  const picked = useRef(false)

  useEffect(() => {
    if (ready && !picked.current) {
      setCourtState(start.court)
      setDistrictState(start.district)
    }
  }, [ready, start.court, start.district])

  const setCourt = useCallback(c => { picked.current = true; setCourtState(c) }, [])
  const setDistrict = useCallback(d => { picked.current = true; setDistrictState(d) }, [])

  return { court, setCourt, district, setDistrict, ready }
}

// Some complexes have a single district with the same name (e.g. Rouse Avenue), which we don't show twice
export const isOwnDistrict = (court, district) => !!court && court === district

// Court complexes, in table order
export const getCourtNames = () => snapshot.courtNames

// Districts under a court complex
export const getDistricts = court => snapshot.hierarchy[court] || []

// True if the court has districts with their own name, so the district dropdown is needed
export const hasNamedDistricts = court => getDistricts(court).some(d => !isOwnDistrict(court, d))

const uniq = list => [...new Set(list)]
const sameDistrict = (r, district) => (r.district || '') === (district || '')

// Buildings listed in the court table under a court and district
export const getBuildings = (court, district) =>
  uniq(snapshot.rows.filter(r => r.court === court && sameDistrict(r, district) && r.building).map(r => r.building))

// Court numbers listed in the court table under a court and district. Pass a building ('' for none) to narrow
// them to that building, or leave it out for every court no. of the district
export const getCourtNos = (court, district, building, floor) =>
  uniq(snapshot.rows
    .filter(r => r.court === court && sameDistrict(r, district) && r.courtNo
      && (building === undefined || (r.building || '') === building)
      && (floor === undefined || (r.floor || '') === floor))
    .map(r => r.courtNo))

// Court numbers of a court and district grouped by building, in table order: [{ building, courtNos }].
// Court numbers with no building come back under an empty building name
export const getCourtNosByBuilding = (court, district) => {
  const groups = new Map()
  snapshot.rows
    .filter(r => r.court === court && sameDistrict(r, district) && r.courtNo)
    .forEach(r => {
      const b = r.building || ''
      if (!groups.has(b)) groups.set(b, [])
      if (!groups.get(b).some(x => x.courtNo === r.courtNo && x.floor === (r.floor || ''))) {
        groups.get(b).push({ courtNo: r.courtNo, floor: r.floor || '' })
      }
    })
  return [...groups].map(([building, rooms]) => ({ building, rooms, courtNos: rooms.map(x => x.courtNo) }))
}

// Building and floor of a court no. in the court table. Only answers when the court no. is in exactly one
// building/floor, so a number used in several buildings is never guessed
export const findRoom = (court, district, courtNo) => {
  const hits = getCourtNosByBuilding(court, district)
    .flatMap(g => g.rooms.filter(r => r.courtNo === courtNo).map(r => ({ building: g.building, floor: r.floor })))
  return hits.length === 1 ? hits[0] : { building: '', floor: '' }
}

export const getFloors = (court, district, building) =>
  uniq(snapshot.rows
    .filter(r => r.court === court && sameDistrict(r, district) && (r.building || '') === (building || '') && r.floor)
    .map(r => r.floor))

// Building and floor a case sits in. Taken from the case; a case saved before buildings were kept falls back
// to the court table when its court no. is in exactly one building
export function caseRoom(c) {
  if (!c?.courtNo) return { building: '', floor: '' }
  const { court, district } = splitCaseCourt(c)
  if (c.building) {
    if (c.floor) return { building: c.building, floor: c.floor }
    // The case has a building but no floor saved: use the floor the court table lists for that building and court no.,
    // when there is exactly one
    const floors = [...new Set(snapshot.rows
      .filter(r => r.court === court && sameDistrict(r, district) && r.building === c.building && r.courtNo === c.courtNo && r.floor)
      .map(r => r.floor))]
    return { building: c.building, floor: floors.length === 1 ? floors[0] : '' }
  }
  return findRoom(court, district, c.courtNo)
}

// "Main (Floor 2)": the building with its floor in brackets. The floor is only shown with a building, so a floor
// with no building gives nothing
// Floor 2 is written "Floor 2", unless the stored floor already says so (or is a word like "Ground")
export const floorLabel = floor => {
  const f = String(floor || '').trim()
  if (!f) return ''
  return /^floor\b/i.test(f) || /floor$/i.test(f) || /^[a-z]/i.test(f) && !/^\d/.test(f) && !/^[a-z]\d*$/i.test(f) ? f : `Floor ${f}`
}
export const buildingWithFloor = (building, floor) => (building ? (floor ? `${building} (${floorLabel(floor)})` : building) : '')

// Same label for a case
export function roomLabel(c) {
  const { building, floor } = caseRoom(c)
  return buildingWithFloor(building, floor)
}

// Courts above the district level (they have no district)
export const isHighCourt = court => snapshot.highCourts.includes(court)

// Court and district of a case. The server reads both from the case's row in the court table, so they are used as they come
export function splitCaseCourt(c) {
  return { court: c?.court || '', district: c?.district || '' }
}

// Single-line court label for a case, e.g. "South District · Saket Court"
export function caseCourtLabel(c) {
  const { court, district } = splitCaseCourt(c)
  if (!court) return ''
  if (isHighCourt(court)) return court
  if (!district || isOwnDistrict(court, district)) return `${court} Court`
  return `${district} District · ${court} Court`
}

// Same as caseCourtLabel but split into district and court parts for two-line display
export function caseCourtParts(c) {
  const { court, district } = splitCaseCourt(c)
  if (!court) return { district: '', court: '' }
  if (isHighCourt(court)) return { district: '', court }
  return {
    district: district && !isOwnDistrict(court, district) ? `${district} District` : '',
    court: `${court} Court`,
  }
}

// Court label built from a raw court and district value (used where we don't have a full case object)
export function courtDistrictLabel(court, district) {
  if (!court) return district || ''
  if (isHighCourt(court)) return court
  if (!district || isOwnDistrict(court, district)) return `${court} Court`
  return `${district} District Court · ${court}`
}