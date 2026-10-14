import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { RideShell } from '../../rides/components/RideShell';
import { getCommissionConfig, updateCommissionConfig } from '../api';

export function AdminCommissionPage() {
  const { user, token, signOut } = useAuth();

  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [rateInput, setRateInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await getCommissionConfig(token);
      setConfig(response.data);
      setRateInput(response.data?.commissionRatePct || '');
    } catch (err) {
      setError(err.message || 'Unable to retrieve pricing configuration.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  async function handleUpdate(e) {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    const val = Number(rateInput);
    if (isNaN(val) || val < 0 || val > 50) {
      setError('Commission rate must be a number between 0% and 50%.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await updateCommissionConfig(token, {
        commissionRatePct: Number(val.toFixed(2)),
      });
      setConfig(response.data);
      setSuccessMsg(
        `Platform commission rate successfully updated to ${response.data.commissionRatePct}%.`
      );
    } catch (err) {
      setError(err.message || 'Failed to update commission rate.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <RideShell signOut={signOut} user={user}>
      <div className="admin-page-container">
        <div className="page-heading">
          <div>
            <p className="eyebrow">ADMINISTRATIVE SETTINGS</p>
            <h1>Commission & Pricing</h1>
            <p className="page-heading__subtitle">
              Configure the platform commission percentage applied to all carpooling and rental bookings.
            </p>
          </div>
          <a href="/admin/promo-codes" className="secondary-button">
            Manage Promo Codes →
          </a>
        </div>

        {error && <div className="inline-alert" role="alert">{error}</div>}
        {successMsg && (
          <div
            className="inline-alert"
            role="status"
            style={{ borderColor: 'var(--color-ink, #244b43)', background: '#f4f9f6', color: '#1b5e20' }}
          >
            {successMsg}
          </div>
        )}

        {loading ? (
          <div className="table-loading" style={{ margin: '2rem 0' }}>
            <div className="skeleton-line skeleton-line--wide" />
            <div className="skeleton-line" />
          </div>
        ) : (
          <div className="admin-card-grid">
            <div className="admin-card">
              <h2 className="admin-card__title">Platform Commission Rate</h2>
              <p style={{ color: 'var(--ink-soft)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                The commission rate is automatically snapshotted whenever a booking completes and deducted
                from the gross fare. Allowed range: <strong>0.00% to 50.00%</strong>.
              </p>

              <form onSubmit={handleUpdate} className="admin-form">
                <div className="form-group">
                  <label htmlFor="commissionRateInput" className="form-label">
                    Commission Rate (%)
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      id="commissionRateInput"
                      type="number"
                      step="0.01"
                      min="0"
                      max="50"
                      className="form-input font-mono"
                      style={{ maxWidth: '160px', fontSize: '1.2rem', fontWeight: 600 }}
                      value={rateInput}
                      onChange={(e) => setRateInput(e.target.value)}
                      required
                    />
                    <span style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--ink-soft)' }}>%</span>
                  </div>
                  <small style={{ color: 'var(--ink-soft)', marginTop: '0.25rem', display: 'block' }}>
                    Example: A 10% commission on a ₹500 fare allocates ₹50 to platform and ₹450 to driver.
                  </small>
                </div>

                <div style={{ marginTop: '1.5rem' }}>
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={submitting}
                  >
                    {submitting ? 'Saving changes...' : 'Save Commission Rate'}
                  </button>
                </div>
              </form>
            </div>

            <div className="admin-card">
              <h2 className="admin-card__title">Audit & Configuration Log</h2>
              <dl className="admin-meta-list font-mono">
                <div>
                  <dt>Current Rate</dt>
                  <dd><strong>{config?.commissionRatePct}%</strong></dd>
                </div>
                <div>
                  <dt>Last Modified</dt>
                  <dd>
                    {config?.updatedAt
                      ? new Date(config.updatedAt).toLocaleString('en-IN')
                      : 'Initial deployment'}
                  </dd>
                </div>
                <div>
                  <dt>Updated By Admin ID</dt>
                  <dd>{config?.updatedById || 'System Default'}</dd>
                </div>
                <div>
                  <dt>Singleton ID</dt>
                  <dd>#{config?.id || 1}</dd>
                </div>
              </dl>
            </div>
          </div>
        )}
      </div>
    </RideShell>
  );
}
