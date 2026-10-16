import useOverlayClose from '../../hooks/useOverlayClose'
import ModalPortal from '../common/ModalPortal'
import LoginLogAdmin from './LoginLogAdmin'

// Popup with the sign-in history of one account only (sign-ins, failed sign-ins, sign-outs), opened from the account's profile
export default function UserLoginLogsModal({ user, onClose }) {
  const overlayHandlers = useOverlayClose(onClose, { backdrop: false })

  return (
    <ModalPortal>
      <div className="overlay overlay--stacked" {...overlayHandlers}>
        <div className="modal modal--wide modal--loglist" onClick={e => e.stopPropagation()}>
          <h3 className="section-title">Login log</h3>
          <p className="admin__hint u-mb-12">{user.name} · {user.email}</p>

          <LoginLogAdmin user={user} />

          <div className="form-actions">
            <button type="button" className="btn-outline" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
