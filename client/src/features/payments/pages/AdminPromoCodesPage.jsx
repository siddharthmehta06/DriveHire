import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { RideShell } from '../../rides/components/RideShell';
import { createPromoCode, listPromoCodes, updatePromoCode } from '../api';

export function AdminPromoCodesPage() {
  const { user, token, signOut } = useAuth();

  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modal create/edit state
  const [showModal, setShowModal] = useState(false);
  const [editingPromo, setEditingPromo] = useState(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  // Form fields
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState('PERCENT');
  const [value, setValue] = useState('');
  const [maxDiscount, setMaxDiscount] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [usageLimit, setUsageLimit] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [active, setActive] = useState(true);

  const loadPromos = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await listPromoCodes(token, { limit: 100 });
      setPromos(response.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load promo codes.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadPromos();
  }, [loadPromos]);

  function openCreateModal() {
    setEditingPromo(null);
    setCode('');
    setDiscountType('PERCENT');
    setValue('');
    setMaxDiscount('');
    setMinAmount('');
    setUsageLimit('');
    const now = new Date();
    const nextMonth = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    setValidFrom(now.toISOString().slice(0, 16));
    setValidUntil(nextMonth.toISOString().slice(0, 16));
    setActive(true);
    setModalError('');
    setShowModal(true);
  }

  function openEditModal(promo) {
    setEditingPromo(promo);
    setCode(promo.code);
    setDiscountType(promo.discountType);
    setValue(promo.value);
    setMaxDiscount(promo.maxDiscount || '');
    setMinAmount(promo.minAmount || '');
    setUsageLimit(promo.usageLimit != null ? String(promo.usageLimit) : '');
    setValidFrom(new Date(promo.validFrom).toISOString().slice(0, 16));
    setValidUntil(new Date(promo.validUntil).toISOString().slice(0, 16));
    setActive(promo.active);
    setModalError('');
    setShowModal(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setModalError('');

    if (new Date(validUntil) < new Date(validFrom)) {
      setModalError('Valid until date cannot be before valid from date.');
      return;
    }

    setFormSubmitting(true);
    try {
      const payload = {
        code: code.trim().toUpperCase(),
        discountType,
        value: Number(value),
        maxDiscount: maxDiscount ? Number(maxDiscount) : null,
        minAmount: minAmount ? Number(minAmount) : null,
        usageLimit: usageLimit ? parseInt(usageLimit, 10) : null,
        validFrom: new Date(validFrom).toISOString(),
        validUntil: new Date(validUntil).toISOString(),
        active,
      };

      if (editingPromo) {
        await updatePromoCode(token, editingPromo.id, payload);
        setSuccessMsg(`Promo code ${payload.code} updated successfully.`);
      } else {
        await createPromoCode(token, payload);
        setSuccessMsg(`Promo code ${payload.code} created successfully.`);
      }

      setShowModal(false);
      await loadPromos();
    } catch (err) {
      setModalError(err.message || 'Failed to save promo code.');
    } finally {
      setFormSubmitting(false);
    }
  }

  async function handleToggleActive(promo) {
    try {
      await updatePromoCode(token, promo.id, { active: !promo.active });
      setSuccessMsg(`Promo code ${promo.code} marked ${!promo.active ? 'active' : 'inactive'}.`);
      await loadPromos();
    } catch (err) {
      setError(err.message || 'Failed to update promo status.');
    }
  }

  return (
    <RideShell signOut={signOut} user={user}>
      <div className="admin-page-container">
        <div className="page-heading">
          <div>
            <p className="eyebrow">ADMINISTRATIVE SETTINGS</p>
            <h1>Promo Codes Management</h1>
            <p className="page-heading__subtitle">
              Create and manage promotional discount vouchers, validity windows, and usage quotas.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <a href="/admin/pricing" className="secondary-button">
              ← Commission Rates
            </a>
            <button
              type="button"
              className="primary-button"
              onClick={openCreateModal}
            >
              + Create Promo Code
            </button>
          </div>
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
          <div className="table-loading" style={{ margin: '3rem 0' }}>
            <div className="skeleton-line skeleton-line--wide" />
            <div className="skeleton-line" />
          </div>
        ) : promos.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state__title">No promo codes found</p>
            <p className="empty-state__description">
              You haven&apos;t created any promotional discount codes yet.
            </p>
            <button
              type="button"
              className="primary-button"
              style={{ marginTop: '1rem' }}
              onClick={openCreateModal}
            >
              Create your first promo code
            </button>
          </div>
        ) : (
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Discount</th>
                  <th>Min Amount</th>
                  <th>Max Cap</th>
                  <th>Usage (Used / Limit)</th>
                  <th>Validity Window</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {promos.map((p) => {
                  const isExpired = new Date(p.validUntil) < new Date();
                  const isExhausted = p.usageLimit != null && p.usedCount >= p.usageLimit;

                  return (
                    <tr key={p.id}>
                      <td className="font-mono">
                        <strong>{p.code}</strong>
                      </td>
                      <td>
                        {p.discountType === 'PERCENT' ? `${p.value}%` : `₹${p.value}`}
                      </td>
                      <td className="font-mono">
                        {p.minAmount ? `₹${p.minAmount}` : '—'}
                      </td>
                      <td className="font-mono">
                        {p.maxDiscount ? `₹${p.maxDiscount}` : '—'}
                      </td>
                      <td className="font-mono">
                        {p.usedCount} / {p.usageLimit ?? '∞'}
                        {isExhausted && (
                          <span style={{ color: 'var(--red)', marginLeft: '0.4rem', fontSize: '0.75rem' }}>
                            (Exhausted)
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--ink-soft)' }}>
                        {new Date(p.validFrom).toLocaleDateString('en-IN')} –{' '}
                        {new Date(p.validUntil).toLocaleDateString('en-IN')}
                        {isExpired && (
                          <span style={{ color: 'var(--red)', display: 'block' }}>(Expired)</span>
                        )}
                      </td>
                      <td>
                        <span
                          className={`status-badge ${
                            p.active && !isExpired && !isExhausted
                              ? 'status-badge--verified'
                              : 'status-badge--rejected'
                          }`}
                        >
                          {p.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                          <button
                            type="button"
                            className="secondary-button"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                            onClick={() => openEditModal(p)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="text-button"
                            style={{ fontSize: '0.75rem', color: p.active ? 'var(--red)' : 'var(--green)' }}
                            onClick={() => handleToggleActive(p)}
                          >
                            {p.active ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Create / Edit Modal Dialog */}
        {showModal && (
          <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="promo-modal-title">
            <div className="modal-card" style={{ maxWidth: '580px' }}>
              <div className="card-header">
                <div>
                  <p className="eyebrow">{editingPromo ? 'MODIFY PROMO CODE' : 'NEW PROMOTION'}</p>
                  <h3 id="promo-modal-title" style={{ margin: '0.25rem 0 0 0', fontFamily: 'var(--serif)' }}>
                    {editingPromo ? `Edit Code: ${editingPromo.code}` : 'Create Promo Code'}
                  </h3>
                </div>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setShowModal(false)}
                  style={{ fontSize: '1.2rem', color: 'var(--ink-soft)' }}
                >
                  ✕
                </button>
              </div>

              {modalError && <div className="inline-alert" role="alert" style={{ marginTop: '1rem' }}>{modalError}</div>}

              <form onSubmit={handleSubmit} className="admin-form" style={{ marginTop: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="codeField">Code *</label>
                    <input
                      id="codeField"
                      type="text"
                      className="form-input font-mono"
                      placeholder="e.g. DIWALI50"
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      required
                      style={{ textTransform: 'uppercase' }}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="discountTypeField">Discount Type *</label>
                    <select
                      id="discountTypeField"
                      className="form-input"
                      value={discountType}
                      onChange={(e) => setDiscountType(e.target.value)}
                    >
                      <option value="PERCENT">Percentage (%)</option>
                      <option value="FLAT">Flat Amount (₹)</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.75rem' }}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="valField">
                      {discountType === 'PERCENT' ? 'Percentage Value (%) *' : 'Flat Discount (₹) *'}
                    </label>
                    <input
                      id="valField"
                      type="number"
                      step="0.01"
                      min="0.01"
                      className="form-input font-mono"
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="maxDiscountField">
                      Max Discount Cap (₹)
                    </label>
                    <input
                      id="maxDiscountField"
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="Optional"
                      className="form-input font-mono"
                      value={maxDiscount}
                      onChange={(e) => setMaxDiscount(e.target.value)}
                      disabled={discountType === 'FLAT'}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.75rem' }}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="minAmountField">
                      Minimum Booking Amount (₹)
                    </label>
                    <input
                      id="minAmountField"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Optional"
                      className="form-input font-mono"
                      value={minAmount}
                      onChange={(e) => setMinAmount(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="usageLimitField">
                      Usage Limit (Total redemptions)
                    </label>
                    <input
                      id="usageLimitField"
                      type="number"
                      step="1"
                      min="1"
                      placeholder="Unlimited if empty"
                      className="form-input font-mono"
                      value={usageLimit}
                      onChange={(e) => setUsageLimit(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.75rem' }}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="validFromField">Valid From *</label>
                    <input
                      id="validFromField"
                      type="datetime-local"
                      className="form-input"
                      value={validFrom}
                      onChange={(e) => setValidFrom(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="validUntilField">Valid Until *</label>
                    <input
                      id="validUntilField"
                      type="datetime-local"
                      className="form-input"
                      value={validUntil}
                      onChange={(e) => setValidUntil(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: '0.75rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={(e) => setActive(e.target.checked)}
                    />
                    <span>Active and eligible for redemption</span>
                  </label>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setShowModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={formSubmitting}
                  >
                    {formSubmitting ? 'Saving...' : editingPromo ? 'Update Promo Code' : 'Create Promo Code'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </RideShell>
  );
}
