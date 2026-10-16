// Props that make a non-button element act like a button (click, Enter and Space), for clickable rows and cards
export function clickableProps(onActivate) {
  return {
    role: 'button',
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (e) => {
      if (e.target !== e.currentTarget) return
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivate(e) }
    },
  }
}
