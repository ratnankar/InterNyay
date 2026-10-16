import { Component } from 'react'
import ErrorPage from './ErrorPage'
import { isChunkError, reloadOnce } from '../../utils/chunkError'

// Catches a crash while its children draw, so one broken page or pop-up does not take down the whole app (sidebar included).
//   resetKey  when this value changes (for example the address) the boundary tries its children again
//   fallback  what to show instead of the children: undefined = the "Something went wrong" panel, null = nothing at all
//             (for extras like pop-ups and the chat button, which can fail quietly)
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    console.error(error)
    // A page file that did not download: get the newest version (once)
    if (isChunkError(error)) reloadOnce()
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  retry = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    if (this.props.fallback !== undefined) return this.props.fallback

    return (
      <ErrorPage
        embedded
        icon="warning"
        title="This page could not be shown"
        message="Something interrupted the page for a moment. Trying again usually fixes it."
        details={String(error?.message || '').slice(0, 400) || undefined}
      >
        <button type="button" className="btn-gold" onClick={this.retry}>Try again</button>
        <button type="button" className="btn-outline" onClick={() => window.location.reload()}>Reload</button>
      </ErrorPage>
    )
  }
}
