// Courthouse photo behind the sign-in pages. It is its own layer sized to the screen, not to the page, so the photo
// keeps its size when the page grows or shrinks (switching tabs, error messages, the phone keyboard opening)
export default function AuthBackdrop() {
  return <div className="auth-backdrop" aria-hidden="true" />
}
