import { useCallback, useEffect, useState } from 'react'
import api from '../services/api'
import { getErrorMessage } from '../utils/errorMessages'

// Factory that builds a shared, cached "directory" hook (one cache + subscriber list per directory type)
function createDirectoryHook(fetcher, fallbackMessage) {
  // Last loaded directory, shared by every component that uses the hook
  let cache = null
  // Mounted components listening for updates, so an admin edit refreshes all of them
  const subscribers = new Set()

  // Save the new directory in the cache and push it to every subscriber
  const publish = directory => {
    cache = directory
    subscribers.forEach(fn => fn(directory))
  }

  // The actual hook returned to components
  function useDirectory() {
    const [directory, setDirectory] = useState(cache)
    const [loading, setLoading] = useState(!cache)
    const [error, setError] = useState('')

    // Fetch the directory again from the backend
    const reload = useCallback(async () => {
      setError('')
      try {
        publish(await fetcher())
      } catch (e) {
        setError(getErrorMessage(e, fallbackMessage))
      } finally {
        setLoading(false)
      }
    }, [])

    // Subscribe on mount, load data, and unsubscribe on unmount
    useEffect(() => {
      subscribers.add(setDirectory)
      reload()
      return () => { subscribers.delete(setDirectory) }
    }, [reload])

    return { directory, loading, error, reload }
  }

  // Exposed so admin screens can push an updated directory without refetching
  useDirectory.publish = publish

  return useDirectory
}

// Debt Recovery Tribunal jurisdiction directory
export const useDrtJurisdiction = createDirectoryHook(
  () => api.jurisdiction.drt.directory(),
  'Could not load DRT jurisdiction'
)

// Consumer commission jurisdiction directory
export const useConsumerJurisdiction = createDirectoryHook(
  () => api.jurisdiction.consumer.directory(),
  'Could not load consumer commission jurisdiction'
)
