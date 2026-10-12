import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { RideShell } from '../../rides/components/RideShell';
import { acceptBooking, fetchDriverRequests, rejectBooking } from '../api';

export function RideRequestsPage() {
  const { user, token, signOut } = useAuth();
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [processingId, setProcessingId] = useState(null);

  // Reject modal state
  const [rejectingRequest, setRejectingRequest] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const loadRequests = useCallback(async (status) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetchDriverRequests(token, { status, limit: 50 });
      setRequests(response.data || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch incoming ride requests.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadRequests(statusFilter);
  }, [loadRequests, statusFilter]);

  async function handleAccept(request) {
    setProcessingId(request.id);
    setError('');
    setActionSuccess('');
    try {
      await acceptBooking(token, request.id);
      setActionSuccess(`Accepted seat request for ${request.user?.name || 'passenger'}.`);
      await loadRequests(statusFilter);
    } catch (err) {
      setError(err.message || 'Unable to accept seat request.');
    } finally {
      setProcessingId(null);
    }
  }

  async function handleConfirmReject(e) {
    e.preventDefault();
    if (!rejectingRequest) return;
    setProcessingId(rejectingRequest.id);
    setError('');
    setActionSuccess('');
    try {
      await rejectBooking(token, rejectingRequest.id, rejectReason);
      setActionSuccess(`Declined request for ${rejectingRequest.user?.name || 'passenger'}.`);
      setRejectingRequest(null);
      setRejectReason('');
      await loadRequests(statusFilter);
    } catch (err) {
      setError(err.message || 'Unable to decline seat request.');
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <RideShell signOut={signOut} user={user}>
      <div className="page-heading">
        <div>
          <p className="eyebrow">DRIVER QUEUE</p>
          <h1>Ride Booking Requests</h1>
          <p className="page-heading__subtitle">
            Accept or decline incoming seat requests from passengers before departure.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <label htmlFor="statusFilter" style={{ fontSize: '0.85rem', color: 'var(--color-muted, #666)' }}>
            Status:
          </label>
          <select
            id="statusFilter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="form-control"
            style={{ width: 'auto', padding: '0.35rem 0.75rem' }}
          >
            <option value="PENDING">Pending Approval</option>
            <option value="ACCEPTED">Accepted</option>
            <option value="REJECTED">Declined</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
      </div>

      {error && <div className="inline-alert" role="alert">{error}</div>}
      {actionSuccess && (
        <div className="inline-alert" role="status" style={{ borderColor: 'var(--color-ink, #244b43)' }}>
          {actionSuccess}
        </div>
      )}

      {loading ? (
        <div aria-label="Loading requests" className="table-loading">
          <div className="skeleton-line skeleton-line--wide" />
          <div className="skeleton-line" />
        </div>
      ) : requests.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state__title">No {statusFilter.toLowerCase()} requests</p>
          <p className="empty-state__description">
            {statusFilter === 'PENDING'
              ? 'You have responded to all passenger requests for your scheduled rides.'
              : `No requests with status ${statusFilter} found.`}
          </p>
          <a href="/rides/mine" className="secondary-button" style={{ display: 'inline-block', marginTop: '1rem' }}>
            View my scheduled rides
          </a>
        </div>
      ) : (
        <div className="booking-cards-grid">
          {requests.map((booking) => {
            const ride = booking.rideBooking?.ride;
            const passenger = booking.user;
            const seats = booking.rideBooking?.seatsBooked || 1;
            const departureFormatted = ride?.departureTime
              ? new Intl.DateTimeFormat('en-IN', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(ride.departureTime))
              : 'Departure unspecified';

            return (
              <article key={booking.id} className="booking-card">
                <div className="booking-card__header">
                  <div>
                    <span className="booking-card__route font-mono">
                      {ride?.originText} → {ride?.destText}
                    </span>
                  </div>
                  <span className="booking-card__date font-mono">{departureFormatted}</span>
                </div>

                <div className="booking-card__body">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        background: '#e0dbd1',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: '600',
                        fontSize: '0.85rem',
                      }}
                    >
                      {passenger?.name ? passenger.name.slice(0, 2).toUpperCase() : 'PS'}
                    </div>
                    <div>
                      <strong style={{ display: 'block', fontSize: '1rem' }}>{passenger?.name || 'Anonymous Passenger'}</strong>
                      <small style={{ color: 'var(--color-muted, #666)' }}>
                        {passenger?.email} {passenger?.phone ? `· ${passenger.phone}` : ''}
                      </small>
                    </div>
                  </div>

                  <dl className="booking-card__details">
                    <div>
                      <dt>Seats requested</dt>
                      <dd>
                        <strong>{seats} {seats === 1 ? 'seat' : 'seats'}</strong>
                      </dd>
                    </div>
                    <div>
                      <dt>Available on ride</dt>
                      <dd>{ride?.availableSeats ?? '—'} / {ride?.totalSeats ?? '—'}</dd>
                    </div>
                    {booking.rideBooking?.pickupNote && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <dt>Passenger pickup note</dt>
                        <dd>{booking.rideBooking.pickupNote}</dd>
                      </div>
                    )}
                  </dl>
                </div>

                {booking.status === 'PENDING' && (
                  <div className="booking-card__footer">
                    <div className="booking-card__actions" style={{ justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="text-button"
                        style={{ color: '#a54a3a' }}
                        onClick={() => setRejectingRequest(booking)}
                        disabled={processingId === booking.id}
                      >
                        Decline
                      </button>
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() => handleAccept(booking)}
                        disabled={processingId === booking.id || (ride?.availableSeats ?? 0) < seats}
                        title={
                          (ride?.availableSeats ?? 0) < seats
                            ? 'Not enough available seats left on this ride.'
                            : undefined
                        }
                      >
                        {processingId === booking.id ? 'Processing...' : 'Accept request'}
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Reject Modal */}
      {rejectingRequest && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <p className="eyebrow">DECLINE REQUEST</p>
                <h2>Decline passenger seat request?</h2>
              </div>
              <button
                type="button"
                className="text-button"
                onClick={() => setRejectingRequest(null)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleConfirmReject} className="booking-form">
              <p style={{ margin: '0 0 1rem 0', color: 'var(--color-muted, #555)' }}>
                Decline seat request from <strong>{rejectingRequest.user?.name}</strong> for{' '}
                {rejectingRequest.rideBooking?.seatsBooked} seat(s).
              </p>
              <div className="form-group">
                <label htmlFor="rejectReason">Reason for declining (optional)</label>
                <input
                  id="rejectReason"
                  type="text"
                  maxLength={255}
                  placeholder="e.g. Vehicle luggage capacity full / Route deviation too far"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="form-control"
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setRejectingRequest(null)}
                  disabled={processingId !== null}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  style={{ background: '#a54a3a', borderColor: '#a54a3a', color: '#fff' }}
                  disabled={processingId !== null}
                >
                  {processingId ? 'Processing...' : 'Confirm decline'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </RideShell>
  );
}
