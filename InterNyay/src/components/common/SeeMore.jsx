// "See more" button shown under a long list, hidden when everything is already visible
export default function SeeMore({ remaining, onClick, step = 20 }) {
  if (!remaining || remaining <= 0) return null

  return (
    <div className="see-more">
      <button type="button" className="btn-outline see-more__btn" onClick={onClick}>
        See more
        <span className="see-more__count">({Math.min(step, remaining)} of {remaining} remaining)</span>
      </button>
    </div>
  )
}
