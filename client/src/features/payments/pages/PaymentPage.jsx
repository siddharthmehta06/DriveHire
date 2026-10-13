import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { RideShell } from '../../rides/components/RideShell';
import {
  applyPromo,
  completeMockPayment,
  getPayment,
  payCash,
  payOnline,
  removePromo,
  verifyPayment,
} from '../api';

export function PaymentPage() {
  const { user, token, signOut } = useAuth();
  const paymentId = window.location.pathname.split('/').filter(Boolean).at(-1);

  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [processing, setProcessing] = useState(false);

  // Promo code state
  const [promoInput, setPromoInput] = useState('');
  const [promoError, setPromoError] = useState('');
  const [promoSuccess, setPromoSuccess] = useState('');

  // Selected method: 'ONLINE' | 'CASH'
  const [selectedMethod, setSelectedMethod] = useState('ONLINE');

  // Mock checkout modal state
  const [mockOrder, setMockOrder] = useState(null);
  const [showMockModal, setShowMockModal] = useState(false);

  const loadPayment = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await getPayment(token, paymentId);
      setPayment(response.data);
    } catch (err) {
      setError(err.message || 'Unable to load payment information.');
    } finally {
      setLoading(false);
    }
  }, [paymentId, token]);

  useEffect(() => {
    loadPayment();
  }, [loadPayment]);

  async function handleApplyPromo(e) {
    e.preventDefault();
    if (!promoInput.trim()) return;
    setPromoError('');
    setPromoSuccess('');
    try {
      const response = await applyPromo(token, paymentId, promoInput.trim().toUpperCase());
      setPayment(response.data);
      setPromoSuccess(`Promo code ${promoInput.trim().toUpperCase()} applied successfully!`);
      setPromoInput('');
    } catch (err) {
      setPromoError(err.message || 'Failed to apply promo code.');
    }
  }

  async function handleRemovePromo() {
    setPromoError('');
    setPromoSuccess('');
    try {
      const response = await removePromo(token, paymentId);
      setPayment(response.data);
      setPromoSuccess('Promo code removed.');
    } catch (err) {
      setPromoError(err.message || 'Failed to remove promo code.');
    }
  }

  async function handleInitiatePayment() {
    if (processing) return;
    setError('');
    setSuccessMsg('');
    setProcessing(true);

    try {
      if (selectedMethod === 'CASH') {
        const response = await payCash(token, paymentId);
        setPayment(response.data);
        setSuccessMsg(
          'Cash payment option selected. Please hand over the exact fare to your driver upon arrival.'
        );
        setProcessing(false);
        return;
      }

      // Online payment workflow
      const orderRes = await payOnline(token, paymentId);
      const order = orderRes.data;

      // Check if Razorpay standard checkout is available in browser and not mock key
      if (window.Razorpay && order.keyId && order.keyId !== 'mock_key_id') {
        const options = {
          key: order.keyId,
          amount: Math.round(Number(order.amount) * 100),
          currency: order.currency || 'INR',
          name: 'DriveHire',
          description: `Ride Payment #${paymentId.slice(0, 8)}`,
          order_id: order.orderId,
          handler: async function (response) {
            try {
              const verifyRes = await verifyPayment(token, paymentId, {
                gatewayPaymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature,
                orderId: response.razorpay_order_id || order.orderId,
              });
              setPayment(verifyRes.data);
              setSuccessMsg('Payment verified and completed successfully!');
            } catch (vErr) {
              setError(vErr.message || 'Payment signature verification failed.');
            } finally {
              setProcessing(false);
            }
          },
          modal: {
            ondismiss: function () {
              setProcessing(false);
              loadPayment();
            },
          },
          prefill: {
            name: user?.name,
            email: user?.email,
          },
          theme: {
            color: '#244b43',
          },
        };

        const rzp = new window.Razorpay(options);
        rzp.open();
      } else {
        // Mock gateway simulated modal
        setMockOrder(order);
        setShowMockModal(true);
      }
    } catch (err) {
      setError(err.message || 'Payment processing failed.');
      setProcessing(false);
    }
  }

  async function handleSimulateMockSuccess() {
    if (!mockOrder) return;
    setError('');
    setShowMockModal(false);
    try {
      const res = await completeMockPayment(token, paymentId, {
        orderId: mockOrder.orderId,
      });
      setPayment(res.data);
      setSuccessMsg('Mock payment successful! Receipt has been generated.');
    } catch (err) {
      setError(err.message || 'Mock payment completion failed.');
    } finally {
      setProcessing(false);
      setMockOrder(null);
    }
  }

  function handleSimulateMockFailure() {
    setShowMockModal(false);
    setMockOrder(null);
    setProcessing(false);
    setError('Payment cancelled or rejected by user in mock gateway.');
  }

  if (loading) {
    return (
      <RideShell signOut={signOut} user={user}>
        <div className="table-loading" style={{ margin: '4rem auto', maxWidth: '640px' }}>
          <div className="skeleton-line skeleton-line--wide" />
          <div className="skeleton-line" />
        </div>
      </RideShell>
    );
  }

  if (!payment) {
    return (
      <RideShell signOut={signOut} user={user}>
        <div style={{ maxWidth: '640px', margin: '2rem auto' }}>
          <div className="inline-alert" role="alert">
            {error || 'Payment not found.'}
          </div>
          <a href="/bookings" className="secondary-button" style={{ marginTop: '1rem', display: 'inline-block' }}>
            Back to My Bookings
          </a>
        </div>
      </RideShell>
    );
  }

  const isCompleted = payment.status === 'SUCCEEDED';
  const isPayer = payment.payerId === user?.id;
  const isPayee = payment.payeeId === user?.id;
  const isAdmin = user?.role === 'ADMIN';

  return (
    <RideShell signOut={signOut} user={user}>
      <div className="payment-page-container">
        <div className="page-heading">
          <div>
            <p className="eyebrow">CHECKOUT & FARE SETTLEMENT</p>
            <h1>Trip Payment</h1>
            <p className="page-heading__subtitle">
              Review line-item fare breakdown, apply promotional discounts, and settle trip balance.
            </p>
          </div>
          <span className={`status-badge status-badge--${payment.status ? payment.status.toLowerCase() : 'pending'}`}>
            {payment.status}
          </span>
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

        {isCompleted && (
          <div className="payment-success-banner">
            <div>
              <h2 style={{ margin: '0 0 0.25rem 0', fontFamily: 'var(--serif)', fontSize: '1.4rem' }}>
                ✓ Payment Settled
              </h2>
              <p style={{ margin: 0, color: '#244b43', fontSize: '0.9rem' }}>
                Receipt #{payment.receiptNumber || 'generated'} is available for download and printing.
              </p>
            </div>
            <a
              href={`/receipts/${payment.id}`}
              className="primary-button"
              style={{ background: '#244b43', borderColor: '#244b43' }}
            >
              View Digital Receipt
            </a>
          </div>
        )}

        <div className="payment-grid">
          {/* Left Column: Fare Breakdown & Promo Codes */}
          <div className="payment-card">
            <h2 className="payment-card__title">Fare Breakdown</h2>

            <dl className="payment-breakdown-list">
              <div className="payment-breakdown-row">
                <dt>Base Ride Fare</dt>
                <dd className="font-mono">₹{Number(payment.baseAmount).toFixed(2)}</dd>
              </div>

              {Number(payment.discountAmount) > 0 && (
                <div className="payment-breakdown-row payment-breakdown-row--discount">
                  <dt>
                    Promo Discount
                    {payment.promoCode && (
                      <span className="promo-badge">
                        {payment.promoCode.code}
                      </span>
                    )}
                  </dt>
                  <dd className="font-mono">-₹{Number(payment.discountAmount).toFixed(2)}</dd>
                </div>
              )}

              <div className="payment-breakdown-row payment-breakdown-row--total">
                <dt>Net Payable Amount</dt>
                <dd className="font-mono">₹{Number(payment.amount).toFixed(2)}</dd>
              </div>

              {(isPayee || isAdmin) && (
                <>
                  <div className="payment-breakdown-divider" />
                  <div className="payment-breakdown-row payment-breakdown-row--sub">
                    <dt>Platform Commission ({Number(payment.commissionRatePct).toFixed(1)}%)</dt>
                    <dd className="font-mono">₹{Number(payment.commissionAmount).toFixed(2)}</dd>
                  </div>
                  <div className="payment-breakdown-row payment-breakdown-row--sub">
                    <dt>Driver Net Payout</dt>
                    <dd className="font-mono">₹{Number(payment.payeeAmount).toFixed(2)}</dd>
                  </div>
                </>
              )}
            </dl>

            {/* Promo Code Input Box */}
            {!isCompleted && isPayer && (
              <div className="promo-section">
                <p className="eyebrow" style={{ marginBottom: '0.5rem' }}>PROMOTIONAL CODE</p>
                {payment.promoCode ? (
                  <div className="promo-applied-box">
                    <div>
                      <strong>Code {payment.promoCode.code} active</strong>
                      <small style={{ display: 'block', color: 'var(--ink-soft)' }}>
                        {payment.promoCode.discountType === 'PERCENT'
                          ? `${payment.promoCode.value}% discount applied`
                          : `₹${payment.promoCode.value} flat discount applied`}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="text-button"
                      style={{ color: 'var(--red)', fontSize: '0.85rem' }}
                      onClick={handleRemovePromo}
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleApplyPromo} className="promo-input-form">
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. DRIVE20"
                      value={promoInput}
                      onChange={(e) => setPromoInput(e.target.value)}
                      style={{ textTransform: 'uppercase' }}
                    />
                    <button type="submit" className="secondary-button" disabled={!promoInput.trim()}>
                      Apply
                    </button>
                  </form>
                )}
                {promoError && <p className="promo-message promo-message--error">{promoError}</p>}
                {promoSuccess && <p className="promo-message promo-message--success">{promoSuccess}</p>}
              </div>
            )}
          </div>

          {/* Right Column: Payment Options & Action */}
          <div className="payment-card">
            <h2 className="payment-card__title">Payment Options</h2>

            {isCompleted ? (
              <div>
                <p style={{ color: 'var(--ink-soft)' }}>
                  This payment was settled using <strong>{payment.method}</strong> on{' '}
                  {payment.paidAt ? new Date(payment.paidAt).toLocaleString('en-IN') : 'Completed'}.
                </p>
                <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem' }}>
                  <a href={`/receipts/${payment.id}`} className="primary-button">
                    View Receipt
                  </a>
                  <a href="/bookings" className="secondary-button">
                    Return to Bookings
                  </a>
                </div>
              </div>
            ) : isPayer ? (
              <div>
                <div className="method-selection-group">
                  <label
                    className={`method-option ${selectedMethod === 'ONLINE' ? 'method-option--selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="ONLINE"
                      checked={selectedMethod === 'ONLINE'}
                      onChange={() => setSelectedMethod('ONLINE')}
                    />
                    <div>
                      <strong>Online Gateway (Razorpay / Mock)</strong>
                      <small>Pay instantly via Cards, UPI, or NetBanking.</small>
                    </div>
                  </label>

                  <label
                    className={`method-option ${selectedMethod === 'CASH' ? 'method-option--selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="CASH"
                      checked={selectedMethod === 'CASH'}
                      onChange={() => setSelectedMethod('CASH')}
                    />
                    <div>
                      <strong>Cash Payment</strong>
                      <small>Pay physical cash directly to the driver upon ride completion.</small>
                    </div>
                  </label>
                </div>

                <div style={{ marginTop: '2rem' }}>
                  <button
                    type="button"
                    className="primary-button font-mono"
                    style={{ width: '100%', padding: '0.85rem 1.25rem', fontSize: '1rem' }}
                    onClick={handleInitiatePayment}
                    disabled={processing}
                  >
                    {processing
                      ? 'Processing settlement...'
                      : selectedMethod === 'ONLINE'
                      ? `Pay ₹${Number(payment.amount).toFixed(2)} Online`
                      : `Select Cash (₹${Number(payment.amount).toFixed(2)})`}
                  </button>
                  <p
                    style={{
                      marginTop: '0.75rem',
                      fontSize: '0.75rem',
                      color: 'var(--ink-soft)',
                      textAlign: 'center',
                    }}
                  >
                    🔒 Encrypted 256-bit server-verified transaction. No secrets exposed to client.
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <p style={{ color: 'var(--ink-soft)' }}>
                  You are viewing this payment as a ride participant ({user?.role}). Only the passenger
                  may initiate payment settlement.
                </p>
                <a href="/bookings" className="secondary-button" style={{ marginTop: '1rem', display: 'inline-block' }}>
                  Return to Bookings
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Mock Checkout Modal Dialog */}
        {showMockModal && mockOrder && (
          <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="mock-modal-title">
            <div className="modal-card">
              <div className="card-header">
                <div>
                  <p className="eyebrow">DEVELOPMENT / TEST ENVIRONMENT</p>
                  <h3 id="mock-modal-title" style={{ margin: '0.25rem 0 0 0', fontFamily: 'var(--serif)' }}>
                    DriveHire Mock Payment Gateway
                  </h3>
                </div>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', margin: '1rem 0' }}>
                Simulating payment gateway response for Order{' '}
                <code className="font-mono">{mockOrder.orderId}</code> totaling{' '}
                <strong>₹{mockOrder.amount}</strong>.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={handleSimulateMockFailure}
                  style={{ color: 'var(--red)' }}
                >
                  Simulate Failure
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleSimulateMockSuccess}
                >
                  Simulate Success (Pay)
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </RideShell>
  );
}
