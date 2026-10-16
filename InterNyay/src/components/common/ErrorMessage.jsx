
// Shared error box: soft red background, left accent bar and a warning icon (the icon is drawn by CSS).
// Renders nothing when there is no message, so it can be dropped in as <ErrorMessage message={error} />
export default function ErrorMessage({ message, className = '' }) {
  if (!message) return null

  return (
    <div className={`alert-error ${className}`.trim()} role="alert" aria-live="assertive">
      <span>{message}</span>
    </div>
  )
}
