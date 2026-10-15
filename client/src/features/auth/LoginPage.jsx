import { useState } from 'react';
import { BrandMark } from '../../components/BrandMark';
import { useAuth } from '../../context/AuthContext';

const ACCOUNT_TYPES = [
  { value: 'USER', label: 'Owner' },
  { value: 'DRIVER', label: 'Driver' },
  { value: 'ADMIN', label: 'Admin' },
];

export function LoginPage({ onSwitchToRegister }) {
  const { signIn } = useAuth();
  const [role, setRole] = useState('USER');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signIn({ email: email.trim(), password, role });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-story" aria-label="DriveHire vehicle management">
        <div className="login-story__top">
          <BrandMark />
          <span className="eyebrow login-story__edition">MOBILITY OPERATIONS / INDIA</span>
        </div>
        <div className="login-story__copy">
          <p className="eyebrow">YOUR FLEET, IN CLEAR VIEW</p>
          <h1>Make every<br />journey count.</h1>
          <p className="login-story__description">
            A considered home for the vehicles, people and work that keep you moving.
          </p>
        </div>
        <div className="vehicle-drawing" aria-label="Technical profile drawing of a modern passenger car">
          <svg viewBox="0 0 780 300" role="img" aria-labelledby="vehicle-title">
            <title id="vehicle-title">DriveHire vehicle profile</title>
            <path className="vehicle-drawing__shadowline" d="M71 220h640" />
            <path className="vehicle-drawing__body" d="M110 197c8-28 20-48 45-59l105-23 88-65c13-9 29-14 45-14h108c29 0 51 12 70 36l60 69 39 13c18 6 29 21 29 39v23H91v-10c0-5 6-9 19-9Z" />
            <path className="vehicle-drawing__glass" d="m278 110 78-55c9-6 20-10 32-10h74v59H278Zm201-65h22c24 0 42 10 57 28l32 41H479V45Z" />
            <path className="vehicle-drawing__line" d="M275 111h365M380 46v70M477 43v130M196 141h53M633 143h30" />
            <path className="vehicle-drawing__line" d="M122 176h68m475 0h47M304 173h42m121 0h43" />
            <circle className="vehicle-drawing__wheel" cx="232" cy="215" r="43" />
            <circle className="vehicle-drawing__hub" cx="232" cy="215" r="18" />
            <circle className="vehicle-drawing__wheel" cx="590" cy="215" r="43" />
            <circle className="vehicle-drawing__hub" cx="590" cy="215" r="18" />
            <path className="vehicle-drawing__detail" d="M213 215h38m320 0h38M154 150h27m476 0h17M680 166l23 8" />
          </svg>
          <div className="vehicle-drawing__caption">
            <span>VEHICLE REGISTER / 01</span>
            <span>DESIGNED FOR THE ROAD AHEAD</span>
          </div>
        </div>
        <div className="login-story__foot">
          <span>Thoughtful mobility, built around you.</span>
          <span>01 / 03</span>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-panel__mobile-brand"><BrandMark /></div>
        <div className="login-panel__body">
          <p className="eyebrow">ACCOUNT ACCESS</p>
          <h2>Welcome back.</h2>
          <p className="login-panel__intro">Sign in to continue to your DriveHire workspace.</p>

          <div className="account-switch" role="tablist" aria-label="Choose account type">
            {ACCOUNT_TYPES.map((account) => (
              <button
                aria-selected={role === account.value}
                className={role === account.value ? 'account-switch__option is-selected' : 'account-switch__option'}
                key={account.value}
                onClick={() => setRole(account.value)}
                role="tab"
                type="button"
              >
                {account.label}
              </button>
            ))}
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            <label className="field-label" htmlFor="email">Email address</label>
            <input
              autoComplete="username"
              id="email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
              type="email"
              value={email}
            />

            <div className="field-label-row">
              <label className="field-label" htmlFor="password">Password</label>
              <span className="field-note">Secure account access</span>
            </div>
            <input
              autoComplete="current-password"
              id="password"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              required
              type="password"
              value={password}
            />
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button--primary login-form__submit" disabled={submitting} type="submit">
              {submitting ? 'Signing in…' : 'Sign in'}
              <span aria-hidden="true">↗</span>
            </button>
          </form>

          <p className="login-panel__security">
            <span className="security-mark" aria-hidden="true">●</span>
            Your account and vehicle information stay protected.
          </p>
          {onSwitchToRegister && (
            <p className="login-panel__security" style={{ marginTop: '1rem' }}>
              Don&apos;t have an account?{' '}
              <button type="button" onClick={onSwitchToRegister} className="text-button" style={{ color: 'var(--color-accent, #2563eb)', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                Create one now
              </button>
            </p>
          )}
        </div>
        <footer className="legal-footer">
          <span>© {new Date().getFullYear()} DriveHire</span>
          <span><a href="/terms">Terms</a><a href="/privacy">Privacy</a></span>
        </footer>
      </section>
    </main>
  );
}
