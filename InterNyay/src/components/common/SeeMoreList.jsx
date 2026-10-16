import useSeeMore from '../../hooks/useSeeMore'
import SeeMore from './SeeMore'

// Renders a long list a page at a time with a "See more" button under it.
// children is a function that receives the visible items and returns the markup (rows, cards or a table).
// Use it where a hook can't be called directly, for example inside an ArchiveTree month.
export default function SeeMoreList({ items, step = 20, resetKey = '', children }) {
  const { visible, remaining, showMore } = useSeeMore(items, resetKey, step)

  return (
    <>
      {children(visible)}
      <SeeMore remaining={remaining} onClick={showMore} step={step} />
    </>
  )
}
