import { describe, it, expect } from 'vitest'
import { caseClientsByNumber } from './caseClients'

const clients = [
  { id: 1, name: 'Asha Rao', whatsappPhone: '9876543210' },
  { id: 2, name: 'Vikram Mehta', whatsappPhone: '' },
  { id: 3, name: 'Old Record', phone: '9123456780' },
]

describe('caseClientsByNumber', () => {
  it('splits the clients of a case into those with and without a WhatsApp number', () => {
    const c = { clientId: 1, additionalClients: [{ id: 2 }] }
    const { withNumber, missing } = caseClientsByNumber(c, clients)
    expect(withNumber.map(x => x.name)).toEqual(['Asha Rao'])
    expect(missing.map(x => x.name)).toEqual(['Vikram Mehta'])
    expect(missing[0].client).toBe(clients[1])
  })

  it('treats a blank or spaces-only number as missing, and accepts the older phone field', () => {
    const blank = [{ id: 5, name: 'Blank', whatsappPhone: '   ' }, ...clients]
    expect(caseClientsByNumber({ clientId: 5 }, blank).missing).toHaveLength(1)
    expect(caseClientsByNumber({ clientId: 3 }, blank).withNumber).toHaveLength(1)
  })

  it('leaves a client that is not in the list to the server to decide', () => {
    const { withNumber, missing } = caseClientsByNumber({ clientId: 99, clientName: 'Unknown Person' }, clients)
    expect(missing).toHaveLength(0)
    expect(withNumber[0].name).toBe('Unknown Person')
  })

  it('reports everyone as missing when nobody on the case has a number', () => {
    const { withNumber, missing } = caseClientsByNumber({ clientId: 2 }, clients)
    expect(withNumber).toHaveLength(0)
    expect(missing.map(x => x.id)).toEqual([2])
  })
})
