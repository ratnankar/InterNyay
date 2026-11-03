// The CAPTCHA window for buttons that read eCourts. When the server cannot read a CAPTCHA by itself it answers with a
// challenge ({ needsCaptcha, challengeId, captchaImage, message }); askCaptcha shows it in the window and resolves with
// what the button would have returned once the typed CAPTCHA was accepted. The mounted <CaptchaHost /> registers itself here.

let host = null

// Called by CaptchaHost when it mounts and unmounts
export function registerCaptchaHost(fn) {
  host = fn
  return () => { if (host === fn) host = null }
}

// Shows the window and waits for the result (rejects when the window is closed without a CAPTCHA)
export function askCaptcha(challenge) {
  if (!host) return Promise.reject(new Error('The CAPTCHA window could not be opened, please try again'))
  return host(challenge)
}

// True for the server's "type the CAPTCHA" answer
export function isCaptchaChallenge(res) {
  return !!res && res.needsCaptcha === true && !!res.challengeId
}
