import { useCallback, useEffect, useState } from 'react'
import api from '../services/api'
import { getErrorMessage } from '../utils/errorMessages'

// Police directory shared by all components so it is fetched only once
let cache = null
// Components currently using the hook; they are updated whenever the cache changes
const subscribers = new Set()

// Store the directory and notify every subscriber
function publish(directory) {
  cache = directory
  subscribers.forEach(fn => fn(directory))
}

// Lets admin screens update the shared directory directly after an edit
export function setPoliceDirectory(directory) {
  publish(directory)
}

// Hook returning the cached police directory plus loading/error state
export default function usePoliceDirectory() {
  const [directory, setDirectory] = useState(cache)
  const [loading,   setLoading]   = useState(!cache)
  const [error,     setError]     = useState('')

  // Fetch the latest directory from the backend
  const reload = useCallback(async () => {
    setError('')
    try {
      publish(await api.police.directory())
    } catch (e) {
      setError(getErrorMessage(e, 'Could not load the police directory'))
    } finally {
      setLoading(false)
    }
  }, [])

  // Subscribe for updates and load once when the component mounts
  useEffect(() => {
    subscribers.add(setDirectory)
    reload()
    return () => { subscribers.delete(setDirectory) }
  }, [reload])

  return { directory, loading, error, reload }
}
