import { Link } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { AUTH_PATHS, CORPORATE_AUTH_PATHS } from '../../routes/paths'
import AuthBackdrop from './AuthBackdrop'
import PasswordInput from '../common/PasswordInput'
import { starLabel } from '../common/Req'
import SpecializationSelect from '../common/SpecializationSelect'
import GoogleButton, { googleEnabled } from './GoogleButton'
import GoogleSignupModal from './GoogleSignupModal'
import ErrorMessage from '../common/ErrorMessage'
import { getAccounts } from '../../utils/accounts'

import BrandMark from '../common/BrandMark'
import Icon from '../common/Icon'
import { enterKey } from '../../utils/enterKey'
import { PASSWORD_HINT } from '../../utils/passwordPolicy'
// Account types offered on the register / forgot-password forms
const ACCOUNT_TYPES = [
  { value: 'ADVOCATE',  label: 'Advocate'  },
  { value: 'ASSOCIATE', label: 'Associate' },
]

// Login inputs as [label, field name, input type, placeholder]
const LOGIN_FIELDS = [
  ['EMAIL',    'email',    'email',    'you@email.com'],
  ['PASSWORD', 'password', 'password', '••••••••'],
]

// Registration inputs per account type; associates need the advocate code (no specialization) and can add their own bar number
const REGISTER_FIELDS = {
  ADVOCATE: [
    ['FULL NAME *',     'name',           'text',     'Advocate Full Name'],
    ['BAR COUNCIL NO.', 'barNo',          'text',     'D/XXXX/2024'],
    ['EMAIL *',         'email',          'email',    'advocate@email.com'],
    ['PHONE *',         'phone',          'tel',      '+91 XXXXX XXXXX'],
    ['SPECIALIZATION',  'specialization', 'text',     'e.g. Civil & Criminal'],
    ['PASSWORD *',      'password',       'password', PASSWORD_HINT],
    ['CONFIRM PASSWORD *', 'confirmPassword', 'password', 'Re-enter password'],
  ],
  ASSOCIATE: [
    ['FULL NAME *',     'name',           'text',     'Full Name'],
    ['ADVOCATE CODE *', 'advocateCode',   'text',     'XXXXX-XXXXX'],
    ['BAR COUNCIL NO.', 'barNo',          'text',     'D/XXXX/2024'],
    ['EMAIL *',         'email',          'email',    'associate@email.com'],
    ['PHONE *',         'phone',          'tel',      '+91 XXXXX XXXXX'],
    ['PASSWORD *',      'password',       'password', PASSWORD_HINT],
    ['CONFIRM PASSWORD *', 'confirmPassword', 'password', 'Re-enter password'],
  ],
  // A corporate account: the corporate account's name and contact details, no specialization
  CORPORATE: [
    ['CORPORATE NAME *',     'name',           'text',     'Corporate name'],
    ['EMAIL *',         'email',          'email',    'corporate@email.com'],
    ['PHONE *',         'phone',          'tel',      '+91 XXXXX XXXXX'],
    ['PASSWORD *',      'password',       'password', PASSWORD_HINT],
    ['CONFIRM PASSWORD *', 'confirmPassword', 'password', 'Re-enter password'],
  ],
}

// "or" line between the email form and the Google button
function OrDivider({ children = 'or' }) {
  return (
    <div className="auth-divider" role="separator">
      <span>{children}</span>
    </div>
  )
}

// Advocate / Associate switch
function AccountTypeToggle({ value, onChange, types = ACCOUNT_TYPES }) {
  return (
    <div className="auth-account-type" role="tablist" aria-label="Account type">
      {types.map(t => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={value === t.value}
          className={`auth-account-type__btn${value === t.value ? ' auth-account-type__btn--active' : ''}`}
          onClick={() => onChange(t.value)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

// Login inputs used on the admin sign-in page
const ADMIN_FIELDS = [
  ['ADMIN EMAIL', 'email',    'email',    'admin@email.com'],
  ['PASSWORD',     'password', 'password', '••••••••'],
]

// Login, register, forgot-password and admin sign-in screens in one component (authPage decides which form shows)
export default function AuthPage({ onBack }) {
  const {
    authPage, setAuthPage,
    loginForm, setLoginForm,
    loginType, setLoginType,
    regForm, setRegForm,
    authError, handleLogin, handleRegister,
    handleGoogleLogin, handleGoogleRegister,
    googlePending, cancelGooglePending,
    isAdminRoute, isCorporateRoute,
    otpSent, otpCode, setOtpCode, otpVerified,
    otpSending, otpVerifying, otpResendInSec,
    handleSendOtp, handleVerifyOtp,
    forgotForm, setForgotForm, forgotOtpSent, forgotSending, forgotResetting,
    forgotResendInSec, startForgotPassword, cancelForgotPassword,
    handleSendForgotOtp, handleResetForgottenPassword,
    switchAccount,
  } = useApp()

  // On the corporate pages the register form is always the corporate one
  const regType = isCorporateRoute ? 'CORPORATE' : regForm.accountType

  // Accounts still signed in on this browser: offered on the sign-in tab so the user can go back to one without a password
  const savedAccounts = !isAdminRoute && authPage === 'login' ? getAccounts() : []

  // Page layout: back link, logo/heading, auth card (tabs, forms) and footer note
  return (
    <div className={`auth-page${isAdminRoute ? ' auth-page--admin' : ''}`}>
      {/* Photo backdrop (the admin sign-in keeps its plain red theme) */}
      {!isAdminRoute && <AuthBackdrop />}
      <div className="auth-container">

        {/* "Back to home" link (not on the admin route) */}
        {onBack && (
          <button type="button" className="auth-back-link" onClick={onBack}>← Back to home</button>
        )}

        {/* Logo and heading */}
        <div className="auth-logo">
          <div className="auth-logo__row">
            {isAdminRoute ? (
              <svg width="40" height="40" viewBox="0 0 36 36">
                <path
                  d="M18 3 L31 8 V16 C31 25 25.5 31 18 33 C10.5 31 5 25 5 16 V8 Z"
                  fill="none" stroke="#e05252" strokeWidth="2"
                />
                <path d="M12 17.5 L16.5 22 L25 12" fill="none" stroke="#e05252" strokeWidth="2.2"
                  strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <BrandMark size="lg" />
            )}
            <span className="auth-logo__name">InterNyay</span>
          </div>

          {isAdminRoute ? (
            <div className="auth-admin-badge"><Icon name="lock" /> Restricted Access · Administrators Only</div>
          ) : (
            <p className="auth-logo__tagline">{isCorporateRoute ? 'Corporate Account' : 'Legal Practice Management'}</p>
          )}
        </div>

        {/* Auth card */}
        <div className={`auth-card${isAdminRoute ? ' auth-card--admin' : ''}`}>

          {/* Login / Register tabs */}
          {!isAdminRoute && authPage !== 'forgot' && (
            <div className="auth-tabs">
              {['login', 'register'].map(tab => (
                <button
                  key={tab}
                  className={`auth-tab${authPage === tab ? ' auth-tab--active' : ''}`}
                  onClick={() => setAuthPage(tab)}
                >
                  {tab === 'login' ? 'Sign In' : 'Register'}
                </button>
              ))}
            </div>
          )}

          {/* Heading for the forgot password screen */}
          {!isAdminRoute && authPage === 'forgot' && (
            <div className="auth-admin-heading auth-admin-heading--gold">
              <span className="auth-admin-heading__icon"><Icon name="key" /></span>
              Reset Your Password
            </div>
          )}

          {/* Heading for the admin sign-in page */}
          {isAdminRoute && (
            <div className="auth-admin-heading">
              <span className="auth-admin-heading__icon"><Icon name="lock" /></span>
              Administrator Sign In
            </div>
          )}

          {/* Accounts that are already signed in: tap one to switch to it */}
          {savedAccounts.length > 0 && (
            <div className="auth-saved">
              <p className="auth-saved__label">Signed in on this device</p>
              {savedAccounts.map(account => (
                <button
                  key={account.id}
                  type="button"
                  className="auth-saved__item"
                  onClick={() => switchAccount(account.id)}
                >
                  <span className="auth-saved__avatar">
                    {account.user?.profilePicture
                      ? <img src={account.user.profilePicture} alt="" />
                      : <Icon name="user" />}
                  </span>
                  <span className="auth-saved__text">
                    <span className="auth-saved__name">{account.user?.name || 'Account'}</span>
                    <span className="auth-saved__email">{account.user?.email || ''}</span>
                  </span>
                  <span className="auth-saved__go">Continue</span>
                </button>
              ))}
              <p className="auth-saved__or">or sign in with another account</p>
            </div>
          )}

          {/* Error message from the last sign in, Google, register, OTP or password reset action */}
          <ErrorMessage message={authError} />

          {/* Admin sign-in form, or the login, forgot password and register forms for everyone else */}
          {isAdminRoute ? (
            <div className="auth-form">
              {ADMIN_FIELDS.map(([label, key, type, ph]) => (
                <div key={key}>
                  <label className="auth-field-label">{label}</label>
                  {type === 'password' ? (
                    <PasswordInput
                      className="auth-input"
                      placeholder={ph}
                      autoComplete="current-password"
                      value={loginForm[key]}
                      onChange={e => setLoginForm(f => ({ ...f, [key]: e.target.value }))}
                      onKeyDown={enterKey(() => handleLogin())}
                    />
                  ) : (
                    <input
                      className="auth-input"
                      type={type}
                      placeholder={ph}
                      value={loginForm[key]}
                      onChange={e => setLoginForm(f => ({ ...f, [key]: type === 'email' ? e.target.value.toLowerCase() : e.target.value }))}
                      onKeyDown={enterKey(() => handleLogin())}
                    />
                  )}
                </div>
              ))}
              <button type="button" className="auth-btn auth-btn--admin" onClick={handleLogin}>
                Sign In as Administrator
              </button>
              <p className="auth-footer-note">
                Administrator accounts can view and alter every record.
              </p>
            </div>
          ) : (
            <>
              {/* Login form (email + password, forgot password link and Google button) */}
              {authPage === 'login' && (
                <div className="auth-form">
                  {/* One email can have both an advocate and an associate account, so ask which one to open */}
                  {!isCorporateRoute && (
                    <div>
                      <label className="auth-field-label">SIGN IN AS</label>
                      <AccountTypeToggle value={loginType} onChange={setLoginType} />
                    </div>
                  )}
                  {LOGIN_FIELDS.map(([label, key, type, ph]) => (
                    <div key={key}>
                      <label className="auth-field-label">{label}</label>
                      {type === 'password' ? (
                        <PasswordInput
                          className="auth-input"
                          placeholder={ph}
                          autoComplete="current-password"
                          value={loginForm[key]}
                          onChange={e => setLoginForm(f => ({ ...f, [key]: e.target.value }))}
                          onKeyDown={enterKey(() => handleLogin())}
                        />
                      ) : (
                        <input
                          className="auth-input"
                          type={type}
                          placeholder={ph}
                          value={loginForm[key]}
                          onChange={e => setLoginForm(f => ({ ...f, [key]: type === 'email' ? e.target.value.toLowerCase() : e.target.value }))}
                          onKeyDown={enterKey(() => handleLogin())}
                        />
                      )}
                    </div>
                  ))}
                  <button type="button" className="auth-btn" onClick={handleLogin}>
                    Sign In to Practice
                  </button>
                  <button
                    type="button"
                    className="auth-link-btn auth-forgot-link"
                    onClick={startForgotPassword}
                  >
                    Forgot password?
                  </button>

                  {googleEnabled && (
                    <>
                      <OrDivider />
                      <p className="auth-hint auth-hint--center">
                        Signing in with Google to your {isCorporateRoute ? 'corporate' : loginType === 'ASSOCIATE' ? 'associate' : 'advocate'} account
                      </p>
                      <GoogleButton onCredential={handleGoogleLogin} />
                    </>
                  )}
                </div>
              )}

              {/* Forgot password: enter email, receive a code, then set a new password */}
              {authPage === 'forgot' && (
                <div className="auth-form">
                  {!isCorporateRoute && (
                    <AccountTypeToggle
                      value={forgotForm.accountType}
                      onChange={accountType => setForgotForm(f => ({ ...f, accountType }))}
                    />
                  )}

                  <div>
                    <label className="auth-field-label">EMAIL</label>
                    <input
                      className="auth-input"
                      type="email"
                      placeholder="you@email.com"
                      autoComplete="email"
                      value={forgotForm.email}
                      onChange={e => setForgotForm(f => ({ ...f, email: e.target.value.toLowerCase() }))}
                      onKeyDown={enterKey(() => !forgotOtpSent && handleSendForgotOtp())}
                    />
                  </div>

                  {!forgotOtpSent ? (
                    <button type="button"
                      className="auth-btn"
                      onClick={handleSendForgotOtp}
                      disabled={forgotSending}
                    >
                      {forgotSending ? 'Sending…' : 'Send verification code'}
                    </button>
                  ) : (
                    <>
                      <div>
                        <label className="auth-field-label">6-DIGIT CODE</label>
                        <div className="auth-otp-row">
                          <input
                            className="auth-input auth-otp-code-input"
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
                          <button
                            type="button"
                            className="auth-otp-btn"
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
                        <p className="auth-hint auth-otp-hint">
                          Enter the 6-digit code we emailed to {forgotForm.email || 'your address'}.
                        </p>
                      </div>

                      <div>
                        <label className="auth-field-label">NEW PASSWORD</label>
                        <PasswordInput
                          className="auth-input"
                          autoComplete="new-password"
                          placeholder={PASSWORD_HINT}
                          showToggle={false}
                          value={forgotForm.newPassword}
                          onChange={e => setForgotForm(f => ({ ...f, newPassword: e.target.value }))}
                        />
                      </div>

                      <div>
                        <label className="auth-field-label">CONFIRM NEW PASSWORD</label>
                        <PasswordInput
                          className="auth-input"
                          autoComplete="new-password"
                          placeholder="Re-enter password"
                          value={forgotForm.confirmPassword}
                          onChange={e => setForgotForm(f => ({ ...f, confirmPassword: e.target.value }))}
                          onKeyDown={enterKey(() => handleResetForgottenPassword())}
                        />
                      </div>

                      <button type="button"
                        className="auth-btn"
                        onClick={handleResetForgottenPassword}
                        disabled={forgotResetting}
                      >
                        {forgotResetting ? 'Resetting…' : 'Reset Password'}
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    className="auth-link-btn auth-forgot-link"
                    onClick={cancelForgotPassword}
                  >
                    <Icon name="arrow-left" />Back to Sign In
                  </button>
                </div>
              )}

              {/* Registration form: account type, details, email OTP verification and Google sign-up */}
              {authPage === 'register' && (
                <div className="auth-form auth-form--register">
                  {!isCorporateRoute && (
                    <AccountTypeToggle
                      value={regForm.accountType}
                      onChange={accountType => {
                        cancelGooglePending()
                        setRegForm(f => ({ ...f, accountType }))
                      }}
                    />
                  )}
                  {/* Associates enter the advocate code shown on their advocate's profile */}
                  {regType === 'ASSOCIATE' && (
                    <p className="auth-hint">
                      Ask your advocate for the code shown on their Profile page. It links your
                      account to their practice — you can work on their cases, clients and
                      documents, but not see fees or transactions.
                    </p>
                  )}
                  {/* A corporate account registers here, then asks for the Corporate plan; its advocates get their accounts from it */}
                  {regType === 'CORPORATE' && (
                    <p className="auth-hint">
                      For companies and organisations that hire advocates. You create the advocate accounts and allot cases to them.
                      After signing up, a request for the Corporate plan is sent to the InterNyay team, who will activate it for you.
                    </p>
                  )}
                  {REGISTER_FIELDS[regType].map(([label, key, type, ph]) => key === 'specialization' ? (
                    <div key={key}>
                      <label className="auth-field-label">{starLabel(label)}</label>
                      <SpecializationSelect
                        className="auth-input"
                        inputClassName="auth-input auth-input--follow"
                        value={regForm.specialization || ''}
                        onChange={value => setRegForm(f => ({ ...f, specialization: value }))}
                      />
                    </div>
                  ) : key === 'email' ? (
                    <div key={key}>
                      <label className="auth-field-label">{starLabel(label)}</label>
                      <div className="auth-otp-row">
                        <input
                          className="auth-input"
                          type={type}
                          placeholder={ph}
                          autoComplete="email"
                          value={regForm[key] || ''}
                          onChange={e => setRegForm(f => ({ ...f, [key]: e.target.value.toLowerCase() }))}
                          onKeyDown={enterKey(() => !otpVerified && handleSendOtp())}
                        />
                        {otpVerified ? (
                          <span className="auth-otp-badge"><Icon name="check" /> Verified</span>
                        ) : (
                          <button
                            type="button"
                            className="auth-otp-btn"
                            onClick={handleSendOtp}
                            disabled={otpSending || otpResendInSec > 0}
                          >
                            {otpSending
                              ? 'Sending…'
                              : otpResendInSec > 0
                                ? `Resend in ${otpResendInSec}s`
                                : otpSent ? 'Resend code' : 'Send code'}
                          </button>
                        )}
                      </div>

                      {/* Enter the 6-digit code that was emailed */}
                      {otpSent && !otpVerified && (
                        <>
                          <div className="auth-otp-row auth-otp-row--follow">
                            <input
                              className="auth-input auth-otp-code-input"
                              type="text"
                              inputMode="numeric"
                              autoComplete="one-time-code"
                              maxLength={6}
                              placeholder="6-digit code"
                              value={otpCode}
                              onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                              onKeyDown={enterKey(() => handleVerifyOtp())}
                            />
                            <button
                              type="button"
                              className="auth-otp-btn auth-otp-btn--verify"
                              onClick={handleVerifyOtp}
                              disabled={otpVerifying || otpCode.length !== 6}
                            >
                              {otpVerifying ? 'Verifying…' : 'Verify'}
                            </button>
                          </div>
                          <p className="auth-hint auth-otp-hint">
                            Enter the 6-digit code we emailed to {regForm.email || 'your address'}.
                          </p>
                        </>
                      )}
                    </div>
                  ) : type === 'password' ? (
                    <div key={key}>
                      <label className="auth-field-label">{starLabel(label)}</label>
                      <PasswordInput
                        className="auth-input"
                        autoComplete="new-password"
                        placeholder={ph}
                        showToggle={key !== 'password'}
                        value={regForm[key] || ''}
                        onChange={e => setRegForm(f => ({ ...f, [key]: e.target.value }))}
                        onKeyDown={enterKey(() => otpVerified && handleRegister())}
                      />
                    </div>
                  ) : (
                    <div key={key}>
                      <label className="auth-field-label">{starLabel(label)}</label>
                      <input
                        className="auth-input"
                        type={type}
                        placeholder={ph}
                        value={regForm[key] || ''}
                        onChange={e => setRegForm(f => ({ ...f, [key]: e.target.value }))}
                        onKeyDown={enterKey(() => otpVerified && handleRegister())}
                        {...(key === 'advocateCode' ? {
                          autoCapitalize: 'characters',
                          autoComplete: 'off',
                          spellCheck: false,
                          maxLength: 16,
                        } : {})}
                        {...(key === 'phone' ? {
                          inputMode: 'tel',
                          autoComplete: 'tel',
                          required: true,
                          maxLength: 16,
                          pattern: '^(\\+91[\\s-]?|0)?[6-9]\\d{9}$',
                          title: 'Enter a valid 10-digit Indian mobile number (optionally with +91)',
                        } : {})}
                      />
                    </div>
                  ))}
                  <button type="button"
                    className="auth-btn"
                    onClick={handleRegister}
                    disabled={!otpVerified}
                    title={otpVerified ? '' : 'Verify your email first'}
                  >
                    {{ ASSOCIATE: 'Create Associate Account', CORPORATE: 'Create Corporate Account' }[regType] || 'Create Practice Account'}
                  </button>
                  {/* Reminder that the email must be verified first */}
                  {!otpVerified && (
                    <p className="auth-hint auth-otp-hint auth-otp-hint--center">
                      Verify your email above to create your account.
                    </p>
                  )}

                  {googleEnabled && (
                    <>
                      <OrDivider>or sign up with Google instead</OrDivider>

                      <GoogleButton onCredential={handleGoogleRegister} />
                      <p className="auth-hint auth-hint--center">
                        Uses your Google name and email — no password or emailed code needed.
                        {regType === 'ASSOCIATE'
                          ? ' New associates will be asked for their mobile number and advocate code in the next step.'
                          : ' New accounts will be asked for their mobile number in the next step.'}
                      </p>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {/* Corporate accounts have their own pages: a link each way */}
        {!isAdminRoute && (
          <p className="auth-footer-note">
            {isCorporateRoute
              ? <>Not a corporate account? <Link to={AUTH_PATHS[authPage] || AUTH_PATHS.login}>Advocate / Associate {authPage === 'register' ? 'registration' : 'sign in'}</Link></>
              : <>Registering a company or organisation? <Link to={CORPORATE_AUTH_PATHS[authPage] || CORPORATE_AUTH_PATHS.login}>Corporate {authPage === 'register' ? 'registration' : 'sign in'}</Link></>}
          </p>
        )}
        <p className="auth-footer-note">Secured & Encrypted</p>
      </div>

      {/* Asks a new Google sign-up for the details Google does not give (mobile number, plus the advocate code for associates) in its own window */}
      {googlePending && <GoogleSignupModal />}
    </div>
  )
}