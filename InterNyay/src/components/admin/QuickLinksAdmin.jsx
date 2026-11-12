import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../../context/AppContext'
import api from '../../services/api'
import useOverlayClose from '../../hooks/useOverlayClose'
import useQuickLinks from '../../hooks/useQuickLinks'
import Dropdown from '../common/Dropdown'
import Icon from '../common/Icon'
import ModalPortal from '../common/ModalPortal'
import { LINK_ICONS, DEFAULT_LINK_ICON } from '../../constants/linkIcons'
import { getErrorMessage } from '../../utils/errorMessages'
import { confirmDialog } from '../../utils/confirmDialog'

const URL_PATTERN = /^https?:\/\/\S+$/i

const blankLink = groupId => ({
  groupId,
  label: '',
  description: '',
  url: '',
  icon: DEFAULT_LINK_ICON,
  enabled: true,
})

const moveItem = (list, index, step) => {
  const target = index + step
  if (target < 0 || target >= list.length) return null
  const next = [...list]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

export default function QuickLinksAdmin() {
  const { addToast } = useApp()
  const [groups, setGroups] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [groupEditor, setGroupEditor] = useState(null)
  const [linkEditor, setLinkEditor] = useState(null)
  const [errors, setErrors] = useState({})

  const apply = useCallback(res => {
    setGroups(res?.groups || [])
    useQuickLinks.publish({
      groups: (res?.groups || [])
        .map(g => ({ ...g, links: g.links.filter(l => l.enabled) }))
        .filter(g => g.links.length > 0),
    })
  }, [])

  const load = useCallback(async () => {
    setError('')
    try {
      apply(await api.quickLinks.admin.directory())
    } catch (e) {
      setError(getErrorMessage(e, 'Could not load important links'))
    }
  }, [apply])

  useEffect(() => { load() }, [load])

  const closeGroup = useCallback(() => setGroupEditor(null), [])
  const closeLink = useCallback(() => setLinkEditor(null), [])
  const groupOverlay = useOverlayClose(closeGroup, { backdrop: false })
  const linkOverlay = useOverlayClose(closeLink, { backdrop: false })

  async function run(action, okMessage, failMessage) {
    setBusy(true)
    try {
      apply(await action())
      if (okMessage) addToast(okMessage)
      return true
    } catch (e) {
      addToast(getErrorMessage(e, failMessage), 'error')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function saveGroup() {
    const title = groupEditor.title.trim()
    if (!title) {
      setErrors({ title: 'Group name is required' })
      return
    }
    const ok = await run(
      () => groupEditor.id
        ? api.quickLinks.admin.updateGroup(groupEditor.id, { title })
        : api.quickLinks.admin.createGroup({ title }),
      'Saved',
      'Save failed'
    )
    if (ok) setGroupEditor(null)
  }

  async function removeGroup(group) {
    const count = group.links.length
    const message = count
      ? `Delete "${group.title}" and its ${count} link${count === 1 ? '' : 's'}?`
      : `Delete "${group.title}"?`
    if (!await confirmDialog(message)) return
    await run(() => api.quickLinks.admin.removeGroup(group.id), 'Deleted', 'Delete failed')
  }

  async function moveGroup(index, step) {
    const next = moveItem(groups, index, step)
    if (!next) return
    await run(() => api.quickLinks.admin.reorderGroups(next.map(g => g.id)), '', 'Could not reorder')
  }

  async function saveLink() {
    const f = linkEditor
    const next = {}
    if (!f.label.trim()) next.label = 'Name is required'
    if (!URL_PATTERN.test(f.url.trim())) next.url = 'Enter a full address starting with http:// or https://'
    if (Object.keys(next).length) {
      setErrors(next)
      addToast('Fix the highlighted fields before saving', 'error')
      return
    }
    const body = {
      groupId: Number(f.groupId),
      label: f.label.trim(),
      description: f.description.trim(),
      url: f.url.trim(),
      icon: f.icon,
      enabled: f.enabled,
    }
    const ok = await run(
      () => f.id ? api.quickLinks.admin.updateLink(f.id, body) : api.quickLinks.admin.createLink(body),
      'Saved',
      'Save failed'
    )
    if (ok) setLinkEditor(null)
  }

  async function removeLink(link) {
    if (!await confirmDialog(`Delete "${link.label}"?`)) return
    await run(() => api.quickLinks.admin.removeLink(link.id), 'Deleted', 'Delete failed')
  }

  async function moveLink(group, index, step) {
    const next = moveItem(group.links, index, step)
    if (!next) return
    await run(() => api.quickLinks.admin.reorderLinks(group.id, next.map(l => l.id)), '', 'Could not reorder')
  }

  async function toggleLink(link) {
    await run(
      () => api.quickLinks.admin.updateLink(link.id, {
        groupId: link.groupId,
        label: link.label,
        description: link.description || '',
        url: link.url,
        icon: link.icon,
        enabled: !link.enabled,
      }),
      '',
      'Could not update the link'
    )
  }

  function openGroupEditor(group) {
    setErrors({})
    setGroupEditor({ id: group?.id ?? null, title: group?.title || '' })
  }

  function openLinkEditor(group, link) {
    setErrors({})
    setLinkEditor(link
      ? {
        id: link.id,
        groupId: link.groupId,
        label: link.label,
        description: link.description || '',
        url: link.url,
        icon: link.icon || DEFAULT_LINK_ICON,
        enabled: link.enabled,
      }
      : { id: null, ...blankLink(group.id) })
  }

  function patchLink(key, value) {
    setLinkEditor(s => ({ ...s, [key]: value }))
    setErrors(errs => ({ ...errs, [key]: undefined }))
  }

  return (
    <>
      <div className="admin__toolbar">
        <button type="button" className="btn-gold" onClick={() => openGroupEditor(null)}>+ Add group</button>
        <span className="admin__count">
          {groups ? `${groups.length} group${groups.length === 1 ? '' : 's'}` : 'Loading…'}
        </span>
      </div>

      {error && !groups && (
        <p className="admin__hint admin__hint--error">
          {error} <button type="button" className="btn-outline btn-outline--sm" onClick={load}>Retry</button>
        </p>
      )}

      {groups && groups.length === 0 && <p className="admin__empty">No groups added yet</p>}

      {(groups || []).map((group, gi) => (
        <section key={group.id} className="ql-admin__group">
          <div className="ql-admin__head">
            <h3 className="ql-admin__title">{group.title}</h3>
            <div className="admin__actions">
              <button type="button" className="btn-outline btn-outline--sm" disabled={busy || gi === 0}
                aria-label="Move group up" onClick={() => moveGroup(gi, -1)}>↑</button>
              <button type="button" className="btn-outline btn-outline--sm" disabled={busy || gi === groups.length - 1}
                aria-label="Move group down" onClick={() => moveGroup(gi, 1)}>↓</button>
              <button type="button" className="btn-outline btn-outline--sm" onClick={() => openGroupEditor(group)}>Rename</button>
              <button type="button" className="btn-outline btn-outline--sm btn-outline--danger" onClick={() => removeGroup(group)}>Delete</button>
              <button type="button" className="btn-gold btn-outline--sm" onClick={() => openLinkEditor(group, null)}>+ Add link</button>
            </div>
          </div>

          <div className="admin__table-wrap">
            <table className="admin__table">
              <thead>
                <tr><th>Link</th><th>Address</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {group.links.length === 0 && (
                  <tr><td colSpan={4} className="admin__empty">No links in this group</td></tr>
                )}
                {group.links.map((link, li) => (
                  <tr key={link.id}>
                    <td className="admin__multiline">
                      <span className="ql-admin__label"><Icon name={link.icon} /> <strong>{link.label}</strong></span>
                      {link.description && <span className="ql-admin__desc">{link.description}</span>}
                    </td>
                    <td className="admin__multiline ql-admin__url">
                      <a className="qa-link" href={link.url} target="_blank" rel="noopener noreferrer">{link.url}</a>
                    </td>
                    <td>
                      <label className="admin__check">
                        <input type="checkbox" checked={link.enabled} disabled={busy} onChange={() => toggleLink(link)} />
                        {link.enabled ? 'Shown' : 'Hidden'}
                      </label>
                    </td>
                    <td className="admin__actions">
                      <button type="button" className="btn-outline btn-outline--sm" disabled={busy || li === 0}
                        aria-label="Move link up" onClick={() => moveLink(group, li, -1)}>↑</button>
                      <button type="button" className="btn-outline btn-outline--sm" disabled={busy || li === group.links.length - 1}
                        aria-label="Move link down" onClick={() => moveLink(group, li, 1)}>↓</button>
                      <button type="button" className="btn-outline btn-outline--sm" onClick={() => openLinkEditor(group, link)}>Edit</button>
                      <button type="button" className="btn-outline btn-outline--sm btn-outline--danger" onClick={() => removeLink(link)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {groupEditor && (
        <ModalPortal>
          <div className="overlay" {...groupOverlay}>
            <div className="modal modal--sm" onClick={e => e.stopPropagation()}>
              <h3 className="section-title">{groupEditor.id ? 'Rename group' : 'Add group'}</h3>
              <div className="form-group">
                <label className="form-label">Group name *</label>
                <input
                  className={`form-input${errors.title ? ' form-input--error' : ''}`}
                  value={groupEditor.title}
                  maxLength={120}
                  autoFocus
                  onChange={e => {
                    setGroupEditor(s => ({ ...s, title: e.target.value }))
                    setErrors({})
                  }}
                />
                {errors.title && <p className="admin__hint admin__hint--error">{errors.title}</p>}
              </div>
              <div className="form-actions">
                <button type="button" className="btn-outline" onClick={closeGroup}>Cancel</button>
                <button type="button" className="btn-gold" onClick={saveGroup} disabled={busy}>
                  {busy ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {linkEditor && (
        <ModalPortal>
          <div className="overlay" {...linkOverlay}>
            <div className="modal modal--md" onClick={e => e.stopPropagation()}>
              <h3 className="section-title">{linkEditor.id ? 'Edit link' : 'Add link'}</h3>
              <div className="admin__form">
                <div className="form-group">
                  <label className="form-label">Group</label>
                  <Dropdown className="form-input" value={linkEditor.groupId} onChange={e => patchLink('groupId', e.target.value)}>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
                  </Dropdown>
                </div>

                <div className="form-group">
                  <label className="form-label">Icon</label>
                  <Dropdown className="form-input" value={linkEditor.icon} onChange={e => patchLink('icon', e.target.value)}>
                    {LINK_ICONS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
                  </Dropdown>
                </div>

                <div className="form-group admin__form-group--full">
                  <label className="form-label">Name *</label>
                  <input
                    className={`form-input${errors.label ? ' form-input--error' : ''}`}
                    value={linkEditor.label}
                    maxLength={200}
                    onChange={e => patchLink('label', e.target.value)}
                  />
                  {errors.label && <p className="admin__hint admin__hint--error">{errors.label}</p>}
                </div>

                <div className="form-group admin__form-group--full">
                  <label className="form-label">Address (URL) *</label>
                  <input
                    className={`form-input${errors.url ? ' form-input--error' : ''}`}
                    value={linkEditor.url}
                    maxLength={1000}
                    placeholder="https://"
                    onChange={e => patchLink('url', e.target.value)}
                  />
                  {errors.url && <p className="admin__hint admin__hint--error">{errors.url}</p>}
                </div>

                <div className="form-group admin__form-group--full">
                  <label className="form-label">Description</label>
                  <textarea
                    className="form-input"
                    rows={2}
                    maxLength={500}
                    value={linkEditor.description}
                    onChange={e => patchLink('description', e.target.value)}
                  />
                </div>

                <label className="admin__check admin__form-group--full">
                  <input type="checkbox" checked={linkEditor.enabled} onChange={e => patchLink('enabled', e.target.checked)} />
                  Show this link in Quick Access
                </label>
              </div>

              <div className="form-actions">
                <button type="button" className="btn-outline" onClick={closeLink}>Cancel</button>
                <button type="button" className="btn-gold" onClick={saveLink} disabled={busy}>
                  {busy ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  )
}
