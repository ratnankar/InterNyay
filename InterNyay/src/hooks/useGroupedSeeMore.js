import { useState } from 'react'

export default function useGroupedSeeMore(items, { runOf, isClosed, step, resetKey = '' }) {
  const [state, setState] = useState({ key: resetKey, limit: step })
  if (state.key !== resetKey) setState({ key: resetKey, limit: step })
  const limit = state.key === resetKey ? state.limit : step

  const page = lim => {
    let budget = lim
    let left = 0
    const shown = []
    for (let i = 0; i < items.length;) {
      const id = runOf(items[i])
      let j = i
      while (j < items.length && runOf(items[j]) === id) j++
      const closed = isClosed(items[i])
      if (closed || budget > 0) {
        for (let k = i; k < j; k++) shown.push(items[k])
        if (!closed) budget -= j - i
      } else {
        left += j - i
      }
      i = j
    }
    return { shown, left }
  }

  if (!step) return { shown: items, remaining: 0, showMore: () => {}, step: 0 }

  const now = page(limit)
  const next = page(limit + step)

  return {
    shown: now.shown,
    remaining: now.left,
    showMore: () => setState({ key: resetKey, limit: limit + step }),
    step: Math.max(now.left - next.left, 0),
  }
}
