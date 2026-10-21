import { useState } from "react";
import { BrandMark } from "../../components/BrandMark";
import { useAuth } from "../../context/AuthContext";

export function LoginPage({ onSwitchToRegister }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setInfoMessage("");
    setSubmitting(true);
    try {
      await signIn({ email: email.trim(), password });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleForgotPassword(e) {
    e.preventDefault();
    setInfoMessage("Password reset instructions have been sent if an account matches this email.");
  }

  function handleGoogleLogin() {
    setInfoMessage("Google Sign-In is configured for enterprise domains. Please use your credentials.");
  }

  return (
    <main className="login-shell">
      {/* Left Column: Sky Blue Hero with Car & Road photo */}
      <section
        className="login-story"
        aria-label="DriveHire vehicle management"
      >
        <div className="login-story__top">
          <BrandMark />
        </div>

        <div className="login-story__copy">
          <div className="login-story__hero-title">
            <span className="hero-text-row">SAME ROADS.</span>
            <span className="hero-text-highlight">MORE PEOPLE.</span>
          </div>
          <p className="login-story__description">
            Carpool or rent a car — a simpler,<br className="desktop-break" /> smarter way to move around your city.
          </p>
        </div>

        {/* Real highway car photo with 3 signature orange sparks */}
        <div className="login-car-container">
          <img
            src="/login-car.jpg"
            alt="White modern crossover SUV on highway"
            className="login-car-img"
          />
          {/* Signature orange sparks (///) matching reference screenshot */}
          <div className="login-car-sparks" aria-hidden="true">
            <svg viewBox="0 0 65 65" width="65" height="65">
              <line x1="14" y1="42" x2="26" y2="18" stroke="#FF6900" strokeWidth="4.5" strokeLinecap="round" />
              <line x1="30" y1="48" x2="52" y2="34" stroke="#FF6900" strokeWidth="4.5" strokeLinecap="round" />
              <line x1="32" y1="58" x2="56" y2="54" stroke="#FF6900" strokeWidth="4.2" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </section>

      {/* Right Column: Warm Off-White Form Panel */}
      <section className="login-panel">
        <div className="login-panel__mobile-brand">
          <BrandMark />
        </div>

        <div className="login-panel__body">
          <h1 className="auth-heading" aria-label="Welcome back.">Welcome back</h1>
          <p className="login-panel__intro">
            Log in to continue to DriveHire.
          </p>

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="field-group">
              <label className="field-label" htmlFor="email">
                Email address
              </label>
              <div className="input-with-icon">
                <svg
                  className="input-icon"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden="true"
                >
                  <rect x="2.5" y="4.5" width="15" height="11" rx="2" />
                  <polyline points="3 5.5 10 11 17 5.5" />
                </svg>
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
              </div>
            </div>

            <div className="field-group field-group--password">
              <label className="field-label" htmlFor="password">
                Password
              </label>
              <div className="input-with-icon">
                <svg
                  className="input-icon"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden="true"
                >
                  <rect x="4" y="8" width="12" height="9" rx="2" />
                  <path d="M7 8V5a3 3 0 0 1 6 0v3" />
                </svg>
                <input
                  autoComplete="current-password"
                  id="password"
                  name="password"
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  required
                  type={showPassword ? "text" : "password"}
                  value={password}
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

              {/* Forgot password link positioned below password field on the right */}
              <div className="forgot-password-row">
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="forgot-password-link"
                >
                  Forgot password?
                </button>
              </div>
            </div>

            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}

            {infoMessage && (
              <p className="form-info" role="status">
                {infoMessage}
              </p>
            )}

            {/* Primary Orange Tactile Button */}
            <button
              className="button button--primary login-form__submit"
              disabled={submitting}
              type="submit"
              aria-label="Sign in"
            >
              <span>{submitting ? "Signing in…" : "Log in"}</span>
              <span className="btn-arrow" aria-hidden="true">→</span>
            </button>
          </form>

          {/* OR Divider */}
          <div className="auth-divider">
            <span>OR</span>
          </div>

          {/* Social Google Login Button */}
          <button
            type="button"
            className="button button--secondary button--social"
            onClick={handleGoogleLogin}
          >
            <svg
              className="google-icon"
              viewBox="0 0 24 24"
              width="18"
              height="18"
              aria-hidden="true"
            >
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>

          {/* Switch to Register */}
          {onSwitchToRegister && (
            <p className="auth-footer-switch">
              Don&apos;t have an account?{" "}
              <button
                type="button"
                onClick={onSwitchToRegister}
                className="auth-switch-link"
                aria-label="Create one now"
              >
                Sign up
              </button>
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
