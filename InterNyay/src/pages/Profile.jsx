import { starLabel } from '../components/common/Req'
import { Fragment, useCallback, useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import useImageCrop from '../hooks/useImageCrop'
import api from '../services/api'
import CopyButton from '../components/common/CopyButton'
import PasswordInput from '../components/common/PasswordInput'
import AccountActionModal from '../components/modals/AccountActionModal'
import TransactionPinCard from '../components/common/TransactionPinCard'
import CourtPreferenceCard from '../components/common/CourtPreferenceCard'
import { formatDisplayDate } from '../utils/dateUtils'

import Icon from '../components/common/Icon'
import EmailChangeModal from '../components/modals/EmailChangeModal'
import AvatarUpload from '../components/common/AvatarUpload'
import SpecializationSelect from '../components/common/SpecializationSelect'
import ImageViewer from '../components/common/ImageViewer'
import { getErrorMessage } from '../utils/errorMessages'
import { enterKey } from '../utils/enterKey'
import { confirmDialog } from '../utils/confirmDialog'
import { PASSWORD_HINT } from '../utils/passwordPolicy'
import UserLoginLogsModal from '../components/admin/UserLoginLogsModal'
// Editable profile fields as [label, key, input type, placeholder]
const PROFILE_FIELDS = [
  ['Full Name *',       'name',           'text',  'Adv. Full Name'],
  ['Bar Council No.',   'barNo',          'text',  'D/XXXX/2024'],
  ['Phone',             'phone',          'tel',   '+91 XXXXX XXXXX'],
  ['Specialization',    'specialization', 'text',  'e.g. Civil & Criminal'],
  ['Chamber / Office',  'chamber',        'text',  'Chamber No. / Address'],
]

// Profile fields that associates can edit
const ASSOCIATE_FIELD_KEYS = ['name', 'barNo', 'phone']

// Show a 10-character advocate code as two groups of five
function formatCode(code) {
  const c = String(code || '')
  return c.length === 10 ? `${c.slice(0, 5)}-${c.slice(5)}` : c
}

// Card showing the advocate code that associates use to link their account
function AdvocateCodeCard({ code }) {
  return (
    <div className="card profile-card">
      <h3 className="section-title">Advocate Code</h3>
      <p className="profile-note">
        Give this code to your associates. They enter it when they register an associate
        account to link it to your practice. It stays the same — treat it like a password,
        since anyone who registers with it can work on your cases, clients and documents
        (though never see fees or transactions).
      </p>
      <div className="advocate-code">
        <span className="advocate-code__value">{code ? formatCode(code) : '—'}</span>
        {code && <CopyButton text={formatCode(code)} label="Copy code" title="Copy advocate code" />}
      </div>
    </div>
  )
}

// Card listing the advocate's associates, with a Remove button for each
function AssociatesCard() {
  const { addToast } = useApp()
  // Associates list (null while loading)
  const [list, setList] = useState(null)

  // Load the associates; an empty list is used if the request fails
  const load = useCallback(() => {
    api.auth.associates()
      .then(rows => setList(Array.isArray(rows) ? rows : []))
      .catch(() => setList([]))
  }, [])

  useEffect(() => { load() }, [load])

  // Remove an associate after confirming; they lose access immediately
  async function remove(a) {
    const ok = await confirmDialog(
      `Remove ${a.name}?\n\nThey lose access to your practice immediately. ` +
      'They can register again later with your advocate code.'
    )
    if (!ok) return

    try {
      await api.auth.removeAssociate(a.id)
      setList(rows => (rows || []).filter(r => r.id !== a.id))
      addToast('Associate removed')
    } catch (e) {
      addToast(getErrorMessage(e, 'Could not remove the associate'), 'error')
    }
  }

  return (
    <div className="card profile-card">
      <h3 className="section-title">Your Associates</h3>

      {/* Loading, empty and list states */}
      {list === null && <p className="profile-note">Loading…</p>}

      {list !== null && list.length === 0 && (
        <p className="profile-note">
          No associates yet. Share your advocate code and they will show up here once they register.
        </p>
      )}

      {list !== null && list.length > 0 && (
        <ul className="associate-list">
          {list.map(a => (
            <li key={a.id} className="associate-list__item">
              <div>
                <p className="associate-list__name">{a.name}</p>
                <p className="associate-list__meta">
                  {a.email}{a.phone ? ` · ${a.phone}` : ''}
                  {a.createdAt ? ` · joined ${formatDisplayDate(String(a.createdAt).slice(0, 10))}` : ''}
                </p>
              </div>
              <button type="button"
                className="btn-outline btn-outline--sm btn-outline--danger"
                onClick={() => remove(a)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Card with Deactivate and Delete account actions (wording differs for associates)
function AccountCard({ isAssociate, onAction }) {
  return (
    <div className="card profile-card account-danger">
      <h3 className="section-title">Account</h3>

      <div className="account-action">
        <div>
          <p className="account-action__title">Deactivate account</p>
          <p className="account-action__text">
            {isAssociate
              ? 'Pause your account and sign out. Sign in again any time to reactivate it.'
              : 'Pause your account and sign out. Your data is kept, but your associates lose access and automatic WhatsApp reminders stop. Sign in again any time to reactivate it.'}
          </p>
        </div>
        <button type="button" className="btn-outline" onClick={() => onAction('deactivate')}>
          Deactivate
        </button>
      </div>

      <div className="account-action">
        <div>
          <p className="account-action__title">Delete account</p>
          <p className="account-action__text">
            {isAssociate
              ? "Permanently delete your associate account. The advocate's records are not affected."
              : "Permanently delete your account, every case, client, hearing, task and document in it, and your associates' accounts. This cannot be undone."}
          </p>
        </div>
        <button type="button" className="btn-outline btn-outline--danger" onClick={() => onAction('delete')}>
          Delete
        </button>
      </div>
    </div>
  )
}

// Profile page: photo, details, email, password and account actions
export default function Profile() {
  // Which account action (deactivate or delete) is open in the confirmation modal
  const [accountAction, setAccountAction] = useState(null)
  // True while the profile photo is open full size
  const [viewPhoto, setViewPhoto] = useState(false)
  // True while the admin's own login log popup is open
  const [showLoginLog, setShowLoginLog] = useState(false)

  const {
    currentUser,
    isAdmin,
    isAssociate,
    isEditingProfile,
    profileForm,
    setProfileForm,
    startEditProfile,
    cancelEditProfile,
    handleUpdateProfile,
    isChangingPassword,
    passwordForm,
    setPasswordForm,
    startChangePassword,
    cancelChangePassword,
    handleChangePassword,
    handleSetPassword,
    handleUpdateProfilePicture,
    addToast,
    setActiveNav,
    isResettingPassword,
    forgotForm,
    setForgotForm,
    forgotOtpSent,
    forgotSending,
    forgotResetting,
    forgotResendInSec,
    startForgotPassword,
    cancelForgotPassword,
    handleSendForgotOtp,
    handleResetForgottenPassword,
    startChangeEmail,
    authError,
  } = useApp()

  // True for Google sign-ups that have not set a password yet
  const noPassword = currentUser?.passwordSet === false

  // Name and email of the signed-in user
  const name  = currentUser?.name  || ''
  const email = currentUser?.email || ''

  // Associates see only the fields they are allowed to edit
  const fields = isAssociate
    ? PROFILE_FIELDS.filter(([, key]) => ASSOCIATE_FIELD_KEYS.includes(key))
    : PROFILE_FIELDS

  // Photo picker with a circular crop window
  const { pick, cropper } = useImageCrop({
    shape: 'circle',
    title: 'Adjust profile photo',
    onError: msg => addToast(msg, 'error'),
  })

  // Reset the file input, then crop and save the chosen photo
  function onPhotoSelected(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    pick(file, dataUrl => handleUpdateProfilePicture(dataUrl))
  }

  return (
    <div className="profile-page">
      {/* Photo crop window */}
      {cropper}
      {/* Full-size view of the profile photo */}
      {viewPhoto && currentUser?.profilePicture && (
        <ImageViewer
          src={currentUser.profilePicture}
          alt={name || 'Profile photo'}
          caption={name}
          onClose={() => setViewPhoto(false)}
        />
      )}
      {/* Change-email popup, opened from Edit Profile */}
      <EmailChangeModal />
      {/* Page title and, for admins, a button back to the admin page */}
      <div className="page-header">
        <h1 className="page-title">
          {isAdmin ? 'Admin Profile' : isAssociate ? 'Associate Profile' : 'Advocate Profile'}
        </h1>
        <div className="page-header__actions">
          {isAdmin && (
            <>
              <button type="button" className="btn-outline" onClick={() => setShowLoginLog(true)}><Icon name="shield" /> My Login Activity</button>
              <button type="button" className="btn-outline" onClick={() => setActiveNav('admin')}><Icon name="arrow-left" /> Admin Console</button>
            </>
          )}
        </div>
      </div>

      {/* Profile card: photo, name and details */}
      <div className="card profile-card">
        <div className="profile-card__header">
          {/* Avatar with photo upload; shows the default person avatar when there is no photo */}
          <AvatarUpload
            className="profile-card__avatar"
            photo={currentUser?.profilePicture}
            alt={name || 'Profile'}
            uploadTitle="Upload a profile photo"
            onFile={onPhotoSelected}
            onView={() => setViewPhoto(true)}
          />
          <div className="profile-card__identity">
            <p className="profile-card__name">
              {name || (isAdmin ? 'Administrator' : isAssociate ? 'Associate' : 'Advocate')}
            </p>
            <p className="profile-card__email">{email}</p>
            {currentUser?.profilePicture && (
              <button type="button"
                className="avatar-upload__remove"
                onClick={() => handleUpdateProfilePicture('')}
              >
                Remove photo
              </button>
            )}
          </div>
          {/* Edit Profile button */}
          {!isEditingProfile && (
            <button type="button"
              className="btn-gold profile-card__edit-btn"
              onClick={startEditProfile}
            >
              <Icon name="edit" /> Edit Profile
            </button>
          )}
        </div>

        {/* Read-only details, otherwise the edit form */}
        {!isEditingProfile ? (
          <div className="profile-view-grid">
            {fields.map(([label, key]) => (
              <Fragment key={key}>
                <div className="profile-view-item">
                  <p className="profile-view-item__label">{label.replace(' *', '')}</p>
                  <p className="profile-view-item__value">
                    {currentUser?.[key] || '—'}
                  </p>
                </div>
                {/* Email sits right after Full Name */}
                {key === 'name' && (
                  <div className="profile-view-item">
                    <p className="profile-view-item__label">Email</p>
                    <p className="profile-view-item__value profile-view-item__value--email">
                      {email || '—'}
                    </p>
                  </div>
                )}
              </Fragment>
            ))}
          </div>
        ) : (
          <>
            <div className="form-grid-2">
              {fields.map(([label, key, type, ph]) => (
                <div key={key}>
                  {/* Label and input for each field; the phone field also checks for a 10-digit Indian mobile number (optionally with +91) */}
                  <label className="form-label">{starLabel(label)}</label>
                  {key === 'specialization' ? (
                    <SpecializationSelect
                      inputClassName="form-input profile-follow-input"
                      value={profileForm.specialization}
                      onChange={value => setProfileForm(f => ({ ...f, specialization: value }))}
                    />
                  ) : (
                    <input
                      className="form-input"
                      type={type}
                      placeholder={ph}
                      value={profileForm[key] || ''}
                      onChange={e =>
                        setProfileForm(f => ({ ...f, [key]: e.target.value }))
                      }
                      {...(key === 'phone' ? {
                        inputMode: 'tel',
                        maxLength: 16,
                        pattern: '^(\\+91[\\s-]?|0)?[6-9]\\d{9}$',
                        title: 'Enter a valid 10-digit Indian mobile number (optionally with +91)',
                      } : {})}
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Email is changed in its own popup (new email, then a 6-digit code) */}
            <div className="profile-email-row">
              <div>
                <label className="form-label">Email</label>
                <p className="profile-view-item__value u-m-0" >{email}</p>
              </div>
              <button type="button" className="btn-outline" onClick={startChangeEmail}>
                <Icon name="mail" /> Edit email
              </button>
            </div>

            <div className="form-actions">
              <button type="button" className="btn-outline" onClick={cancelEditProfile}>Cancel</button>
              <button type="button" className="btn-gold" onClick={handleUpdateProfile}>Save Changes</button>
            </div>
          </>
        )}
      </div>

      {/* Linked advocate details, shown to associates only */}
      {isAssociate && (
        <div className="card profile-card">
          <h3 className="section-title">Linked Advocate</h3>
          <div className="profile-view-grid">
            <div className="profile-view-item">
              <p className="profile-view-item__label">Advocate</p>
              <p className="profile-view-item__value">{currentUser?.advocateName || '—'}</p>
            </div>
            <div className="profile-view-item">
              <p className="profile-view-item__label">Bar Council No.</p>
              <p className="profile-view-item__value">{currentUser?.advocateBarNo || '—'}</p>
            </div>
          </div>
          <p className="profile-note u-mt-16 u-mb-0">
            You can work on all of this advocate's cases, clients, hearings and documents.
            Fees and transactions are not available to associate accounts.
          </p>
        </div>
      )}

      {/* Advocate code and associates cards, shown to advocates only */}
      {/* Courts the user works at: decides what Judges on Leave, the judge list, roster, police directory and Add Case open on */}
      {!isAdmin && <CourtPreferenceCard />}

      {!isAdmin && !isAssociate && <AdvocateCodeCard code={currentUser?.advocateCode} />}
      {!isAdmin && !isAssociate && <AssociatesCard />}

      <div className="card profile-card">
        <div className="page-header page-header--top">
          {/* Password card: Google sign-ups set a first password; everyone else changes or resets it */}
          <h3 className="section-title">{noPassword ? 'Set Password' : 'Password'}</h3>
          {!isChangingPassword && !isResettingPassword && !noPassword && (
            <button type="button" className="btn-outline" onClick={startChangePassword}>
              Change Password
            </button>
          )}
        </div>

        {/* Google sign-ups with no password yet: set one directly, no email code */}
        {noPassword && !isChangingPassword && (
          <div className="profile-setpw">
            <div className="profile-setpw__icon"><Icon name="key" /></div>
            <div className="profile-setpw__body">
              <p className="profile-setpw__title">You signed in with Google</p>
              <p className="profile-setpw__text">
                This account has no password yet. Set one to protect Transactions with a PIN, change your
                email, or deactivate or delete your account. You can keep signing in with Google either way.
              </p>
              <button type="button" className="btn-gold" onClick={startChangePassword}>Set a password</button>
            </div>
          </div>
        )}

        {noPassword && isChangingPassword && (
          <>
            <div className="form-grid-2">
              <div>
                <label className="form-label">Password</label>
                <PasswordInput
                  className="form-input"
                  autoComplete="new-password"
                  placeholder={PASSWORD_HINT}
                  showToggle={false}
                  value={passwordForm.newPassword}
                  onChange={e => setPasswordForm(f => ({ ...f, newPassword: e.target.value }))}
                />
              </div>
              <div>
                <label className="form-label">Confirm Password</label>
                <PasswordInput
                  className="form-input"
                  autoComplete="new-password"
                  placeholder="Re-enter password"
                  value={passwordForm.confirmPassword}
                  onChange={e => setPasswordForm(f => ({ ...f, confirmPassword: e.target.value }))}
                  onKeyDown={enterKey(() => handleSetPassword())}
                />
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn-outline" onClick={cancelChangePassword}>Cancel</button>
              <button type="button" className="btn-gold" onClick={handleSetPassword}>Set Password</button>
            </div>
          </>
        )}

        {/* Change password form */}
        {!noPassword && isChangingPassword && (
          <>
            <div className="form-grid-2">
              <div>
                <label className="form-label">Current Password</label>
                <PasswordInput
                  className="form-input"
                  autoComplete="current-password"
                  placeholder="Your current password"
                  value={passwordForm.oldPassword}
                  onChange={e =>
                    setPasswordForm(f => ({ ...f, oldPassword: e.target.value }))
                  }
                />
              </div>
              <div />
              <div>
                <label className="form-label">New Password</label>
                <PasswordInput
                  className="form-input"
                  autoComplete="new-password"
                  placeholder={PASSWORD_HINT}
                  showToggle={false}
                  value={passwordForm.newPassword}
                  onChange={e =>
                    setPasswordForm(f => ({ ...f, newPassword: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="form-label">Confirm New Password</label>
                <PasswordInput
                  className="form-input"
                  autoComplete="new-password"
                  placeholder="Re-enter password"
                  value={passwordForm.confirmPassword}
                  onChange={e =>
                    setPasswordForm(f => ({ ...f, confirmPassword: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="form-actions">
              <button type="button" className="btn-outline" onClick={cancelChangePassword}>Cancel</button>
              <button type="button" className="btn-gold" onClick={handleChangePassword}>Update Password</button>
            </div>
          </>
        )}

        {/* Link to reset the password by email instead */}
        {!noPassword && !isChangingPassword && !isResettingPassword && (
          <p className="profile-note u-mt-12 u-mb-0">
            <button type="button" className="profile-reset-link" onClick={startForgotPassword}>
              Reset your password by email instead
            </button>
          </p>
        )}

        {/* Reset by email: send a code, then enter the code and the new password */}
        {isResettingPassword && (
          <>
            <p className="profile-note">
              We'll email a 6-digit code to <strong>{forgotForm.email || currentUser?.email}</strong>{' '}
              to confirm it's you before setting a new password.
            </p>

            {authError && (
              <p className="account-modal__error" role="alert">{authError}</p>
            )}

            {!forgotOtpSent ? (
              <div className="form-actions u-justify-start" >
                <button type="button" className="btn-gold" onClick={handleSendForgotOtp} disabled={forgotSending}>
                  {forgotSending ? 'Sending…' : 'Send verification code'}
                </button>
                <button type="button" className="btn-outline" onClick={cancelForgotPassword}>Cancel</button>
              </div>
            ) : (
              <>
                <div className="form-grid-2">
                  <div>
                    <label className="form-label">6-Digit Code</label>
                    <input
                      className="form-input"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      placeholder="6-digit code"
                      value={forgotForm.otp}
                      onChange={e => setForgotForm(f => ({
                        ...f, otp: e.target.value.replace(/\D/g, '').slice(0, 6)
                      }))}
                    />
                  </div>
                  <div className="u-flex u-items-end">
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={handleSendForgotOtp}
                      disabled={forgotSending || forgotResendInSec > 0}
                    >
                      {forgotSending
                        ? 'Sending…'
                        : forgotResendInSec > 0
                          ? `Resend in ${forgotResendInSec}s`
                          : 'Resend code'}
                    </button>
                  </div>
                  <div>
                    <label className="form-label">New Password</label>
                    <PasswordInput
                      className="form-input"
                      autoComplete="new-password"
                      placeholder={PASSWORD_HINT}
                      showToggle={false}
                      value={forgotForm.newPassword}
                      onChange={e => setForgotForm(f => ({ ...f, newPassword: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="form-label">Confirm New Password</label>
                    <PasswordInput
                      className="form-input"
                      autoComplete="new-password"
                      placeholder="Re-enter password"
                      value={forgotForm.confirmPassword}
                      onChange={e => setForgotForm(f => ({ ...f, confirmPassword: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="form-actions">
                  <button type="button" className="btn-outline" onClick={cancelForgotPassword}>Cancel</button>
                  <button type="button" className="btn-gold" onClick={handleResetForgottenPassword} disabled={forgotResetting}>
                    {forgotResetting ? 'Resetting…' : 'Reset Password'}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Transactions PIN: create, change with the old PIN, reset with the password (advocates only, associates have no Transactions page) */}
      {!isAdmin && !isAssociate && <TransactionPinCard />}

      {/* Deactivate and delete account actions (not for admins) */}
      {!isAdmin && <AccountCard isAssociate={isAssociate} onAction={setAccountAction} />}

      {/* The admin's own sign-in history, same popup as in the admin console */}
      {isAdmin && showLoginLog && (
        <UserLoginLogsModal user={currentUser} onClose={() => setShowLoginLog(false)} />
      )}

      {/* Confirmation modal for the chosen account action */}
      {accountAction && (
        <AccountActionModal mode={accountAction} onClose={() => setAccountAction(null)} />
      )}
    </div>
  )
}
