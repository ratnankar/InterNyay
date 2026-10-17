import { useEffect, useMemo, useState } from 'react'
import api from '../services/api'
import { buildFeeRules } from '../utils/courtFeesAct'
import { onLiveRefresh } from '../utils/liveRefresh'

// Court fee rules for the calculator, loaded from the database. The built-in Court Fees Act defaults are used only while they
// load or if the request fails, so the calculator always works
export default function useFeeRules() {
  const [config, setConfig] = useState(null)
  useEffect(() => {
    let live = true
    api.feeCalculator.config()
      .then(r => { if (live && r?.config) setConfig(r.config) })
      .catch(() => {})
    // Fee rules the admin changed show up without a refresh
    const stopLive = onLiveRefresh(() => {
      api.feeCalculator.config().then(r => { if (live && r?.config) setConfig(r.config) }).catch(() => {})
    })
    return () => { live = false; stopLive() }
  }, [])
  return useMemo(() => buildFeeRules(config), [config])
}
