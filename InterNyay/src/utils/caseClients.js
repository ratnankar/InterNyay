import { CORPORATE_PANEL_LABEL } from '../constants/data'

// All client ids on a case (main client plus additional clients) as numbers
export function caseClientIds(c) {
  return [c?.clientId, ...(c?.additionalClients || []).map(x => x.id)]
    .filter(id => id != null)
    .map(Number)
}

// True if the given client is attached to the case in any role
export function caseHasClient(c, clientId) {
  return caseClientIds(c).includes(Number(clientId))
}

// Names of every client on the case; falls back to the clients list when the case doesn't carry the name
export function caseClientNames(c, clients = []) {
  // Main client's name, looked up from the clients list if the case doesn't have it
  const primary = c.clientName
    || clients.find(cl => Number(cl.id) === Number(c.clientId))?.name
    || 'Unknown'

  // Names of the additional clients
  const extra = (c.additionalClients || []).map(x =>
    x.name || clients.find(cl => Number(cl.id) === Number(x.id))?.name
  ).filter(Boolean)

  return [primary, ...extra]
}

// Splits the clients of a case into those with a WhatsApp number saved and those without.
// A client missing from the clients list is treated as reachable, so the server decides.
export function caseClientsByNumber(c, clients = []) {
  const withNumber = []
  const missing = []
  caseClientIds(c).forEach(id => {
    const client = clients.find(cl => Number(cl.id) === id)
    const name = client?.name
      || (Number(c.clientId) === id ? c.clientName : (c.additionalClients || []).find(x => Number(x.id) === id)?.name)
      || 'Unknown'
    const entry = { id, name, client }
    const phone = String(client?.whatsappPhone || client?.phone || '').trim()
    if (!client || phone) withNumber.push(entry)
    else missing.push(entry)
  })
  return { withNumber, missing }
}

// Role of a client in this case (Accused, Plaintiff/Petitioner, ...); keys may be stored as number or string
export function caseClientSubType(c, clientId) {
  return c?.clientSubTypes?.[clientId] || c?.clientSubTypes?.[String(clientId)] || ''
}

// Names with their role in brackets, e.g. "Ravi Kumar (Accused)"
export function caseClientLabels(c, clients = []) {
  const primaryName = c.clientName
    || clients.find(cl => Number(cl.id) === Number(c.clientId))?.name
    || 'Unknown'

  const entries = [{ id: c.clientId, name: primaryName }]

  ;(c.additionalClients || []).forEach(x => {
    const name = x.name || clients.find(cl => Number(cl.id) === Number(x.id))?.name
    if (name) entries.push({ id: x.id, name })
  })

  return entries.map(({ id, name }) => {
    const subType = caseClientSubType(c, id)
    return subType ? `${name} (${subType})` : name
  })
}

// Clients tagged with the Corporate Panel label get special fee handling
function isCorporatePanelClient(client) {
  return String(client?.customLabel || '').trim().toLowerCase() === CORPORATE_PANEL_LABEL.toLowerCase()
}

// True if any client in the list is a corporate panel client
export function hasCorporatePanelClient(clients = []) {
  return clients.some(isCorporatePanelClient)
}

// True if any client attached to this case is a corporate panel client
export function caseHasCorporatePanel(c, clients = []) {
  return caseClientIds(c).some(id =>
    isCorporatePanelClient(clients.find(cl => Number(cl.id) === id))
  )
}
