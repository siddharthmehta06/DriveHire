import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { RideShell } from '../../rides/components/RideShell';
import { cancelBooking, fetchMyBookings } from '../api';
import { getPaymentByBooking } from '../../payments/api';

const STATUS_LABELS = {
  PENDING: { label: 'Pending approval', className: 'status-badge--pending' },
  ACCEPTED: { label: 'Accepted by driver', className: 'status-badge--verified' },
  CONFIRMED: { label: 'Confirmed', className: 'status-badge--verified' },
  ACTIVE: { label: 'In transit', className: 'status-badge--active' },
  COMPLETED: { label: 'Completed', className: 'status-badge--completed' },
  CANCELLED: { label: 'Cancelled', className: 'status-badge--rejected' },
  REJECTED: { label: 'Declined', className: 'status-badge--rejected' },
};

export function MyBookingsPage() {
  const { user, token, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState('upcoming'); // 'upcoming' | 'active' | 'past'
  const [bookings, setBookings] = useState([]);
  const [paymentsMap, setPaymentsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancellingId, setCancellingId] = useState(null);
  const [cancelModalBooking, setCancelModalBooking] = useState(null);
  const [cancelReason, setCancelReason] = useState('');

  const loadBookings = useCallback(async (bucket) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetchMyBookings(token, { bucket, limit: 50 });
      const bookingList = response.data || [];
      setBookings(bookingList);

      const paymentsObj = {};
      await Promise.all(
        bookingList.map(async (b) => {
          if (b.payment) {
            paymentsObj[b.id] = b.payment;
          } else if (['COMPLETED', 'ACTIVE', 'CONFIRMED'].includes(b.status)) {
            try {
              const pRes = await getPaymentByBooking(token, b.id);
              if (pRes?.data) paymentsObj[b.id] = pRes.data;
            } catch {
              // ignore
            }
          }
        })
      );
      setPaymentsMap(paymentsObj);
    } catch (err) {
      setError(err.message || 'Unable to load bookings.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadBookings(activeTab);
  }, [activeTab, loadBookings]);

  async function handleConfirmCancel(e) {
    e.preventDefault();
    if (!cancelModalBooking) return;
    setCancellingId(cancelModalBooking.id);
    try {
      await cancelBooking(token, cancelModalBooking.id, cancelReason);
      setCancelModalBooking(null);
      setCancelReason('');
      await loadBookings(activeTab);
    } catch (err) {
      setError(err.message || 'Failed to cancel booking.');
    } finally {
      setCancellingId(null);
    }
  }

  function canCancel(b) {
    if (!['PENDING', 'ACCEPTED'].includes(b.status)) return false;
    const departure = b.rideBooking?.ride?.departureTime
      ? new Date(b.rideBooking.ride.departureTime).getTime()
      : null;
    if (!departure) return true;
    const cutoff = 60 * 60 * 1000;
    return departure - Date.now() > cutoff;
  }

  return (
    <RideShell signOut={signOut} user={user}>
      <div className="page-heading">
        <div>
          <p className="eyebrow">RESERVATIONS & RIDES</p>
          <h1>My Bookings</h1>
          <p className="page-heading__subtitle">
            Review seat requests, active journeys, and past travel records.
          </p>
        </div>
        <a className="secondary-button" href="/rides/search">
          Book another ride
        </a>
      </div>

      {error && <div className="inline-alert" role="alert">{error}</div>}

      <div className="tab-bar" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'upcoming'}
          className={`tab-item ${activeTab === 'upcoming' ? 'tab-item--active' : ''}`}
          onClick={() => setActiveTab('upcoming')}
        >
          Upcoming
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'active'}
          className={`tab-item ${activeTab === 'active' ? 'tab-item--active' : ''}`}
          onClick={() => setActiveTab('active')}
        >
          Active
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'past'}
          className={`tab-item ${activeTab === 'past' ? 'tab-item--active' : ''}`}
          onClick={() => setActiveTab('past')}
        >
          Past
        </button>
      </div>

      {loading ? (
        <div aria-label="Loading bookings" className="table-loading">
          <div className="skeleton-line skeleton-line--wide" />
          <div className="skeleton-line" />
        </div>
      ) : bookings.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state__title">No {activeTab} bookings</p>
          <p className="empty-state__description">
            {activeTab === 'upcoming' && "You don't have any upcoming carpool reservations scheduled."}
            {activeTab === 'active' && 'No rides are currently in transit.'}
            {activeTab === 'past' && 'No past ride history recorded.'}
          </p>
          <a href="/rides/search" className="primary-button" style={{ display: 'inline-block', marginTop: '1rem' }}>
            Search available rides
          </a>
        </div>
      ) : (
        <div className="booking-cards-grid">
          {bookings.map((booking) => {
            const ride = booking.rideBooking?.ride;
            const statusConfig = STATUS_LABELS[booking.status] || { label: booking.status, className: '' };
            const departureFormatted = ride?.departureTime
              ? new Intl.DateTimeFormat('en-IN', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(ride.departureTime))
              : 'Departure unspecified';
            const costPerSeat = ride?.costPerSeat ? Number(ride.costPerSeat) : 0;
            const seats = booking.rideBooking?.seatsBooked || 1;
            const total = seats * costPerSeat;

            return (
              <article key={booking.id} className="booking-card">
                <div className="booking-card__header">
                  <div>
                    <span className={`status-badge ${statusConfig.className}`}>
                      {statusConfig.label}
                    </span>
                    <span className="booking-card__date font-mono" style={{ marginLeft: '0.75rem' }}>
                      {departureFormatted}
                    </span>
                  </div>
                  <span className="booking-card__id font-mono">
                    #{booking.id.slice(0, 8)}
                  </span>
                </div>

                <div className="booking-card__body">
                  <div className="booking-card__route">
                    <strong>{ride?.originText || 'Origin'}</strong>
                    <span className="route-arrow">→</span>
                    <strong>{ride?.destText || 'Destination'}</strong>
                  </div>

                  <dl className="booking-card__details">
                    <div>
                      <dt>Seats</dt>
                      <dd>{seats} {seats === 1 ? 'seat' : 'seats'}</dd>
                    </div>
                    <div>
                      <dt>Total Fare</dt>
                      <dd className="font-mono">₹{total.toLocaleString('en-IN')}</dd>
                    </div>
                    {ride?.driver && (
                      <div>
                        <dt>Driver</dt>
                        <dd>{ride.driver.name || 'Assigned Driver'}</dd>
                      </div>
                    )}
                    {booking.rideBooking?.pickupNote && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <dt>Pickup note</dt>
                        <dd>{booking.rideBooking.pickupNote}</dd>
                      </div>
                    )}
                  </dl>
                </div>

                <div className="booking-card__footer">
                  <div className="booking-card__actions">
                    {/* Live Tracking Link for Active Rides */}
                    {booking.status === 'ACTIVE' && ride?.id && (
                      <a
                        href={`/rides/${ride.id}/track`}
                        className="primary-button font-mono"
                        style={{ fontSize: '0.85rem' }}
                      >
                        ● Track Live Ride
                      </a>
                    )}

                    {/* Also allow tracking if ACCEPTED */}
                    {booking.status === 'ACCEPTED' && ride?.id && (
                      <a
                        href={`/rides/${ride.id}/track`}
                        className="secondary-button"
                        style={{ fontSize: '0.85rem' }}
                      >
                        View route map
                      </a>
                    )}

                    {/* Cancellation button */}
                    {canCancel(booking) && (
                      <button
                        type="button"
                        className="text-button"
                        style={{ color: '#a54a3a' }}
                        onClick={() => setCancelModalBooking(booking)}
                        disabled={cancellingId === booking.id}
                      >
                        Cancel reservation
                      </button>
                    )}

                    {/* Receipt link when payment succeeded, Pay link when pending, or disabled placeholder */}
                    {paymentsMap[booking.id]?.status === 'SUCCEEDED' ? (
                      <a
                        href={`/receipts/${paymentsMap[booking.id].id}`}
                        className="secondary-button"
                        style={{ fontSize: '0.85rem' }}
                      >
                        Receipt
                      </a>
                    ) : paymentsMap[booking.id] ? (
                      <a
                        href={`/payments/${paymentsMap[booking.id].id}`}
                        className="primary-button"
                        style={{ fontSize: '0.85rem' }}
                      >
                        Pay Fare
                      </a>
                    ) : (
                      <button
                        type="button"
                        className="secondary-button"
                        disabled
                        title="Receipt generation available once payment feature is released (F06)"
                        style={{ opacity: 0.5, cursor: 'not-allowed' }}
                      >
                        Receipt (F06)
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Cancel Modal */}
      {cancelModalBooking && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <p className="eyebrow">CONFIRM CANCELLATION</p>
                <h2>Cancel this booking?</h2>
              </div>
              <button
                type="button"
                className="text-button"
                onClick={() => setCancelModalBooking(null)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleConfirmCancel} className="booking-form">
              <p style={{ margin: '0 0 1rem 0', color: 'var(--color-muted, #555)' }}>
                Are you sure you want to cancel your reservation for{' '}
                <strong>
                  {cancelModalBooking.rideBooking?.ride?.originText} →{' '}
                  {cancelModalBooking.rideBooking?.ride?.destText}
                </strong>
                ? If accepted, your reserved seats will be returned to other travellers.
              </p>
              <div className="form-group">
                <label htmlFor="cancelReason">Reason for cancellation (optional)</label>
                <input
                  id="cancelReason"
                  type="text"
                  maxLength={255}
                  placeholder="e.g. Change of schedule"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="form-control"
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setCancelModalBooking(null)}
                  disabled={cancellingId !== null}
                >
                  Keep booking
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  style={{ background: '#a54a3a', borderColor: '#a54a3a', color: '#fff' }}
                  disabled={cancellingId !== null}
                >
                  {cancellingId ? 'Cancelling...' : 'Confirm cancellation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </RideShell>
  );
}
