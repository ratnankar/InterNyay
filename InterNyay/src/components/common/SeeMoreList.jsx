import useSeeMore from '../../hooks/useSeeMore'
import useGridColumns from '../../hooks/useGridColumns'
import SeeMore from './SeeMore'

// Renders a long list a page at a time with a "See more" button under it.
// children is a function that receives the visible items and returns the markup (rows, cards or a table).
// Use it where a hook can't be called directly, for example inside an ArchiveTree month.
// For a grid of cards, put the second argument (gridRef) on the grid: every step then ends on a full row.
export default function SeeMoreList({ items, step = 20, resetKey = '', children }) {
  const [columns, gridRef] = useGridColumns()
  const { visible, remaining, showMore, step: rowStep } = useSeeMore(items, resetKey, step, 0, { columns })

  return (
    <>
      {children(visible, gridRef)}
      <SeeMore remaining={remaining} onClick={showMore} step={rowStep} />
    </>
  )
}
