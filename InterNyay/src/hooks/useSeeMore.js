import { useState } from 'react'

// Shows a list a few rows at a time. Each "See more" click reveals another step of rows.
// The list starts again from the first step whenever resetKey changes (tab, search, filter or sort).
// minCount keeps at least that many rows visible, for example so an opened item is never hidden.
// opts.columns (cards in a grid): the step and the shown count are rounded up to whole rows, so the last row is never half empty
//   until the very end of the list (get it from useGridColumns).
// opts.groupOf(item) (cards grouped under headings): the shown count is moved on to the end of the group it stops in,
//   so a group is never cut in the middle by "See more".
export default function useSeeMore(items, resetKey = '', step = 20, minCount = 0, opts = {}) {
  const { columns = 1, groupOf } = opts
  const rowStep = columns > 1 ? Math.ceil(step / columns) * columns : step
  const [state, setState] = useState({ key: resetKey, count: rowStep })
  if (state.key !== resetKey) setState({ key: resetKey, count: rowStep })

  // Rounds a shown count up to whole grid rows and to the end of the group it stops in
  const settle = n => {
    let c = n
    if (columns > 1) c = Math.ceil(c / columns) * columns
    if (groupOf) {
      while (c > 0 && c < items.length && groupOf(items[c - 1]) === groupOf(items[c])) c++
    }
    return Math.min(c, items.length)
  }

  const base = state.key === resetKey ? state.count : rowStep
  const count = settle(Math.max(base, minCount))
  // What the next click really reveals (rows and groups are completed), so the button's label is true
  const nextStep = Math.max(settle(count + rowStep) - count, 0)

  return {
    visible: items.slice(0, count),
    remaining: Math.max(items.length - count, 0),
    showMore: () => setState({ key: resetKey, count: count + rowStep }),
    step: nextStep,
  }
}
