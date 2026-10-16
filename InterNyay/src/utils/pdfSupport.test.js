import { afterEach, describe, expect, it, vi } from 'vitest'
import { canEmbedPdf } from './pdfSupport'

function setNavigator(props) {
  vi.stubGlobal('navigator', { userAgent: '', maxTouchPoints: 0, ...props })
}

describe('canEmbedPdf', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('is true for a desktop browser with a built-in PDF viewer', () => {
    setNavigator({ pdfViewerEnabled: true, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130' })
    expect(canEmbedPdf()).toBe(true)
  })
  it('is false for Android Chrome (no PDF viewer)', () => {
    setNavigator({ pdfViewerEnabled: false, userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-X710) Chrome/130' })
    expect(canEmbedPdf()).toBe(false)
  })
  it('is false for an Android phone requesting the desktop site', () => {
    setNavigator({
      pdfViewerEnabled: true,
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130',
      userAgentData: { mobile: true, platform: 'Android' },
    })
    expect(canEmbedPdf()).toBe(false)
  })
  it('is false for iPhone and iPad, including iPadOS posing as a Mac', () => {
    setNavigator({ pdfViewerEnabled: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148' })
    expect(canEmbedPdf()).toBe(false)
    setNavigator({ pdfViewerEnabled: true, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 })
    expect(canEmbedPdf()).toBe(false)
  })
  it('is true for a real Mac without a touch screen', () => {
    setNavigator({ pdfViewerEnabled: true, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' })
    expect(canEmbedPdf()).toBe(true)
  })
})
