import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import FloatingList, { inFloatingList } from './FloatingList'
import { useApp } from '../../context/AppContext'
import { legalForms as legalFormsApi } from '../../services/api'
import { buildFillValues, fillWindowUrl, getFormFields } from '../../utils/legalForms'

import Icon from './Icon'
import PdfFormViewer from './PdfFormViewer'
import { getErrorMessage } from '../../utils/errorMessages'
// Text shown for a case in the picker, "Title - Case No"
const caseLabel = c => (c.title || c.name || 'Case') + (c.caseNo ? ` - ${c.caseNo}` : '')

// All the case fields the search box matches against, lower-cased
const caseSearchText = c => [
  c.title, c.name, c.caseNo, c.clientName, c.firNo, c.policeStation, c.opposingParty,
  ...(c.additionalClients || []).map(x => x?.name),
].filter(Boolean).join(' ').toLowerCase()

// Window to pick a case and fill a legal form with its details
export default function FormFillWindow({ form, initialCaseId = '', standalone = false, onClose }) {
  // All cases, used for the picker and for filling the form
  const { cases = [] } = useApp()

  // Case the form is being filled for (empty means the blank form)
  const [selectedCase, setSelectedCase] = useState('')
  // Text in the case search box and whether its result list is open
  const [query, setQuery] = useState('')
  const [listOpen, setListOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const searchRef = useRef(null)
  // Blob URL of the form preview, plus loading and error state for it
  const [viewUrl, setViewUrl] = useState('')
  const [viewBusy, setViewBusy] = useState(false)
  const [viewError, setViewError] = useState('')
  // Width to height ratio of the form page, so the preview frame can match it
  const [pageRatio, setPageRatio] = useState(0)
  const [ratioDone, setRatioDone] = useState(false)

  // Date layout of each date field, so the boxes on the form get their separators while typing
  const dateFormats = useMemo(() => {
    const map = {}
    getFormFields(form).filter(f => f.type === 'date').forEach(f => { map[f.name] = f.dateFormat || 'dd/mm/yyyy' })
    return map
  }, [form])
  // The form viewer, asked for the PDF with everything typed into it
  const viewerRef = useRef(null)
  const [saving, setSaving] = useState(false)
  // True while the form is being prepared for printing
  const [printing, setPrinting] = useState(false)

  // Current preview URL, kept so it can be released
  const urlRef = useRef('')
  // Counter to ignore responses from older requests
  const seqRef = useRef(0)
  // Case id passed in by the caller, applied once the cases have loaded
  const pendingCaseRef = useRef(String(initialCaseId || ''))

  // Swap in a new preview URL and release the previous one
  function showUrl(url) {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = url
    setViewUrl(url)
  }

  // Load the blank form preview when the form changes
  useEffect(() => {
    let alive = true
    const seq = ++seqRef.current
    setViewBusy(true)
    setViewError('')
    legalFormsApi.previewBlob(form.id)
      .then(url => {
        if (!alive || seq !== seqRef.current) { URL.revokeObjectURL(url); return }
        showUrl(url)
      })
      .catch(e => { if (alive) setViewError(getErrorMessage(e, 'Could not open the form.')) })
      .finally(() => { if (alive && seq === seqRef.current) setViewBusy(false) })
    return () => { alive = false }
  }, [form.id])

  // Load the page size of the form to get its aspect ratio
  useEffect(() => {
    let alive = true
    setRatioDone(false)
    legalFormsApi.viewSize(form.id)
      .then(info => {
        if (alive && info?.width > 0 && info?.height > 0) setPageRatio(info.width / info.height)
      })
      .catch(() => {})
      .finally(() => { if (alive) setRatioDone(true) })
    return () => { alive = false }
  }, [form.id])

  // Release the preview URL when the window closes
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current) }, [])

  // In the standalone tab, keep the selected case in the page URL (?caseId=), replacing the entry so Back is not filled with changes
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    if (!standalone) return
    if ((searchParams.get('caseId') || '') === String(selectedCase || '')) return
    const next = new URLSearchParams(searchParams)
    if (selectedCase) next.set('caseId', selectedCase)
    else next.delete('caseId')
    setSearchParams(next, { replace: true })
    // searchParams and setSearchParams change with every URL update: only a new selection should trigger this
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCase, standalone])

  // In the standalone tab, set the browser tab title to the form name
  useEffect(() => {
    if (!standalone) return
    const previous = document.title
    document.title = `${form.name || 'Legal Form'} — InterNyay`
    return () => { document.title = previous }
  }, [standalone, form.name])

  // Cases matching every word typed in the search box (max 50)
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const words = q.split(/\s+/)
    return cases
      .filter(c => { const hay = caseSearchText(c); return words.every(w => hay.includes(w)) })
      .slice(0, 50)
  }, [cases, query])

  // Show the selected case's label in the search box
  useEffect(() => {
    if (!selectedCase) return
    const c = cases.find(x => String(x.id) === String(selectedCase))
    if (c) setQuery(caseLabel(c))
  }, [selectedCase, cases])

  // While the result list is open, a click outside closes it
  useEffect(() => {
    if (!listOpen) return undefined
    // Close the case list when the click lands outside the search box
    const onDown = e => {
      if (searchRef.current && !searchRef.current.contains(e.target) && !inFloatingList(e.target)) setListOpen(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [listOpen])

  // Typing clears any selected case and reopens the list
  function onQueryChange(text) {
    setQuery(text)
    setListOpen(true)
    setActive(-1)
    if (selectedCase) chooseCase('')
  }

  // Select a case from the list and fill the form with it
  function pickCase(c) {
    setQuery(caseLabel(c))
    setListOpen(false)
    setActive(-1)
    chooseCase(String(c.id))
  }

  // Clear the search and go back to the blank form
  function clearCase() {
    setQuery('')
    setListOpen(false)
    if (selectedCase) chooseCase('')
  }

  // Arrow keys move through results, Enter picks one, Escape or Tab closes the list
  function onSearchKeyDown(e) {
    if (e.key === 'Escape' || e.key === 'Tab') { setListOpen(false); return }
    if (e.key === 'ArrowDown') {
      e.preventDefault(); setListOpen(true)
      setActive(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); setActive(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && listOpen && results[active]) {
      e.preventDefault(); pickCase(results[active])
    }
  }

  // Fill the form from the chosen case, or show the blank form when none is chosen; late responses from older picks are dropped
  async function chooseCase(caseId) {
    pendingCaseRef.current = ''
    setSelectedCase(caseId)
    const seq = ++seqRef.current
    setViewError('')
    setViewBusy(true)
    try {
      let url
      if (!caseId) {
        url = await legalFormsApi.previewBlob(form.id)
      } else {
        const caseObj = cases.find(c => String(c.id) === String(caseId))
        url = await legalFormsApi.fillBlob(form.id, buildFillValues(form, caseObj))
      }
      if (seq !== seqRef.current) { URL.revokeObjectURL(url); return }
      showUrl(url)
    } catch (e) {
      setViewError(getErrorMessage(e, 'Could not fill the form.'))
    } finally {
      if (seq === seqRef.current) setViewBusy(false)
    }
  }

  // Download the form as it is on screen: case details and anything typed into the boxes
  async function downloadFilled() {
    setSaving(true)
    try {
      const bytes = await viewerRef.current?.getBytes()
      const blob = bytes ? new Blob([bytes], { type: 'application/pdf' }) : null
      const href = blob ? URL.createObjectURL(blob) : viewUrl
      if (!href) return
      const a = document.createElement('a')
      a.href = href
      a.download = `${form.name} (filled).pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      if (blob) setTimeout(() => URL.revokeObjectURL(href), 60000)
    } catch (e) {
      setViewError(getErrorMessage(e, 'Could not download the form.'))
    } finally {
      setSaving(false)
    }
  }

  // Print the form as it is on screen: case details and anything typed into the boxes.
  // The PDF is loaded into a hidden frame and the browser's print dialog is opened for it
  async function printFilled() {
    setPrinting(true)
    setViewError('')
    try {
      const bytes = await viewerRef.current?.getBytes()
      const blob = bytes ? new Blob([bytes], { type: 'application/pdf' }) : null
      const href = blob ? URL.createObjectURL(blob) : viewUrl
      if (!href) return

      const frame = document.createElement('iframe')
      frame.setAttribute('aria-hidden', 'true')
      frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
      // Remove the frame and release the PDF after printing (or after a while if the dialog never reports back)
      let cleaned = false
      const cleanup = () => {
        if (cleaned) return
        cleaned = true
        frame.remove()
        if (blob) URL.revokeObjectURL(href)
      }
      frame.onload = () => {
        try {
          const win = frame.contentWindow
          win.focus()
          win.addEventListener('afterprint', cleanup)
          win.print()
        } catch (e) {
          // The browser would not print from the hidden frame: open the PDF in a tab so it can be printed from there
          console.warn('Printing from the hidden frame failed', e)
          window.open(href, '_blank')
        }
        setTimeout(cleanup, 5 * 60 * 1000)
      }
      frame.src = href
      document.body.appendChild(frame)
    } catch (e) {
      setViewError(getErrorMessage(e, 'Could not print the form.'))
    } finally {
      setPrinting(false)
    }
  }

  // Open the filled form in its own browser tab
  function openInNewTab() {
    window.open(fillWindowUrl(form.id, selectedCase), '_blank')
  }

  return (
    <div
      className="modal pdf-modal pdf-modal--fill"
      style={{ ...(pageRatio ? { '--page-ratio': pageRatio } : null), ...(ratioDone ? null : { visibility: 'hidden' }) }}
      data-shaped={pageRatio ? 'true' : undefined}
      onClick={e => e.stopPropagation()}
    >
      <div className="modal__header">
        <h2 className="modal__title">{form.name}</h2>
        <div className="pdf-modal__actions">
          {!standalone && (
            <button
              type="button"
              className="btn-outline btn-outline--sm"
              title="Open this window in a new tab"
              onClick={openInNewTab}
            >
              <Icon name="copy" /> Open in new tab
            </button>
          )}
          <button
            type="button"
            className="btn-outline btn-outline--sm"
            title="Print the form with everything filled in"
            disabled={!viewUrl || printing || saving}
            onClick={printFilled}
          >
            <Icon name="print" /> {printing ? 'Preparing…' : 'Print'}
          </button>
          <button
            type="button"
            className="btn-outline btn-outline--sm"
            title="Download the form with everything filled in"
            disabled={!viewUrl || saving}
            onClick={downloadFilled}
          >
            <Icon name="download" /> {saving ? 'Saving…' : 'Download'}
          </button>
          {!standalone && <button aria-label="Close" title="Close" type="button" className="btn-icon" onClick={onClose}><Icon name="close" /></button>}
        </div>
      </div>

      <div className="legal-fill__case">
        <label className="form-label u-m-0" >Case</label>
        <div className="picker__field legal-fill__search" ref={searchRef}>
          <input
            className="form-input"
            type="text"
            role="combobox"
            aria-expanded={listOpen && results.length > 0}
            aria-autocomplete="list"
            placeholder="Type to search a case (title, client, case no…)"
            autoComplete="off"
            value={query}
            onChange={e => onQueryChange(e.target.value)}
            onFocus={() => { if (query.trim() && !selectedCase) setListOpen(true) }}
            onKeyDown={onSearchKeyDown}
          />
          {query && (
            <button type="button" className="legal-fill__clear" title="Clear" aria-label="Clear selected case" onClick={clearCase}><Icon name="close" /></button>
          )}

          {listOpen && query.trim() && (
            <FloatingList className="picker__list" role="listbox">
              {results.length === 0 && <div className="picker__option" style={{ cursor: 'default' }}>No matching case</div>}
              {results.map((c, i) => (
                <button
                  type="button"
                  key={c.id}
                  role="option"
                  aria-selected={i === active}
                  className={`picker__option${i === active ? ' picker__option--active' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pickCase(c)}
                >
                  {caseLabel(c)}
                  {c.clientName && <span className="picker__option-sub">{c.clientName}</span>}
                </button>
              ))}
            </FloatingList>
          )}
        </div>
        {viewBusy && <span className="admin__hint">Loading…</span>}
      </div>

      {viewError && <p className="text-error" style={{ margin: '0 0 8px' }}>{viewError}</p>}

      {viewUrl && ratioDone && (
        <div className="legal-fill__stage">
          <PdfFormViewer
            ref={viewerRef}
            url={viewUrl}
            dateFormats={dateFormats}
            title={form.name}
            className="pdf-modal__frame"
          />
        </div>
      )}
    </div>
  )
}
