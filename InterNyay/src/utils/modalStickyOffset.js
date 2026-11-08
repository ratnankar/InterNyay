import { useEffect } from 'react'

const HEADER = '.modal__header'
const PROPERTY = '--modal-head-h'

export function useModalStickyOffset() {
  useEffect(() => {
    const watched = new WeakSet()

    const resizer = new ResizeObserver(entries => {
      entries.forEach(({ target }) => {
        const modal = target.closest('.modal')
        if (modal) modal.style.setProperty(PROPERTY, `${target.offsetHeight}px`)
      })
    })

    const watch = header => {
      if (watched.has(header)) return
      watched.add(header)
      resizer.observe(header)
    }

    const scan = node => {
      if (node.nodeType !== 1) return
      if (node.matches(HEADER)) watch(node)
      node.querySelectorAll?.(HEADER).forEach(watch)
    }

    scan(document.body)
    const mutations = new MutationObserver(records => records.forEach(r => r.addedNodes.forEach(scan)))
    mutations.observe(document.body, { childList: true, subtree: true })

    return () => {
      mutations.disconnect()
      resizer.disconnect()
    }
  }, [])
}
