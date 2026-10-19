import { useCallback, useEffect, useState } from 'react'

// How many columns a CSS grid currently has (auto-fill grids change with the screen width).
// Use: const [columns, gridRef] = useGridColumns(); <div className="..-grid" ref={gridRef}>
// Pass columns to useSeeMore so every "See more" step ends on a full row.
export default function useGridColumns() {
  const [el, setEl] = useState(null)
  const [columns, setColumns] = useState(1)
  const gridRef = useCallback(node => setEl(node), [])

  useEffect(() => {
    if (!el) return undefined
    const count = () => {
      const tracks = getComputedStyle(el).gridTemplateColumns
      const n = tracks && tracks !== 'none' ? tracks.trim().split(/\s+/).length : 1
      setColumns(prev => (prev === n ? prev : Math.max(n, 1)))
    }
    count()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', count)
      return () => window.removeEventListener('resize', count)
    }
    const ro = new ResizeObserver(count)
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])

  return [columns, gridRef]
}
