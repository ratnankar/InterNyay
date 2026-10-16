import { useState } from 'react'

// Shows a list a few rows at a time. Each "See more" click reveals another step of rows.
// The list starts again from the first step whenever resetKey changes (tab, search, filter or sort).
// minCount keeps at least that many rows visible, for example so an opened item is never hidden.
export default function useSeeMore(items, resetKey = '', step = 20, minCount = 0) {
  const [state, setState] = useState({ key: resetKey, count: step })

  const base = state.key === resetKey ? state.count : step
  const count = Math.max(base, minCount)

  return {
    visible: items.slice(0, count),
    remaining: Math.max(items.length - count, 0),
    showMore: () => setState({ key: resetKey, count: count + step }),
  }
}
