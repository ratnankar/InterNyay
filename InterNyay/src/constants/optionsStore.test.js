import { describe, it, expect } from 'vitest'
import { applyOptions } from './optionsStore'
import { CLIENT_TYPES, CLIENT_LABELS } from './data'
import { SPECIALIZATIONS } from './specializations'
import { reliefOptions, caseTypeOptions } from './caseCatalog'

const opt = (listKey, value, label = value, parent = '') => ({ listKey, parent, value, label })

describe('applyOptions', () => {
  it('replaces the built-in lists with the admin choices, in place', () => {
    const labelsRef = CLIENT_LABELS
    applyOptions({
      CLIENT_LABEL: [opt('CLIENT_LABEL', 'Corporate Panel'), opt('CLIENT_LABEL', 'VIP')],
      CLIENT_TYPE: [opt('CLIENT_TYPE', 'INDIVIDUAL', 'Person')],
      SPECIALIZATION: [opt('SPECIALIZATION', 'Tax Law')],
    })
    expect(CLIENT_LABELS).toBe(labelsRef)
    expect(CLIENT_LABELS).toEqual(['Corporate Panel', 'VIP'])
    expect(CLIENT_TYPES).toEqual([['INDIVIDUAL', 'Person']])
    expect(SPECIALIZATIONS).toEqual(['Tax Law'])
  })

  it('rebuilds the case catalogue from relief and case type rows', () => {
    applyOptions({
      CASE_RELIEF: [opt('CASE_RELIEF', 'Bail', 'Bail', 'Criminal'), opt('CASE_RELIEF', 'Appeal', 'Appeal', 'Civil')],
      CASE_TYPE: [
        opt('CASE_TYPE', 'Regular Bail', 'Regular Bail', 'Criminal||Bail'),
        opt('CASE_TYPE', 'Second Appeal', 'Second Appeal', 'Civil||Appeal'),
      ],
    })
    expect(reliefOptions('Criminal')).toEqual(['Bail'])
    expect(caseTypeOptions('Criminal', 'Bail')).toEqual(['Regular Bail'])
    expect(caseTypeOptions('Civil', 'Appeal')).toEqual(['Second Appeal'])
  })

  it('keeps built-in values for lists the server did not send', () => {
    const before = [...CLIENT_LABELS]
    applyOptions({})
    applyOptions(null)
    expect(CLIENT_LABELS).toEqual(before)
  })
})
