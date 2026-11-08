import { forwardRef } from 'react'
import Icon from './Icon'

// One search box used everywhere: magnifier on the left, clear (×) button on the right once there is text.
// className / wrapperClassName let a page size the box; every other prop (and the ref) goes to the <input>.
const SearchInput = forwardRef(function SearchInput(
  { value, onChange, placeholder = 'Search…', className = '', wrapperClassName = '', ...rest },
  ref
) {
  return (
    <div className={`doc-search-wrap${wrapperClassName ? ` ${wrapperClassName}` : ''}`}>
      <span className="doc-search-icon"><Icon name="search" /></span>
      <input
        ref={ref}
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
})

export default SearchInput
