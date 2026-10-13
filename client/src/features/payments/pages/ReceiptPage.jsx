import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { RideShell } from '../../rides/components/RideShell';
import { downloadReceiptPdf, getReceipt } from '../api';

export function ReceiptPage() {
  const { user, token, signOut } = useAuth();
  const paymentId = window.location.pathname.split('/').filter(Boolean).at(-1);

  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const loadReceipt = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await getReceipt(token, paymentId);
      setReceipt(response.data);
    } catch (err) {
      if (err.status === 404) {
        setError('Receipt not found or you are not authorized to view it.');
      } else if (err.status === 422) {
        setError('Payment has not succeeded yet. Receipt is only generated for completed payments.');
      } else {
        setError(err.message || 'Failed to load receipt.');
      }
    } finally {
      setLoading(false);
    }
  }, [paymentId, token]);

  useEffect(() => {
    loadReceipt();
  }, [loadReceipt]);

  async function handleDownloadPdf() {
    setDownloadingPdf(true);
    try {
      const blob = await downloadReceiptPdf(token, paymentId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt-${receipt?.receiptNumber || paymentId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message || 'Failed to download PDF receipt.');
    } finally {
      setDownloadingPdf(false);
    }
  }

  function handlePrint() {
    window.print();
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

  if (error || !receipt) {
    return (
      <RideShell signOut={signOut} user={user}>
        <div style={{ maxWidth: '640px', margin: '3rem auto' }}>
          <div className="inline-alert" role="alert">
            {error || 'Unable to retrieve receipt record.'}
          </div>
          <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem' }}>
            <a href="/bookings" className="secondary-button">
              Back to My Bookings
            </a>
            <a href={`/payments/${paymentId}`} className="primary-button">
              View Payment
            </a>
          </div>
        </div>
      </RideShell>
    );
  }

  const paidDateFormatted = receipt.paidAt
    ? new Intl.DateTimeFormat('en-IN', {
        dateStyle: 'full',
        timeStyle: 'medium',
      }).format(new Date(receipt.paidAt))
    : 'Recorded';

  return (
    <RideShell signOut={signOut} user={user}>
      <div className="receipt-view-wrapper">
        <div className="receipt-toolbar no-print">
          <a href="/bookings" className="secondary-button font-mono" style={{ fontSize: '0.85rem' }}>
            ← Back to Bookings
          </a>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              type="button"
              className="secondary-button"
              onClick={handlePrint}
            >
              Print Receipt
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={handleDownloadPdf}
              disabled={downloadingPdf}
            >
              {downloadingPdf ? 'Downloading...' : 'Download PDF Receipt'}
            </button>
          </div>
        </div>

        {/* Printable Receipt Paper Sheet */}
        <article className="receipt-paper">
          <header className="receipt-paper__header">
            <div>
              <p className="eyebrow">DIGITAL TAX INVOICE & RECEIPT</p>
              <h1 className="receipt-brand">DriveHire</h1>
              <p className="receipt-tagline">Carpool & Peer-to-Peer Mobility Platform</p>
            </div>
            <div className="receipt-meta font-mono">
              <div>
                <dt>Receipt No.</dt>
                <dd><strong>{receipt.receiptNumber}</strong></dd>
              </div>
              <div>
                <dt>Date & Time</dt>
                <dd>{paidDateFormatted}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd className="status-badge status-badge--verified" style={{ display: 'inline-block' }}>
                  {receipt.status}
                </dd>
              </div>
            </div>
          </header>

          <div className="receipt-paper__participants">
            <div className="participant-col">
              <span className="eyebrow">BILLED TO (PASSENGER)</span>
              <strong>{receipt.payer?.name || 'Verified Rider'}</strong>
              <small>{receipt.payer?.email}</small>
            </div>
            <div className="participant-col">
              <span className="eyebrow">SERVICE PROVIDER (DRIVER)</span>
              <strong>{receipt.payee?.name || 'Assigned Driver'}</strong>
              <small>{receipt.payee?.email}</small>
            </div>
            <div className="participant-col">
              <span className="eyebrow">PAYMENT METHOD</span>
              <strong className="font-mono">{receipt.method}</strong>
              <small>Ref #{receipt.bookingId?.slice(0, 8)}</small>
            </div>
          </div>

          <section className="receipt-paper__breakdown">
            <h2 className="eyebrow" style={{ marginBottom: '0.75rem' }}>TRIP FARE STATEMENT</h2>

            <table className="receipt-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th style={{ textAlign: 'right' }}>Amount (INR)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Base Ride Fare</td>
                  <td className="font-mono" style={{ textAlign: 'right' }}>
                    ₹{Number(receipt.baseAmount).toFixed(2)}
                  </td>
                </tr>

                {Number(receipt.discountAmount) > 0 && (
                  <tr>
                    <td>
                      Promotional Discount{' '}
                      {receipt.promoCode?.code && (
                        <span className="promo-badge">{receipt.promoCode.code}</span>
                      )}
                    </td>
                    <td className="font-mono" style={{ textAlign: 'right', color: 'var(--green)' }}>
                      -₹{Number(receipt.discountAmount).toFixed(2)}
                    </td>
                  </tr>
                )}

                <tr className="receipt-table__total-row">
                  <td><strong>Total Settled Amount</strong></td>
                  <td className="font-mono" style={{ textAlign: 'right' }}>
                    <strong>₹{Number(receipt.amount).toFixed(2)}</strong>
                  </td>
                </tr>

                <tr>
                  <td style={{ color: 'var(--ink-soft)', fontSize: '0.8rem' }}>
                    Platform Commission ({receipt.commissionRatePct}%)
                  </td>
                  <td className="font-mono" style={{ textAlign: 'right', color: 'var(--ink-soft)', fontSize: '0.8rem' }}>
                    ₹{Number(receipt.commissionAmount).toFixed(2)}
                  </td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--ink-soft)', fontSize: '0.8rem' }}>
                    Driver Net Share
                  </td>
                  <td className="font-mono" style={{ textAlign: 'right', color: 'var(--ink-soft)', fontSize: '0.8rem' }}>
                    ₹{Number(receipt.payeeAmount).toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <footer className="receipt-paper__footer">
            <p>
              Thank you for riding with DriveHire. This is a computer-generated digital receipt issued under
              the platform terms and conditions. No signature is required.
            </p>
          </footer>
        </article>
      </div>
    </RideShell>
  );
}
