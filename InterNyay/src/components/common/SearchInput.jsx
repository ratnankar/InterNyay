import Icon from './Icon'

// One search box used everywhere: magnifier on the left, clear (×) button on the right once there is text.
// className / wrapperClassName let a page size the box; every other prop goes to the <input>.
export default function SearchInput({ value, onChange, placeholder = 'Search…', className = '', wrapperClassName = '', ...rest }) {
  return (
    <div className={`doc-search-wrap${wrapperClassName ? ` ${wrapperClassName}` : ''}`}>
      <span className="doc-search-icon"><Icon name="search" /></span>
      <input
        type="text"
        autoComplete="off"
        className={`form-input doc-search-input${className ? ` ${className}` : ''}`}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        {...rest}
      />
      {value && (
        <button type="button" className="doc-search-clear" aria-label="Clear search" onClick={() => onChange('')}>
          <Icon name="close" />
        </button>
      )}
    </div>
  )
}
