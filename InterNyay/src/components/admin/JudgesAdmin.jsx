import JudgeProfilesAdmin from './JudgeProfilesAdmin'
import ListingAdmin from './ListingAdmin'
import useSessionState from '../../hooks/useSessionState'

// Judges List admin, in two sections (Listing first, then Judges):
//   Listing = the court seats (court, court no., contacts, jurisdiction), each always with a judge
//   Judges  = the judges themselves (name and photo only)
// Changing a judge happens on a listing and keeps the whole court history
export default function JudgesAdmin() {
  const [section, setSection] = useSessionState('admin_judges_section', 'listing')

  return (
    <>
      <div className="change-judge__tabs">
        <button type="button" className={section === 'listing' ? 'btn-gold' : 'btn-outline'} onClick={() => setSection('listing')}>Listing</button>
        <button type="button" className={section === 'judges' ? 'btn-gold' : 'btn-outline'} onClick={() => setSection('judges')}>Judges</button>
      </div>

      {section === 'listing' ? <ListingAdmin /> : <JudgeProfilesAdmin />}
    </>
  )
}
