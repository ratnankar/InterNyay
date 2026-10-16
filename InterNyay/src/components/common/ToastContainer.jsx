import { useApp } from '../../context/AppContext'
import Icon from './Icon'

// Shows the toast messages
export default function ToastContainer() {
  // Toast list lives in AppContext; this just renders it
  const { toasts } = useApp()

  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`toast ${t.type === 'error' ? 'toast--error' : 'toast--success'}${t.leaving ? ' toast--leaving' : ''}`}
        >
          <Icon name={t.type === 'error' ? 'warning' : 'check'} />
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  )
}
