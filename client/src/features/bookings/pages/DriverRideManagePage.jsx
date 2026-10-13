import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { RideShell } from '../../rides/components/RideShell';
import { getRide } from '../../rides/api';
import { acceptBooking, completeRide, fetchRideBookings, rejectBooking, startRide, updateRideLocation } from '../api';
import { confirmCash, getPaymentByBooking } from '../../payments/api';

export function DriverRideManagePage() {
  const { user, token, signOut } = useAuth();
  const rideId = window.location.pathname.split('/').filter(Boolean).at(-1);

  const [ride, setRide] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [paymentsMap, setPaymentsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [processingAction, setProcessingAction] = useState(false);

  // Live location transmission state
  const [sharingLocation, setSharingLocation] = useState(false);
  const [lastLocationSent, setLastLocationSent] = useState(null);
  const [locationError, setLocationError] = useState('');
  const watchIdRef = useRef(null);
  const lastUpdateTimestampRef = useRef(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [rideRes, bookingsRes] = await Promise.all([
        getRide(token, rideId),
        fetchRideBookings(token, rideId),
      ]);
      setRide(rideRes.data);
      const bookingList = bookingsRes.data || [];
      setBookings(bookingList);

      // Load associated payment states
      const paymentsObj = {};
      await Promise.all(
        bookingList.map(async (b) => {
          try {
            const pRes = await getPaymentByBooking(token, b.id);
            if (pRes?.data) paymentsObj[b.id] = pRes.data;
          } catch {
            // ignore if payment record not yet generated
          }
        })
      );
      setPaymentsMap(paymentsObj);
    } catch (err) {
      setError(err.message || 'Failed to load ride management data.');
    } finally {
      setLoading(false);
    }
  }, [rideId, token]);

  async function handleConfirmCash(bookingId, paymentId, passengerName, amount) {
    setError('');
    setActionSuccess('');
    try {
      const res = await confirmCash(token, paymentId);
      setActionSuccess(`Cash payment of ₹${Number(amount).toFixed(2)} confirmed for ${passengerName || 'passenger'}!`);
      setPaymentsMap((prev) => ({
        ...prev,
        [bookingId]: res.data,
      }));
    } catch (err) {
      setError(err.message || 'Failed to confirm cash payment.');
    }
  }

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Clean up location watch on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  function toggleLocationSharing() {
    if (sharingLocation) {
      // Stop sharing
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setSharingLocation(false);
      setLocationError('');
      return;
    }

    // Start sharing
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser.');
      return;
    }

    setLocationError('');
    setSharingLocation(true);

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        const now = Date.now();
        // Throttle updates to at most once every 5 seconds (5000 ms)
        if (now - lastUpdateTimestampRef.current < 5000) {
          return;
        }
        lastUpdateTimestampRef.current = now;

        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        try {
          const res = await updateRideLocation(token, rideId, coords);
          setLastLocationSent({
            lat: res.data.lat,
            lng: res.data.lng,
            time: new Date(res.data.updatedAt).toLocaleTimeString(),
          });
        } catch (err) {
          setLocationError(err.message || 'Failed to transmit coordinates.');
        }
      },
      (geoError) => {
        setLocationError(`GPS error: ${geoError.message}`);
        setSharingLocation(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 10000,
      }
    );
  }

  async function handleStartRide() {
    setProcessingAction(true);
    setError('');
    setActionSuccess('');
    try {
      const res = await startRide(token, rideId);
      setRide(res.data);
      setActionSuccess('Ride started! Passengers have been notified and active tracking is enabled.');
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to start ride.');
    } finally {
      setProcessingAction(false);
    }
  }

  async function handleCompleteRide() {
    setProcessingAction(true);
    setError('');
    setActionSuccess('');
    try {
      const res = await completeRide(token, rideId);
      setRide(res.data);
      setActionSuccess('Ride successfully completed! All passengers marked complete.');
      // Automatically turn off location sharing if active
      if (sharingLocation) {
        toggleLocationSharing();
      }
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to complete ride.');
    } finally {
      setProcessingAction(false);
    }
  }

  async function handleQuickAccept(bookingId) {
    setError('');
    setActionSuccess('');
    try {
      await acceptBooking(token, bookingId);
      setActionSuccess('Seat request accepted.');
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to accept booking.');
    }
  }

  async function handleQuickReject(bookingId) {
    setError('');
    setActionSuccess('');
    try {
      await rejectBooking(token, bookingId);
      setActionSuccess('Seat request declined.');
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to decline booking.');
    }
  }

  const isRideActive = ride?.status === 'IN_PROGRESS';
  const isRideStartable = ['OPEN', 'FULL'].includes(ride?.status);
  const isRideFinished = ['COMPLETED', 'CANCELLED'].includes(ride?.status);

  return (
    <RideShell signOut={signOut} user={user}>
      <div className="page-heading">
        <div>
          <p className="eyebrow">DRIVER OPERATIONS</p>
          <h1>Manage Scheduled Ride</h1>
          <p className="page-heading__subtitle">
            {ride ? `${ride.originText} → ${ride.destText}` : 'Loading ride...'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <a className="secondary-button" href="/rides/mine">
            Back to My Rides
          </a>
          <a className="secondary-button" href={`/rides/${rideId}/track`}>
            Preview Live Map
          </a>
        </div>
      </div>

      {error && <div className="inline-alert" role="alert">{error}</div>}
      {actionSuccess && (
        <div className="inline-alert" role="status" style={{ borderColor: 'var(--color-ink, #244b43)' }}>
          {actionSuccess}
        </div>
      )}

      {loading ? (
        <div aria-label="Loading ride management" className="table-loading">
          <div className="skeleton-line skeleton-line--wide" />
          <div className="skeleton-line" />
        </div>
      ) : ride && (
        <div className="ride-manage-grid">
          {/* Main Controls Panel */}
          <section className="ride-manage-card">
            <div className="card-header">
              <div>
                <p className="eyebrow">RIDE LIFECYCLE</p>
                <h2>Controls & Status</h2>
              </div>
              <span className={`status-badge status-badge--${ride.status.toLowerCase()}`}>
                {ride.status}
              </span>
            </div>

            <div style={{ margin: '1.25rem 0' }}>
              <p style={{ margin: '0 0 0.5rem 0', color: 'var(--color-muted, #666)' }}>
                <strong>Departure:</strong>{' '}
                {new Intl.DateTimeFormat('en-IN', { dateStyle: 'full', timeStyle: 'short' }).format(
                  new Date(ride.departureTime)
                )}
              </p>
              <p style={{ margin: '0 0 0.5rem 0', color: 'var(--color-muted, #666)' }}>
                <strong>Seats Occupancy:</strong> {ride.totalSeats - ride.availableSeats} of {ride.totalSeats} seats booked ({ride.availableSeats} available)
              </p>
            </div>

            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '1.5rem' }}>
              {isRideStartable && (
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleStartRide}
                  disabled={processingAction}
                >
                  {processingAction ? 'Starting ride...' : '▶ Start Ride (Depart)'}
                </button>
              )}

              {isRideActive && (
                <button
                  type="button"
                  className="primary-button"
                  style={{ background: '#1b5e20', borderColor: '#1b5e20' }}
                  onClick={handleCompleteRide}
                  disabled={processingAction}
                >
                  {processingAction ? 'Completing...' : '✓ Complete Ride (Arrived)'}
                </button>
              )}

              {isRideFinished && (
                <p style={{ color: 'var(--color-muted, #666)', fontStyle: 'italic' }}>
                  This ride has been {ride.status.toLowerCase()}. No further lifecycle actions available.
                </p>
              )}
            </div>

            {/* Live Location Sharing Section */}
            {!isRideFinished && (
              <div
                style={{
                  marginTop: '2rem',
                  paddingTop: '1.5rem',
                  borderTop: '1px solid var(--color-border, #e5e0d8)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong style={{ display: 'block', fontSize: '1rem' }}>Share Live Vehicle GPS</strong>
                    <small style={{ color: 'var(--color-muted, #666)' }}>
                      Broadcasts live position to accepted passengers (throttled to 5s intervals).
                    </small>
                  </div>
                  <button
                    type="button"
                    className={sharingLocation ? 'primary-button' : 'secondary-button'}
                    style={
                      sharingLocation
                        ? { background: '#2e7d32', borderColor: '#2e7d32' }
                        : {}
                    }
                    onClick={toggleLocationSharing}
                  >
                    {sharingLocation ? '● Transmitting (Stop)' : 'Transmit Location'}
                  </button>
                </div>

                {locationError && (
                  <p className="inline-alert" style={{ marginTop: '0.75rem' }}>
                    {locationError}
                  </p>
                )}

                {sharingLocation && lastLocationSent && (
                  <p className="font-mono" style={{ fontSize: '0.85rem', marginTop: '0.75rem', color: '#1b5e20' }}>
                    Latest broadcast: {lastLocationSent.lat.toFixed(5)}° N, {lastLocationSent.lng.toFixed(5)}° E at {lastLocationSent.time}
                  </p>
                )}
              </div>
            )}
          </section>

          {/* Passenger Bookings on This Ride */}
          <section className="ride-manage-card">
            <div className="card-header">
              <div>
                <p className="eyebrow">PASSENGER ROSTER</p>
                <h2>Bookings on this ride ({bookings.length})</h2>
              </div>
            </div>

            {bookings.length === 0 ? (
              <p style={{ color: 'var(--color-muted, #666)', marginTop: '1rem' }}>
                No passenger bookings received for this ride yet.
              </p>
            ) : (
              <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {bookings.map((b) => (
                  <div
                    key={b.id}
                    style={{
                      padding: '0.85rem 1rem',
                      border: '1px solid var(--color-border, #e5e0d8)',
                      borderRadius: '4px',
                      background: '#fff',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <strong>{b.user?.name || 'Passenger'}</strong>
                      <span className="font-mono" style={{ marginLeft: '0.75rem', fontSize: '0.85rem', color: '#666' }}>
                        {b.rideBooking?.seatsBooked} {b.rideBooking?.seatsBooked === 1 ? 'seat' : 'seats'}
                      </span>
                      {b.rideBooking?.pickupNote && (
                        <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: '#666' }}>
                          Note: {b.rideBooking.pickupNote}
                        </p>
                      )}
                      <small style={{ color: '#888', display: 'block' }}>
                        {b.user?.phone || b.user?.email}
                      </small>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span className={`status-badge status-badge--${b.status.toLowerCase()}`}>
                        {b.status}
                      </span>

                      {/* Payment Status & Driver Cash Confirmation */}
                      {paymentsMap[b.id] && (
                        <>
                          {paymentsMap[b.id].status === 'SUCCEEDED' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <span className="status-badge status-badge--verified" style={{ fontSize: '0.75rem' }}>
                                ✓ Paid ₹{Number(paymentsMap[b.id].amount).toFixed(2)} ({paymentsMap[b.id].method})
                              </span>
                              <a
                                href={`/receipts/${paymentsMap[b.id].id}`}
                                className="secondary-button"
                                style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem' }}
                              >
                                Receipt
                              </a>
                            </div>
                          ) : paymentsMap[b.id].method === 'CASH' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <span className="status-badge status-badge--pending" style={{ fontSize: '0.75rem' }}>
                                Cash Due: ₹{Number(paymentsMap[b.id].amount).toFixed(2)}
                              </span>
                              <button
                                type="button"
                                className="primary-button"
                                style={{
                                  padding: '0.25rem 0.5rem',
                                  fontSize: '0.75rem',
                                  background: '#244b43',
                                  borderColor: '#244b43',
                                }}
                                onClick={() =>
                                  handleConfirmCash(
                                    b.id,
                                    paymentsMap[b.id].id,
                                    b.user?.name,
                                    paymentsMap[b.id].amount
                                  )
                                }
                              >
                                Confirm cash received
                              </button>
                            </div>
                          ) : (
                            <span className="status-badge status-badge--active" style={{ fontSize: '0.75rem' }}>
                              Online ({paymentsMap[b.id].status})
                            </span>
                          )}
                        </>
                      )}

                      {b.status === 'PENDING' && (
                        <>
                          <button
                            type="button"
                            className="secondary-button"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                            onClick={() => handleQuickAccept(b.id)}
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            className="text-button"
                            style={{ color: '#a54a3a', fontSize: '0.8rem' }}
                            onClick={() => handleQuickReject(b.id)}
                          >
                            Decline
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </RideShell>
  );
}
