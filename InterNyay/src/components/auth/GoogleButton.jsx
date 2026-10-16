import { useEffect, useRef, useState } from 'react'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
export const googleEnabled = GOOGLE_CLIENT_ID !== ''

const GSI_SRC = 'https://accounts.google.com/gsi/client'

let gsiPromise = null
let initialized = false
let activeHandler = null

function loadGsi() {
  if (window.google?.accounts?.id) return Promise.resolve()

  if (!gsiPromise) {
    gsiPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = GSI_SRC
      script.async = true
      script.defer = true
      script.onload = resolve
      script.onerror = () => {
        gsiPromise = null
        reject(new Error('Google sign-in could not load. Check your internet connection and try again.'))
      }
      document.head.appendChild(script)
    })
  }

  return gsiPromise
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" width="19" height="19" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

export default function GoogleButton({ onCredential }) {
  const holder = useRef(null)
  const latest = useRef(onCredential)
  const [failed, setFailed] = useState(false)

  useEffect(() => { latest.current = onCredential }, [onCredential])

  useEffect(() => {
    let cancelled = false

    loadGsi()
      .then(() => {
        if (cancelled || !holder.current) return

        const gid = window.google.accounts.id

        if (!initialized) {
          gid.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: response => activeHandler?.(response.credential),
          })
          initialized = true
        }

        activeHandler = credential => latest.current?.(credential)

        const width = Math.min(400, Math.max(200, Math.floor(holder.current.getBoundingClientRect().width)))

        holder.current.innerHTML = ''
        gid.renderButton(holder.current, {
          type: 'standard',
          size: 'large',
          width,
        })
      })
      .catch(() => { if (!cancelled) setFailed(true) })

    return () => { cancelled = true }
  }, [])

  if (failed) {
    return (
      <p className="auth-hint auth-hint--center">
        Google sign-in is unavailable right now. Check your connection and reload, or use your email.
      </p>
    )
  }

  return (
    <div className="auth-google">
      <span className="auth-google__face">
        <GoogleLogo />
        <span>Continue with Google</span>
      </span>
      <div ref={holder} className="auth-google__hit" />
    </div>
  )
}
