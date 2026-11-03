import AutoLoad from './AutoLoad'

// Under a long list: the next rows load by themselves as the end of the list scrolls into view (no button).
// Renders nothing when everything is already visible. onClick is the "show the next step" function of useSeeMore.
export default function SeeMore({ remaining, onClick }) {
  return <AutoLoad onLoad={onClick} active={!!remaining && remaining > 0} depKey={remaining} />
}
