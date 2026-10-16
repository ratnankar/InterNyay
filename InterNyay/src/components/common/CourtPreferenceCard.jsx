import { useEffect, useState } from 'react'
import { useApp } from '../../context/AppContext'
import api from '../../services/api'
import CourtPreferencePicker from './CourtPreferencePicker'
import { useCourtPreferences, setCourtPreferences } from '../../constants/courts'
import { getErrorMessage } from '../../utils/errorMessages'

// Profile card: the courts the user works at. These courts are what Judges on Leave, the judge list, duty magistrate,
// bail roster, police directory and the Add Case form open on
export default function CourtPreferenceCard() {
  const { addToast, updateCurrentUser } = useApp()
  const prefs = useCourtPreferences()
  const [ids, setIds] = useState([])
  const [saving, setSaving] = useState(false)

  // Start from what is saved (and follow it when it loads or is saved elsewhere)
  // (keyed on the contents, so a background refresh with the same courts does not wipe a selection not saved yet)
  const savedKey = prefs.saved.join(',')
  useEffect(() => { if (prefs.loaded) setIds(prefs.saved) }, [prefs.loaded, savedKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = prefs.loaded && (ids.length !== prefs.saved.length || ids.some((v, i) => v !== prefs.saved[i]))

  async function save() {
    setSaving(true)
    try {
      const res = await api.courtPreferences.save(ids)
      setCourtPreferences(res)
      updateCurrentUser({ courtPreferenceIds: res.saved })
      addToast(res.saved.length ? 'Court preference saved' : 'Court preference cleared')
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not save your court preference'), 'error')
    } finally {
      setSaving(false)
    }
  }

  // What the app uses right now when nothing is chosen
  const top = prefs.effective[0]

  return (
    <div className="card profile-card">
      <div className="page-header page-header--top">
        <h3 className="section-title">Court preference</h3>
      </div>
      <p className="profile-note">Choose the courts you work at. You can pick more than one.</p>

      <CourtPreferencePicker value={ids} onChange={setIds} disabled={saving} />

      {prefs.loaded && !prefs.custom && ids.length === 0 && (
        <p className="profile-note court-pref__hint">
          {top
            ? <>Nothing chosen yet, so InterNyay uses the court where you have the most cases: <strong>{top.court}</strong> ({top.cases} {top.cases === 1 ? 'case' : 'cases'}).</>
            : 'Nothing chosen yet. Once you add cases, InterNyay uses the court where you have the most cases.'}
        </p>
      )}

      <div className="form-actions u-justify-start court-pref__actions">
        <button type="button" className="btn-gold" onClick={save} disabled={saving || !dirty}>
          {saving ? 'Saving…' : 'Save court preference'}
        </button>
        {ids.length > 0 && (
          <button type="button" className="btn-outline" onClick={() => setIds([])} disabled={saving}>Clear</button>
        )}
      </div>
    </div>
  )
}
