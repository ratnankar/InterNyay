import api from '../services/api'
import { createDirectoryHook } from './useJurisdictionDirectory'

const useQuickLinks = createDirectoryHook(
  () => api.quickLinks.directory(),
  'Could not load important links'
)

export default useQuickLinks
