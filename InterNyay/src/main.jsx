import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import router from './router'
import { reloadOnce } from './utils/chunkError'
import './styles/fonts.css'
import './index.css'
import { stackTables } from './utils/stackTables'
import { compactButtons } from './utils/compactButtons'
import { trackKeyboard } from './utils/keyboardState'

// A page file that cannot be preloaded (usually a new version was published): reload once to get the newest version
window.addEventListener('vite:preloadError', event => { if (reloadOnce()) event.preventDefault() })

// Mount the app into the #root div from index.html. The router renders App (providers and global UI) and the matched page
// (StrictMode helps catch unsafe patterns in dev)
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} future={{ v7_startTransition: true }} />
  </React.StrictMode>
)

// Wide tables turn into one card per row on phones (see utils/stackTables.js)
stackTables()

// Rows of buttons that run out of room show icons only; the chat button and bottom bar step aside while the phone keyboard is open
compactButtons()
trackKeyboard()
