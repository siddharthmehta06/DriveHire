import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../../api/http';
import { useAuth } from '../../../context/AuthContext';
import { RideShell } from '../components/RideShell';
import { RideCard, SeatBadge } from '../components/RideCard';
import { cancelRide, listMyRides } from '../api';
import { useRideSocket } from '../useRideSocket';

const STATUSES = ['', 'OPEN', 'FULL', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

export function MyRidesPage() {
  const { user, token, signOut } = useAuth();
  const [rides, setRides] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await listMyRides(token, { status, page: 1, limit: 100 });
      setRides(result.data);
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) signOut();
      else setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [signOut, status, token]);

  useEffect(() => { refresh(); }, [refresh]);

  const rideIds = useMemo(() => rides
    .filter((ride) => ['OPEN', 'FULL', 'IN_PROGRESS'].includes(ride.status))
    .map((ride) => ride.id), [rides]);
  const onSeatUpdate = useCallback((update) => {
    setRides((current) => current.map((ride) => ride.id === update.rideId
      ? { ...ride, availableSeats: update.availableSeats, status: update.status }
      : ride));
  }, []);
  const realtime = useRideSocket(token, rideIds, onSeatUpdate);

  async function cancel(id) {
    setSavingId(id);
    setError('');
    try {
      const result = await cancelRide(token, id);
      setRides((current) => current.map((ride) => ride.id === id ? { ...ride, ...result.data } : ride));
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) signOut();
      else setError(requestError.message);
    } finally {
      setSavingId('');
    }
  }

  return (
    <RideShell signOut={signOut} user={user}>
      <div className="page-heading ride-page-heading">
        <div><p className="eyebrow">DRIVER SCHEDULE</p><h1>My rides</h1><p className="page-heading__subtitle">Manage published routes and current passenger-seat availability.</p></div>
        <a className="button button--primary" href="/rides/post">Post a ride</a>
      </div>
      {error && <div className="inline-alert" role="alert">{error}</div>}
      <div className="ride-search-status"><p>{rides.length} {rides.length === 1 ? 'ride' : 'rides'} in this view</p><p className="ride-live-status" role="status">{realtime.connected ? 'Live updates connected' : 'Live updates connecting'}</p></div>
      {realtime.connectionError && <p className="inline-alert" role="status">{realtime.connectionError}</p>}
      <label className="form-field ride-status-filter"><span>Filter rides by status</span>
        <select onChange={(event) => setStatus(event.target.value)} value={status}>
          {STATUSES.map((item) => <option key={item || 'ALL'} value={item}>{item || 'All statuses'}</option>)}
        </select>
      </label>
      {loading ? (
        <div aria-label="Loading your rides" className="table-loading"><div className="skeleton-line skeleton-line--wide" /><div className="skeleton-line" /></div>
      ) : rides.length ? (
        <section aria-label="Your rides" className="my-rides-list">
          {rides.map((ride) => (
            <article className="my-ride-row" key={ride.id}>
              <RideCard ride={{
                ...ride,
                driver: { firstName: user.name.split(/\s+/)[0] },
                vehicle: { make: ride.vehicle.make, model: ride.vehicle.model },
              }} />
              <div className="my-ride-actions">
                <span className={`ride-status-tag ride-status-tag--${ride.status.toLowerCase()}`}>{ride.status.replaceAll('_', ' ')}</span>
                <SeatBadge availableSeats={ride.availableSeats} totalSeats={ride.totalSeats} />
                <a className="secondary-button" href={`/driver/rides/${ride.id}`} style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}>
                  Manage & GPS
                </a>
                {['OPEN', 'FULL'].includes(ride.status) && (
                  <button className="text-button document-delete-action" disabled={savingId === ride.id} onClick={() => cancel(ride.id)} type="button">
                    {savingId === ride.id ? 'Cancelling…' : 'Cancel ride'}
                  </button>
                )}
              </div>
            </article>
          ))}
        </section>
      ) : (
        <div className="ride-empty"><p className="eyebrow">DRIVER SCHEDULE</p><h2>No rides in this view.</h2><p>Post a route to make it available to authenticated passengers.</p><a className="text-button" href="/rides/post">Create a ride</a></div>
      )}
    </RideShell>
  );
}
