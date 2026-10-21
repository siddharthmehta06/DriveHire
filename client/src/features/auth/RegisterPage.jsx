import { useState } from "react";
import { BrandMark } from "../../components/BrandMark";
import { useAuth } from "../../context/AuthContext";

const ACCOUNT_TYPES = [
  { value: "USER", label: "Owner" },
  { value: "DRIVER", label: "Driver" },
  { value: "ADMIN", label: "Admin" },
];

export function RegisterPage({ onSwitchToLogin }) {
  const { signUp } = useAuth();
  const [role, setRole] = useState("USER");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [adminInviteCode, setAdminInviteCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (
      !/(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,128}/.test(
        password,
      ) ||
      /^(password|password123|qwerty123|letmein123|welcome123)!?$/i.test(
        password,
      )
    ) {
      setError(
        "Use 8 or more characters with uppercase, lowercase, a number, and a special character.",
      );
      return;
    }

    setSubmitting(true);
    try {
      await signUp({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        password,
        role,
        ...(role === "ADMIN" ? { adminInviteCode } : {}),
      });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-shell">
      {/* Left Column: Sky Blue Hero Panel */}
      <section className="login-story" aria-label="DriveHire registration">
        <div className="login-story__top">
          <BrandMark />
          <span className="eyebrow login-story__edition">
            JOIN THE FLEET / INDIA
          </span>
        </div>

        <div className="login-story__copy">
          <div className="login-story__hero-title">
            <span className="hero-text-row">SAME ROADS.</span>
            <span className="hero-text-highlight">MORE PEOPLE.</span>
          </div>
          <p className="login-story__description">
            Register to access shared rides, list vehicles, and experience a simpler, smarter commute.
          </p>
        </div>

        {/* Dynamic car illustration emerging from bottom left */}
        <div
          className="vehicle-drawing"
          aria-label="Modern car profile on the open road"
        >
          <svg
            viewBox="0 0 600 360"
            role="img"
            aria-labelledby="vehicle-title-reg"
            className="login-car-svg"
          >
            <title id="vehicle-title-reg">DriveHire vehicle on the road</title>
            <defs>
              <linearGradient id="roadGradReg" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#757575" />
                <stop offset="50%" stopColor="#9E9E9E" />
                <stop offset="100%" stopColor="#BDBDBD" />
              </linearGradient>
              <linearGradient id="carBodyGradReg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FFFFFF" />
                <stop offset="70%" stopColor="#F5F5F5" />
                <stop offset="100%" stopColor="#E0E0E0" />
              </linearGradient>
              <linearGradient id="glassGradReg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1E293B" />
                <stop offset="100%" stopColor="#0F172A" />
              </linearGradient>
              <linearGradient id="tailLightGradReg" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#DC2626" />
                <stop offset="70%" stopColor="#EF4444" />
                <stop offset="100%" stopColor="#F87171" />
              </linearGradient>
            </defs>

            <path d="M320 280 L600 240 L600 360 L0 360 L0 300 Z" fill="#94A3B8" opacity="0.25" />
            <polygon points="120,360 600,290 600,360" fill="url(#roadGradReg)" opacity="0.6" />
            <line x1="280" y1="355" x2="350" y2="335" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" opacity="0.8" />
            <line x1="400" y1="322" x2="455" y2="308" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" opacity="0.8" />
            <line x1="490" y1="300" x2="535" y2="290" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" opacity="0.8" />

            <g className="car-spark-rays" stroke="#FF6900" strokeWidth="4.5" strokeLinecap="round">
              <line x1="165" y1="125" x2="178" y2="108" />
              <line x1="180" y1="138" x2="200" y2="135" />
              <line x1="185" y1="160" x2="205" y2="162" />
            </g>

            <ellipse cx="110" cy="350" rx="140" ry="16" fill="#111111" opacity="0.35" />
            <path
              d="M-40 200 Q -10 170 30 160 Q 80 155 120 180 Q 145 195 160 230 Q 175 270 160 310 L 155 350 L -40 350 Z"
              fill="url(#carBodyGradReg)"
              stroke="#111111"
              strokeWidth="2.5"
            />
            <path
              d="M20 160 Q 45 120 75 105 Q 115 100 135 130 Q 148 150 155 185 Q 158 215 150 240 Z"
              fill="url(#carBodyGradReg)"
              stroke="#111111"
              strokeWidth="2"
            />
            <path
              d="M75 112 Q 105 110 125 135 Q 138 160 142 200 L 115 200 Q 100 170 65 140 Z"
              fill="url(#glassGradReg)"
              stroke="#0F172A"
              strokeWidth="1.5"
            />
            <path d="M 5 240 L 65 242 Q 105 244 115 260 L 112 280 Q 85 285 5 280 Z" fill="url(#tailLightGradReg)" stroke="#991B1B" strokeWidth="1.5" />
            <path d="M 10 250 L 65 252 Q 95 254 105 265 L 100 272 Q 75 275 10 272 Z" fill="#FCA5A5" opacity="0.9" />
            <path d="M 0 310 Q 50 315 110 310 L 115 340 L 0 340 Z" fill="#E2E8F0" stroke="#CBD5E1" strokeWidth="1" />
            <rect x="70" y="325" width="28" height="6" rx="3" fill="#EF4444" />
            <path d="M 148 238 Q 165 235 170 245 Q 165 255 145 252 Z" fill="#1E293B" stroke="#111111" strokeWidth="1.5" />
          </svg>
        </div>

        <div className="login-story__foot">
          <span>DriveHire — Building connected mobility.</span>
          <span>EST. 2026</span>
        </div>
      </section>

      {/* Right Column: Warm Off-White Registration Form */}
      <section className="login-panel">
        <div className="login-panel__mobile-brand">
          <BrandMark />
        </div>

        <div className="login-panel__body">
          <p className="eyebrow">CREATE ACCOUNT</p>
          <h2 className="auth-heading">Get started.</h2>
          <p className="login-panel__intro">
            Create your DriveHire account to begin.
          </p>

          <div
            className="account-switch"
            role="tablist"
            aria-label="Choose account type"
          >
            {ACCOUNT_TYPES.map((account) => (
              <button
                aria-selected={role === account.value}
                className={
                  role === account.value
                    ? "account-switch__option is-selected"
                    : "account-switch__option"
                }
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
            <div className="field-group">
              <label className="field-label" htmlFor="reg-name">
                Full name
              </label>
              <div className="input-with-icon">
                <svg className="input-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M16 17v-1.5a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4V17" />
                  <circle cx="10" cy="7" r="3.5" />
                </svg>
                <input
                  autoComplete="name"
                  id="reg-name"
                  name="name"
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  required
                  type="text"
                  value={name}
                />
              </div>
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="reg-email">
                Email address
              </label>
              <div className="input-with-icon">
                <svg className="input-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <rect x="2.5" y="4.5" width="15" height="11" rx="2" />
                  <polyline points="3 5.5 10 11 17 5.5" />
                </svg>
                <input
                  autoComplete="email"
                  id="reg-email"
                  name="email"
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  type="email"
                  value={email}
                />
              </div>
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="reg-phone">
                Mobile number{" "}
                <span className="field-optional">(optional)</span>
              </label>
              <div className="input-with-icon">
                <svg className="input-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M4 3h12a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
                  <line x1="8" y1="14" x2="12" y2="14" strokeLinecap="round" />
                </svg>
                <input
                  autoComplete="tel"
                  id="reg-phone"
                  name="phone"
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="9876543210"
                  type="tel"
                  value={phone}
                />
              </div>
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="reg-password">
                Password
              </label>
              <div className="input-with-icon">
                <svg className="input-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <rect x="4" y="8" width="12" height="9" rx="2" />
                  <path d="M7 8V5a3 3 0 0 1 6 0v3" />
                </svg>
                <input
                  autoComplete="new-password"
                  id="reg-password"
                  name="password"
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Use at least 8 characters"
                  pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,128}"
                  required
                  type={showPassword ? "text" : "password"}
                  value={password}
                  minLength={8}
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18" aria-hidden="true">
                      <path d="M2.5 10s3-5.5 7.5-5.5 7.5 5.5 7.5 5.5-3 5.5-7.5 5.5S2.5 10 2.5 10Z" />
                      <circle cx="10" cy="10" r="2.5" />
                      <line x1="3" y1="3" x2="17" y2="17" strokeWidth="1.8" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18" aria-hidden="true">
                      <path d="M2.5 10s3-5.5 7.5-5.5 7.5 5.5 7.5 5.5-3 5.5-7.5 5.5S2.5 10 2.5 10Z" />
                      <circle cx="10" cy="10" r="2.5" />
                    </svg>
                  )}
                </button>
              </div>
              <p className="password-guidance">
                At least 8 characters with uppercase, lowercase, number, and special character.
              </p>
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="reg-confirm-password">
                Confirm password
              </label>
              <div className="input-with-icon">
                <svg className="input-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <rect x="4" y="8" width="12" height="9" rx="2" />
                  <path d="M7 8V5a3 3 0 0 1 6 0v3" />
                </svg>
                <input
                  autoComplete="new-password"
                  id="reg-confirm-password"
                  name="confirmPassword"
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  required
                  type="password"
                  value={confirmPassword}
                  minLength={8}
                />
              </div>
            </div>

            {role === "ADMIN" && (
              <div className="field-group">
                <label className="field-label" htmlFor="admin-invite-code">
                  Administrator invite code
                </label>
                <div className="input-with-icon">
                  <svg className="input-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <circle cx="7" cy="10" r="3" />
                    <line x1="10" y1="10" x2="16" y2="10" />
                    <line x1="14" y1="10" x2="14" y2="13" />
                  </svg>
                  <input
                    autoComplete="off"
                    id="admin-invite-code"
                    onChange={(event) =>
                      setAdminInviteCode(event.target.value)
                    }
                    required
                    type="password"
                    value={adminInviteCode}
                  />
                </div>
              </div>
            )}

            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}

            {/* Primary Orange Tactile Button */}
            <button
              className="button button--primary login-form__submit"
              disabled={submitting}
              type="submit"
            >
              <span>{submitting ? "Creating account…" : "Create account"}</span>
              <span className="btn-arrow" aria-hidden="true">→</span>
            </button>
          </form>

          {onSwitchToLogin && (
            <p className="auth-footer-switch">
              Already have an account?{" "}
              <button
                type="button"
                onClick={onSwitchToLogin}
                className="auth-switch-link"
              >
                Sign in instead
              </button>
            </p>
          )}

          <p className="login-panel__security">
            <span className="security-mark" aria-hidden="true">
              ●
            </span>
            Your data is stored securely and never shared with third parties.
          </p>
        </div>

        <footer className="legal-footer">
          <span>© {new Date().getFullYear()} DriveHire</span>
          <span>
            <a href="/terms">Terms</a>
            <a href="/privacy">Privacy</a>
          </span>
        </footer>
      </section>
    </main>
  );
}
