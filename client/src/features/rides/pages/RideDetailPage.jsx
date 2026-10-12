import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../../api/http';
import { useAuth } from '../../../context/AuthContext';
import { RideShell } from '../components/RideShell';
import { RouteMap } from '../components/RouteMap';
import { SeatBadge } from '../components/RideCard';
import { getRide } from '../api';
import { useRideSocket } from '../useRideSocket';
import { BookingModal } from '../../bookings/components/BookingModal';

export function RideDetailPage() {
  const id = window.location.pathname.split('/').filter(Boolean).at(-1);
  const { user, token, signOut } = useAuth();
  const [ride, setRide] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    let active = true;
    getRide(token, id)
      .then((result) => { if (active) setRide(result.data); })
      .catch((requestError) => {
        if (requestError instanceof ApiError && requestError.status === 401) signOut();
        else if (active) setError(requestError.message);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, signOut, token]);

  const rideIds = useMemo(() => ride && ['OPEN', 'FULL', 'IN_PROGRESS'].includes(ride.status) ? [ride.id] : [], [ride]);
  const onSeatUpdate = useCallback((update) => {
    setRide((current) => current?.id === update.rideId
      ? { ...current, availableSeats: update.availableSeats, status: update.status }
      : current);
  }, []);
  const realtime = useRideSocket(token, rideIds, onSeatUpdate);

  const origin = ride && { text: ride.originText, lat: Number(ride.originLat), lng: Number(ride.originLng) };
  const destination = ride && { text: ride.destText, lat: Number(ride.destLat), lng: Number(ride.destLng) };
  const departure = ride && new Intl.DateTimeFormat('en-IN', { dateStyle: 'full', timeStyle: 'short' }).format(new Date(ride.departureTime));

  return (
    <RideShell signOut={signOut} user={user}>
      <div className="page-heading ride-page-heading">
        <div><p className="eyebrow">CARPOOL ROUTE DETAILS</p><h1>{ride ? `${ride.originText} to ${ride.destText}` : 'Ride details'}</h1><p className="page-heading__subtitle">Driver-published schedule and current seat availability.</p></div>
        <a className="text-button" href="/rides/search">Back to search</a>
      </div>
      {error && <div className="inline-alert" role="alert">{error}</div>}
      {loading ? (
        <div aria-label="Loading ride details" className="table-loading"><div className="skeleton-line skeleton-line--wide" /><div className="skeleton-line" /></div>
      ) : ride && (
        <div className="ride-detail-layout">
          <section className="ride-detail-summary">
            <p className="eyebrow">DEPARTURE</p>
            <h2>{departure}</h2>
            <dl className="detail-list ride-detail-list">
              <div><dt>Driver</dt><dd>{ride.driver.firstName}</dd></div>
              <div><dt>Vehicle</dt><dd>{ride.vehicle.make} {ride.vehicle.model} · {ride.vehicle.vehicleType}</dd></div>
              <div><dt>Seats available</dt><dd><SeatBadge availableSeats={ride.availableSeats} totalSeats={ride.totalSeats} /></dd></div>
              <div><dt>Price per seat</dt><dd>₹{Number(ride.costPerSeat).toLocaleString('en-IN')}</dd></div>
              {ride.distanceKm && <div><dt>Route distance</dt><dd>{ride.distanceKm} km</dd></div>}
              {ride.notes && <div><dt>Driver notes</dt><dd>{ride.notes}</dd></div>}
            </dl>
            <p className="ride-live-status" role="status">{realtime.connected ? 'Live seat availability connected' : 'Live seat availability connecting'}</p>
            {realtime.connectionError && <p className="inline-alert" role="status">{realtime.connectionError}</p>}
            {successMessage && (
              <div className="inline-alert" role="status" style={{ borderColor: 'var(--color-ink, #244b43)' }}>
                {successMessage} <a className="text-button" href="/bookings">View in My Bookings →</a>
              </div>
            )}
            {user.role === 'DRIVER' && ride.driverId === user.id ? (
              <a className="text-button" href="/rides/mine">Manage this ride</a>
            ) : ride.status === 'OPEN' && ride.availableSeats > 0 ? (
              <button
                type="button"
                className="primary-button"
                onClick={() => setBookingModalOpen(true)}
                style={{ marginTop: '1rem', width: '100%' }}
              >
                Request seats
              </button>
            ) : null}
          </section>
          <section className="ride-detail-map">
            <p className="eyebrow">ROUTE</p>
            <RouteMap destination={destination} origin={origin} />
            <p className="map-instructions">{ride.originText} to {ride.destText}</p>
          </section>
        </div>
      )}
      <BookingModal
        ride={ride}
        isOpen={bookingModalOpen}
        onClose={() => setBookingModalOpen(false)}
        onSuccess={() => setSuccessMessage('Seat request submitted to driver!')}
      />
    </RideShell>
  );
}
