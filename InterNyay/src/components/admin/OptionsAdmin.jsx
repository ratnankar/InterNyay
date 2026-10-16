import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../../services/api'
import { useApp } from '../../context/AppContext'
import { getErrorMessage } from '../../utils/errorMessages'
import { confirmDialog } from '../../utils/confirmDialog'
import { loadOptions } from '../../constants/optionsStore'
import Icon from '../common/Icon'
import useDragReorder from '../../hooks/useDragReorder'
import useSessionState from '../../hooks/useSessionState'

// Case relief and case type are edited together as one "Case catalogue"
const CATALOGUE = 'CASE_CATALOGUE'
const NATURES = ['Civil', 'Criminal']
const SEP = '||'

// Choices of one list under one parent, add / rename / hide / reorder / delete
function ChoiceTable({ info, items, parent, onChanged, extraAction, isOpen, renderBelow, compact }) {
  const { addToast } = useApp()
  const [editId, setEditId] = useState(null)
  const [draft, setDraft] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [busy, setBusy] = useState(false)

  // Runs a change, then refreshes the lists
  const run = async (fn, okMessage) => {
    setBusy(true)
    try {
      await fn()
      await onChanged()
      if (okMessage) addToast(okMessage, 'success')
      return true
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not save the change'), 'error')
      return false
    } finally {
      setBusy(false)
    }
  }

  // Press and hold the grip and drag a choice to any place in one go; the server is told the new place once, on release
  const drag = useDragReorder(items.map(i => i.id), (_start, finalKeys, movedKey) =>
    run(() => api.admin.options.moveTo(Number(movedKey), finalKeys.indexOf(movedKey))))

  const add = async e => {
    e.preventDefault()
    if (!newLabel.trim()) return
    const ok = await run(() => api.admin.options.create({ listKey: info.key, parent, label: newLabel.trim() }), 'Added')
    if (ok) setNewLabel('')
  }

  const saveEdit = async item => {
    const label = draft.trim()
    if (!label) return
    if (label === item.label) { setEditId(null); return }
    const body = info.keyed ? { label } : { label, value: label }
    if (await run(() => api.admin.options.update(item.id, body), 'Saved')) setEditId(null)
  }

  const toggle = item => run(() => api.admin.options.update(item.id, {
    label: item.label, value: item.value, enabled: !item.enabled,
  }), item.enabled ? 'Hidden from the app' : 'Shown in the app')

  const remove = async item => {
    const extra = info.key === 'CASE_RELIEF' ? ' and every case type under it' : ''
    if (!(await confirmDialog({
      message: `Delete "${item.label}"${extra}? Cases that already use it keep their saved text. To only stop offering it, use Hide instead.`,
      confirmLabel: 'Delete', danger: true,
    }))) return
    run(() => api.admin.options.remove(item.id), 'Deleted')
  }

  return (
    <div className="options-admin__table">
      {items.length === 0 && <p className="admin__hint">Nothing here yet.</p>}

      {drag.ordered(items, it => it.id).map((item, i) => (
        <div key={item.id} ref={drag.rowRef(item.id)} style={drag.rowStyle(item.id)} className={`options-admin__item${isOpen && isOpen(item) ? ' options-admin__item--open' : ''}`}>
        <div className={`options-admin__row${item.enabled ? '' : ' options-admin__row--hidden'}`}>
          <div className="options-admin__name">
            {editId === item.id ? (
              <input className="form-input" autoFocus value={draft} maxLength={255}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveEdit(item); if (e.key === 'Escape') setEditId(null) }} />
            ) : (
              <span>{item.label}</span>
            )}
            {item.locked && <span className="options-admin__tag" title="The app's own rules depend on this choice">Used by the app</span>}
            {!item.enabled && <span className="options-admin__tag options-admin__tag--hidden">Hidden</span>}
            {items.length > 1 && !busy && (
              <button type="button" {...drag.gripProps(item.id)}
                style={{ ...drag.gripProps(item.id).style, marginLeft: 'auto', background: 'none', border: 'none', padding: '0 6px', fontSize: 18, lineHeight: 1, color: 'inherit' }}>⠿</button>
            )}
          </div>

          {/* Fixed slots, so every row's buttons line up in the same columns whatever a row can do */}
          <div className={`options-admin__actions${extraAction ? ' options-admin__actions--toggle' : ''}${compact ? ' options-admin__actions--compact' : ''}`}>
            {extraAction && extraAction(item)}

            <button type="button" className="btn-outline btn-outline--sm" disabled={busy || i === 0}
              aria-label="Move up" onClick={() => run(() => api.admin.options.move(item.id, 'up'))}>↑</button>
            <button type="button" className="btn-outline btn-outline--sm" disabled={busy || i === items.length - 1}
              aria-label="Move down" onClick={() => run(() => api.admin.options.move(item.id, 'down'))}>↓</button>

            {editId === item.id ? (
              <>
                <button type="button" className="btn-gold btn-outline--sm" disabled={busy} aria-label="Save" title="Save" onClick={() => saveEdit(item)}>{compact ? <Icon name="check" size={16} /> : 'Save'}</button>
                <button type="button" className="btn-outline btn-outline--sm" aria-label="Cancel" title="Cancel" onClick={() => setEditId(null)}>{compact ? <Icon name="close" size={16} /> : 'Cancel'}</button>
              </>
            ) : (
              <>
                {(!item.locked || info.keyed) ? (
                  <button type="button" className="btn-outline btn-outline--sm" disabled={busy}
                    aria-label="Rename" title="Rename"
                    onClick={() => { setEditId(item.id); setDraft(item.label) }}>{compact ? <Icon name="edit" size={15} /> : 'Rename'}</button>
                ) : <span />}

                {!item.locked ? (
                  <button type="button" className="btn-outline btn-outline--sm" disabled={busy}
                    aria-label={item.enabled ? 'Hide' : 'Show'} title={item.enabled ? 'Hide from the app' : 'Show in the app'}
                    onClick={() => toggle(item)}>
                    {compact ? <Icon name={item.enabled ? 'eye-off' : 'eye'} size={16} /> : (item.enabled ? 'Hide' : 'Show')}
                  </button>
                ) : <span />}
              </>
            )}

            {!item.locked && info.deletable && editId !== item.id && !(info.key === 'CLIENT_TYPE' && item.value === 'INDIVIDUAL') ? (
              <button type="button" className="btn-outline btn-outline--sm btn-outline--danger" disabled={busy}
                aria-label="Delete" title="Delete"
                onClick={() => remove(item)}>{compact ? <Icon name="trash" size={15} /> : 'Delete'}</button>
            ) : <span />}
          </div>
        </div>
        {renderBelow && renderBelow(item)}
        </div>
      ))}

      {(!info.keyed || info.key === 'CLIENT_TYPE') && (
        <form className="options-admin__add" onSubmit={add}>
          <input className="form-input" placeholder={info.key === 'CLIENT_TYPE' ? 'Add back a deleted client type' : `Add to ${info.title.toLowerCase()}`} maxLength={255}
            value={newLabel} onChange={e => setNewLabel(e.target.value)} />
          <button type="submit" className="btn-gold" disabled={busy || !newLabel.trim()}>+ Add</button>
        </form>
      )}
    </div>
  )
}

// Admin screen for the dropdown choices that used to be fixed in the app
export default function OptionsAdmin() {
  const { addToast } = useApp()
  const [lists, setLists] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useSessionState('admin_options_active', CATALOGUE)
  const [nature, setNature] = useState(NATURES[0])
  const [relief, setRelief] = useState(null)

  // Reads every choice again, and refreshes the lists the rest of the app is using
  const reload = useCallback(async () => {
    const data = await api.admin.options.list()
    setLists(data.lists)
    setItems(data.items)
    loadOptions()
  }, [])

  useEffect(() => {
    reload()
      .catch(e => addToast(getErrorMessage(e, 'Could not load the dropdown choices'), 'error'))
      .finally(() => setLoading(false))
  }, [])

  const info = key => lists.find(l => l.key === key)
  const itemsOf = (key, parent = '') => items.filter(i => i.listKey === key && i.parent === parent)

  // Menu: the case catalogue first, then every other list
  const menu = useMemo(() => [
    { key: CATALOGUE, title: 'Case catalogue (relief & case type)' },
    ...lists.filter(l => l.key !== 'CASE_RELIEF' && l.key !== 'CASE_TYPE'),
  ], [lists])

  const reliefs = itemsOf('CASE_RELIEF', nature)

  if (loading) return <p className="admin__hint">Loading…</p>

  return (
    <div className="options-admin">
      <p className="admin__hint">
        These are the choices offered in the app's dropdowns. Rename or reorder them, hide one to stop offering it, or delete it.
        Cases and clients that already use a choice keep their saved text. Changes reach the app the next time a page is opened.
      </p>

      <div className="options-admin__lists" role="tablist">
        {menu.map(m => (
          <button key={m.key} type="button" role="tab" aria-selected={active === m.key}
            className={`options-admin__list${active === m.key ? ' options-admin__list--active' : ''}`}
            onClick={() => setActive(m.key)}>{m.title}</button>
        ))}
      </div>

      {active === CATALOGUE ? (
        <div className="options-admin__panel">
          <div className="options-admin__lists" role="tablist" aria-label="Nature of case">
            {NATURES.map(n => (
              <button key={n} type="button" role="tab" aria-selected={nature === n}
                className={`options-admin__list${nature === n ? ' options-admin__list--active' : ''}`}
                onClick={() => { setNature(n); setRelief(null) }}>{n}</button>
            ))}
          </div>

          <h3 className="options-admin__heading">{nature} — relief / category</h3>
          <ChoiceTable info={info('CASE_RELIEF') || { key: 'CASE_RELIEF', title: 'relief', keyed: false, deletable: true }}
            items={reliefs} parent={nature} onChanged={reload}
            isOpen={item => relief === item.value}
            extraAction={item => {
              const open = relief === item.value
              const count = itemsOf('CASE_TYPE', `${nature}${SEP}${item.value}`).length
              return (
                <button type="button" className="btn-outline btn-outline--sm options-admin__toggle" aria-expanded={open}
                  onClick={() => setRelief(open ? null : item.value)}>
                  Case types ({count}) <span aria-hidden="true">{open ? '▴' : '▾'}</span>
                </button>
              )
            }}
            renderBelow={item => relief === item.value && (
              <div className="options-admin__nested">
                <h4 className="options-admin__subheading">
                  <span>Case types under {item.label}</span>
                  <span className="options-admin__count">{itemsOf('CASE_TYPE', `${nature}${SEP}${item.value}`).length}</span>
                </h4>
                <ChoiceTable info={info('CASE_TYPE') || { key: 'CASE_TYPE', title: 'case type', keyed: false, deletable: true }}
                  items={itemsOf('CASE_TYPE', `${nature}${SEP}${item.value}`)}
                  parent={`${nature}${SEP}${item.value}`} onChanged={reload} compact />
              </div>
            )} />
        </div>
      ) : (
        <div className="options-admin__panel">
          {info(active)?.keyed && (
            <p className="admin__hint">{active === 'CLIENT_TYPE'
              ? 'The app only supports these client types. You can rename or delete them (Individual is the default and stays), and add a deleted one back.'
              : "The choices of this list are fixed because the app's data depends on them. You can change the wording."}</p>
          )}
          {info(active) && <ChoiceTable key={active} info={info(active)} items={itemsOf(active)} parent="" onChanged={reload} />}
        </div>
      )}
    </div>
  )
}