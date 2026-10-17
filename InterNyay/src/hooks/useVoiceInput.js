import { useCallback, useEffect, useRef, useState } from 'react'

// Languages the assistant can listen in. The browser's own speech engine needs the language up front.
// Hindi mode also understands English words said in between (Hinglish).
// Which of these work depends on the browser: Chrome and Edge support all of them, Safari fewer, Firefox none.
export const VOICE_LANGUAGES = [
  { code: 'en-IN', label: 'English' },
  { code: 'hi-IN', label: 'हिन्दी (Hindi)' },
  { code: 'pa-IN', label: 'ਪੰਜਾਬੀ (Punjabi)' },
  { code: 'bn-IN', label: 'বাংলা (Bengali)' },
  { code: 'mr-IN', label: 'मराठी (Marathi)' },
  { code: 'gu-IN', label: 'ગુજરાતી (Gujarati)' },
  { code: 'ta-IN', label: 'தமிழ் (Tamil)' },
  { code: 'te-IN', label: 'తెలుగు (Telugu)' },
  { code: 'kn-IN', label: 'ಕನ್ನಡ (Kannada)' },
  { code: 'ml-IN', label: 'മലയാളം (Malayalam)' },
  { code: 'ur-IN', label: 'اردو (Urdu)' },
]

const LANG_KEY = 'internyay.voiceLang'
const DEFAULT_LANG = 'en-IN'

// Last language the person chose (kept in this browser only); English when nothing valid is saved or storage is blocked
// (an old saved "auto" choice from before auto-detect was removed also falls back to English)
function loadLang() {
  try {
    const saved = window.localStorage.getItem(LANG_KEY)
    if (VOICE_LANGUAGES.some(l => l.code === saved)) return saved
  } catch { /* storage unavailable */ }
  return DEFAULT_LANG
}

// Plain-language reason for each speech error the browser can report
function describeError(code) {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
    case 'NotAllowedError': return 'Microphone access is blocked. Allow the microphone for this site in the browser settings.'
    case 'no-speech': return 'I did not hear anything. Tap the mic and try again.'
    case 'audio-capture':
    case 'NotFoundError': return 'No microphone was found.'
    case 'network': return 'Voice needs an internet connection. Please try again.'
    case 'language-not-supported': return 'This browser cannot listen in that language. Pick another language.'
    default: return 'Voice input stopped. Please try again.'
  }
}

// Speech to text for the chat box, using the browser's speech engine in the chosen language.
// onText(text) receives everything said so far in the current recording, live while the person speaks.
export default function useVoiceInput(onText) {
  const Recognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null
  const secure = typeof window === 'undefined' || window.isSecureContext !== false

  const [lang, setLangState] = useState(loadLang)
  const supported = secure && !!Recognition

  const [listening, setListening] = useState(false)
  const [error, setError] = useState('')

  const recognitionRef = useRef(null)
  const onTextRef = useRef(onText)
  useEffect(() => { onTextRef.current = onText }, [onText])

  const startRecognition = useCallback(() => {
    if (!Recognition || recognitionRef.current) return
    const rec = new Recognition()
    rec.lang = lang
    rec.interimResults = true
    rec.continuous = false
    rec.maxAlternatives = 1
    rec.onstart = () => setListening(true)
    rec.onresult = e => {
      let text = ''
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript
      onTextRef.current?.(text.trim())
    }
    rec.onerror = e => { if (e.error !== 'aborted') setError(describeError(e.error)) }
    rec.onend = () => { recognitionRef.current = null; setListening(false) }
    recognitionRef.current = rec
    try { rec.start() } catch { recognitionRef.current = null; setError(describeError('')) }
  }, [Recognition, lang])

  const start = useCallback(() => {
    setError('')
    startRecognition()
  }, [startRecognition])

  // Finish: what was said so far is turned into text
  const stop = useCallback(() => {
    try { recognitionRef.current?.stop() } catch { /* already stopped */ }
  }, [])

  // Throw away the current recording (chat closed, message sent, language changed)
  const cancel = useCallback(() => {
    try { recognitionRef.current?.abort() } catch { /* ignore */ }
    setListening(false)
  }, [])

  const toggle = useCallback(() => {
    if (listening) stop()
    else start()
  }, [listening, start, stop])

  const setLang = useCallback(code => {
    if (!VOICE_LANGUAGES.some(l => l.code === code)) return
    cancel()
    setLangState(code)
    setError('')
    try { window.localStorage.setItem(LANG_KEY, code) } catch { /* storage unavailable */ }
  }, [cancel])

  // Never leave the microphone on when the chat is closed or the page changes
  useEffect(() => cancel, [cancel])

  return { supported, listening, error, lang, setLang, toggle, stop, cancel }
}
