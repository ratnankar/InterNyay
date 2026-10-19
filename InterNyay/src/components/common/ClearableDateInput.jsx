import Icon from './Icon'

// A date field with a small × to clear the chosen date. Drop-in for <input type="date">: the same props, and onChange
// receives an event-like { target: { value: '' } } when the date is cleared, so existing handlers keep working
export default function ClearableDateInput({ value, onChange, disabled, className = 'form-input', ...rest }) {
  const canClear = !!value && !disabled && !rest.readOnly

  return (
    <div className="date-clear">
      <input
        {...rest}
        type="date"
        className={`${className}${canClear ? ' date-clear__input' : ''}`}
        value={value}
        disabled={disabled}
        onChange={onChange}
      />
      {canClear && (
        <button
          type="button"
          className="date-clear__btn"
          aria-label="Clear the date"
          title="Clear the date"
          onClick={() => onChange({ target: { value: '', name: rest.name } })}
        >
          <Icon name="close" />
        </button>
      )}
    </div>
  )
}
