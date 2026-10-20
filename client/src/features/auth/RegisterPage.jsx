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
      <section className="login-story" aria-label="DriveHire registration">
        <div className="login-story__top">
          <BrandMark />
          <span className="eyebrow login-story__edition">
            MOBILITY OPERATIONS / INDIA
          </span>
        </div>
        <div className="login-story__copy">
          <p className="eyebrow">JOIN THE COMMUNITY</p>
          <h1>
            Start your
            <br />
            journey here.
          </h1>
          <p className="login-story__description">
            Register to access vehicles, carpools, and everything that keeps you
            moving.
          </p>
        </div>
        <div
          className="vehicle-drawing"
          aria-label="Technical profile drawing of a modern passenger car"
        >
          <svg
            viewBox="0 0 780 300"
            role="img"
            aria-labelledby="vehicle-title-reg"
          >
            <title id="vehicle-title-reg">DriveHire vehicle profile</title>
            <path className="vehicle-drawing__shadowline" d="M71 220h640" />
            <path
              className="vehicle-drawing__body"
              d="M110 197c8-28 20-48 45-59l105-23 88-65c13-9 29-14 45-14h108c29 0 51 12 70 36l60 69 39 13c18 6 29 21 29 39v23H91v-10c0-5 6-9 19-9Z"
            />
            <path
              className="vehicle-drawing__glass"
              d="m278 110 78-55c9-6 20-10 32-10h74v59H278Zm201-65h22c24 0 42 10 57 28l32 41H479V45Z"
            />
            <path
              className="vehicle-drawing__line"
              d="M275 111h365M380 46v70M477 43v130M196 141h53M633 143h30"
            />
            <path
              className="vehicle-drawing__line"
              d="M122 176h68m475 0h47M304 173h42m121 0h43"
            />
            <circle
              className="vehicle-drawing__wheel"
              cx="232"
              cy="215"
              r="43"
            />
            <circle className="vehicle-drawing__hub" cx="232" cy="215" r="18" />
            <circle
              className="vehicle-drawing__wheel"
              cx="590"
              cy="215"
              r="43"
            />
            <circle className="vehicle-drawing__hub" cx="590" cy="215" r="18" />
            <path
              className="vehicle-drawing__detail"
              d="M213 215h38m320 0h38M154 150h27m476 0h17M680 166l23 8"
            />
          </svg>
          <div className="vehicle-drawing__caption">
            <span>NEW MEMBER / 01</span>
            <span>BUILT FOR THE ROAD AHEAD</span>
          </div>
        </div>
        <div className="login-story__foot">
          <span>Thoughtful mobility, built around you.</span>
          <span>02 / 03</span>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-panel__mobile-brand">
          <BrandMark />
        </div>
        <div className="login-panel__body">
          <p className="eyebrow">CREATE ACCOUNT</p>
          <h2>Get started.</h2>
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
                <label className="field-label" htmlFor="reg-name">
                  Full name
                </label>
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

                <label className="field-label" htmlFor="reg-email">
                  Email address
                </label>
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

                <label className="field-label" htmlFor="reg-phone">
                  Mobile number{" "}
                  <span style={{ fontWeight: "normal", opacity: 0.6 }}>
                    (optional)
                  </span>
                </label>
                <input
                  autoComplete="tel"
                  id="reg-phone"
                  name="phone"
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="9876543210"
                  type="tel"
                  value={phone}
                />

                <label className="field-label" htmlFor="reg-password">
                  Password
                </label>
                <input
                  autoComplete="new-password"
                  id="reg-password"
                  name="password"
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Use at least 8 characters"
                  pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,128}"
                  required
                  type="password"
                  value={password}
                  minLength={8}
                />
                <p className="password-guidance">
                  At least 8 characters with uppercase, lowercase, number, and
                  special character. 12 or more is recommended.
                </p>

                <label className="field-label" htmlFor="reg-confirm-password">
                  Confirm password
                </label>
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

                {role === "ADMIN" && (
                  <>
                    <label className="field-label" htmlFor="admin-invite-code">
                      Administrator invite code
                    </label>
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
                  </>
                )}

                {error && (
                  <p className="form-error" role="alert">
                    {error}
                  </p>
                )}
                <button
                  className="button button--primary login-form__submit"
                  disabled={submitting}
                  type="submit"
                >
                  {submitting ? "Creating account…" : "Create account"}
                  <span aria-hidden="true">↗</span>
                </button>
              </form>

          <p className="login-panel__security" style={{ marginTop: "1.5rem" }}>
            Already have an account?{" "}
            <button
              type="button"
              onClick={onSwitchToLogin}
              className="text-button"
              style={{
                color: "var(--color-accent, #2563eb)",
                textDecoration: "underline",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            >
              Sign in instead
            </button>
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
