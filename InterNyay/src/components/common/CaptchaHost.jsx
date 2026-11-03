import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../../services/api'
import { registerCaptchaHost } from '../../utils/captchaDesk'
import { ApiError, getErrorMessage } from '../../utils/errorMessages'
import ModalPortal from './ModalPortal'
import Icon from './Icon'

// Mounted once at the app root. Shows the "Type the CAPTCHA" window whenever a button that reads eCourts could not have its
// CAPTCHA read automatically (see utils/captchaDesk.js), then lets that button carry on with its own work
export default function CaptchaHost() {
  // The request on screen: { challenge, resolve, reject }, or null; waiting ones queue behind it
  const [current, setCurrent] = useState(null)
  const currentRef = useRef(null)
  const queueRef = useRef([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')

  const show = useCallback(item => {
    currentRef.current = item
    setCurrent(item)
    setText('')
    setProblem(item?.challenge.message || '')
    setBusy(false)
  }, [])

  useEffect(() => registerCaptchaHost(challenge => new Promise((resolve, reject) => {
    const item = { challenge, resolve, reject }
    if (currentRef.current) queueRef.current.push(item)
    else show(item)
  })), [show])

  // Ends the request on screen and shows the next waiting one
  const finish = useCallback(settle => {
    const item = currentRef.current
    if (!item) return
    settle(item)
    show(queueRef.current.shift() || null)
  }, [show])

  async function submit(e) {
    e.preventDefault()
    if (busy || !current) return
    if (!text.trim()) { setProblem('Type the CAPTCHA shown in the picture'); return }
    setBusy(true)
    setProblem('')

    try {
      const res = await api.captcha.answer(current.challenge.challengeId, text.trim())

      if (res && res.needsCaptcha === true) {
        // Wrong CAPTCHA: a new picture to type
        const next = { ...current, challenge: res }
        currentRef.current = next
        setCurrent(next)
        setText('')
        setProblem(res.message || 'The CAPTCHA was wrong, type the new one')
        setBusy(false)
        return
      }
      finish(item => item.resolve(res))
    } catch (err) {
      finish(item => item.reject(err))
    }
  }

  async function newPicture() {
    if (busy || !current) return
    setBusy(true)
    try {
      const res = await api.captcha.refresh(current.challenge.challengeId)
      const next = { ...current, challenge: res }
      currentRef.current = next
      setCurrent(next)
      setText('')
      setProblem('')
      setBusy(false)
    } catch (err) {
      setProblem(getErrorMessage(err, 'Could not get a new CAPTCHA'))
      setBusy(false)
    }
  }

  const cancel = useCallback(() => {
    const item = currentRef.current
    if (!item) return
    api.captcha.cancel(item.challenge.challengeId).catch(() => {})
    finish(i => i.reject(new ApiError('CAPTCHA was not entered, nothing was changed')))
  }, [finish])

  // Escape closes only this window
  useEffect(() => {
    if (!current) return undefined
    const onKey = e => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      cancel()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [current, cancel])

  if (!current) return null

  return (
    <ModalPortal>
      <div className="overlay overlay--stacked">
        <div className="modal modal--sm" role="dialog" aria-modal="true" aria-labelledby="captcha-title">
          <div className="modal__header">
            <h2 className="modal__title" id="captcha-title">Type the CAPTCHA</h2>
            <button aria-label="Close" title="Close" type="button" className="btn-icon" onClick={cancel}>
              <Icon name="close" />
            </button>
          </div>

          <form onSubmit={submit}>
            <p className="case-parties__hint u-mb-6">
              eCourts needs a CAPTCHA before it shows this. Type the letters and numbers shown in the picture.
            </p>

            <div className="cnr-captcha">
              <img className="cnr-captcha__img" src={current.challenge.captchaImage} alt="CAPTCHA from eCourts" />
              <button type="button" className="btn-refresh" onClick={newPicture} disabled={busy}
                title="New picture" aria-label="New picture"><Icon name="refresh" /></button>
            </div>

            <input
              className="form-input u-mt-10"
              placeholder="CAPTCHA"
              maxLength={12}
              value={text}
              autoFocus
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              disabled={busy}
              onChange={e => { setText(e.target.value); setProblem('') }}
            />

            {problem && <p className="case-judge-hint case-judge-hint--none u-mt-6" role="alert">{problem}</p>}

            <div className="form-actions">
              <button type="button" className="btn-outline" onClick={cancel}>Cancel</button>
              <button type="submit" className="btn-gold" disabled={busy}>{busy ? 'Checking…' : 'Submit'}</button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  )
}
