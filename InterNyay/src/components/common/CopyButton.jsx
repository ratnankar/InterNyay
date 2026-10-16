import { useEffect, useRef, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { copyText } from '../../utils/clipboard'

import Icon from './Icon'
// Button that copies a text to the clipboard
export default function CopyButton({ text, label = 'Copy', title = 'Copy link' }) {
  const { addToast } = useApp()
  const [copied, setCopied] = useState(false)
  const timer = useRef(null)

  // Clear the pending timer if the button unmounts before the "Copied" label resets
  useEffect(() => () => clearTimeout(timer.current), [])

  // Copy the text and flash "Copied" for under 2 seconds (stopPropagation keeps row clicks from firing)
  async function handleClick(e) {
    e.stopPropagation()
    const ok = await copyText(text)

    // Clipboard can be blocked, so tell the user to copy it by hand
    if (!ok) {
      addToast('Could not copy — please select the link and copy it manually', 'error')
      return
    }

    setCopied(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 1800)
  }

  return (
    <button
      type="button"
      className={`qa-copy-btn${copied ? ' qa-copy-btn--done' : ''}`}
      onClick={handleClick}
      title={title}
      aria-label={title}
    >
      {copied ? <><Icon name="check" /> Copied</> : <><Icon name="copy" /> {label}</>}
    </button>
  )
}
