// Controlled on/off switch; stopPropagation stops clicks from triggering the parent row
export default function ToggleSwitch({ checked, onChange, disabled = false, label, title }) {
  return (
    <label
      className={`wa-switch${disabled ? ' wa-switch--disabled' : ''}`}
      title={title}
      onClick={e => e.stopPropagation()}
    >
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <span className="wa-switch__track"><span className="wa-switch__thumb" /></span>
      {label && <span className="wa-switch__label">{label}</span>}
    </label>
  )
}
