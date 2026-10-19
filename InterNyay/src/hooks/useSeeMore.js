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

  const base = state.key === resetKey ? state.count : rowStep
  let count = Math.max(base, minCount)
  if (columns > 1) count = Math.ceil(count / columns) * columns
  if (groupOf) {
    while (count > 0 && count < items.length && groupOf(items[count - 1]) === groupOf(items[count])) count++
  }

  return {
    visible: items.slice(0, count),
    remaining: Math.max(items.length - count, 0),
    showMore: () => setState({ key: resetKey, count: count + rowStep }),
    step: rowStep,
  }
}
