import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../../api/http';
import { useAuth } from '../../../context/AuthContext';
import { RideShell } from '../components/RideShell';
import { RideCard } from '../components/RideCard';
import { RouteMap } from '../components/RouteMap';
import { searchRides } from '../api';
import { useRideSocket } from '../useRideSocket';

const DEFAULT_FILTERS = {
  origin: '',
  destination: '',
  date: '',
  timeFrom: '',
  timeTo: '',
  seats: '1',
  maxPrice: '',
  lat: '',
  lng: '',
  radiusKm: '10',
  sort: 'time',
};

export function SearchRidesPage() {
  const { user, token, signOut } = useAuth();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [rides, setRides] = useState([]);
  const [meta, setMeta] = useState({ page: 1, limit: 20, total: 0 });
  const [loading, setLoading] = useState(true);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);

  const refresh = useCallback(async (nextFilters = filters, nextPage = page) => {
    setLoading(true);
    setError('');
    try {
      const result = await searchRides(token, { ...nextFilters, page: nextPage, limit: 20 });
      setRides(result.data);
      setMeta(result.meta);
      setSearched(true);
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) signOut();
      else setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [filters, page, signOut, token]);

  useEffect(() => { refresh(DEFAULT_FILTERS, 1); }, []);

  const rideIds = useMemo(() => rides.map((ride) => ride.id), [rides]);
  const onSeatUpdate = useCallback((update) => {
    setRides((current) => current.map((ride) => (
      ride.id === update.rideId
        ? { ...ride, availableSeats: update.availableSeats, status: update.status }
        : ride
    )).filter((ride) => ride.status === 'OPEN' && ride.availableSeats >= Number(filters.seats || 1)));
  }, [filters.seats]);
  const realtime = useRideSocket(token, rideIds, onSeatUpdate);

  function change(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function submit(event) {
    event.preventDefault();
    setPage(1);
    refresh(filters, 1);
  }

  function changePage(nextPage) {
    setPage(nextPage);
    refresh(filters, nextPage);
  }

  const pageCount = Math.max(1, Math.ceil(meta.total / meta.limit));

  return (
    <RideShell signOut={signOut} user={user}>
      <div className="page-heading ride-page-heading">
        <div>
          <p className="eyebrow">PASSENGER ROUTE SEARCH</p>
          <h1>Find a ride</h1>
          <p className="page-heading__subtitle">Search open departures, compare per-seat costs and follow live availability.</p>
        </div>
        {user.role === 'DRIVER' && <a className="text-button" href="/rides/post">Post a ride</a>}
      </div>
      {error && <div className="inline-alert" role="alert">{error}</div>}
      <form className="ride-search-form" onSubmit={submit}>
        <label className="form-field"><span>From</span><input maxLength="160" onChange={(event) => change('origin', event.target.value)} placeholder="City or pickup area" value={filters.origin} /></label>
        <label className="form-field"><span>To</span><input maxLength="160" onChange={(event) => change('destination', event.target.value)} placeholder="Destination city" value={filters.destination} /></label>
        <label className="form-field"><span>Date</span><input onChange={(event) => change('date', event.target.value)} type="date" value={filters.date} /></label>
        <label className="form-field"><span>Depart after</span><input onChange={(event) => change('timeFrom', event.target.value)} type="time" value={filters.timeFrom} /></label>
        <label className="form-field"><span>Depart before</span><input onChange={(event) => change('timeTo', event.target.value)} type="time" value={filters.timeTo} /></label>
        <label className="form-field"><span>Passenger seats</span><input max="8" min="1" onChange={(event) => change('seats', event.target.value)} type="number" value={filters.seats} /></label>
        <label className="form-field"><span>Maximum fare (INR)</span><input max="10000" min="0" onChange={(event) => change('maxPrice', event.target.value)} placeholder="Any price" type="number" value={filters.maxPrice} /></label>
        <fieldset className="ride-nearby-fields">
          <legend>Destination radius (optional)</legend>
          <label className="form-field"><span>Latitude</span><input max="90" min="-90" onChange={(event) => change('lat', event.target.value)} placeholder="e.g. 19.0760" step="any" type="number" value={filters.lat} /></label>
          <label className="form-field"><span>Longitude</span><input max="180" min="-180" onChange={(event) => change('lng', event.target.value)} placeholder="e.g. 72.8777" step="any" type="number" value={filters.lng} /></label>
          <label className="form-field"><span>Radius (km)</span><input max="500" min="0.1" onChange={(event) => change('radiusKm', event.target.value)} step="any" type="number" value={filters.radiusKm} /></label>
        </fieldset>
        <label className="form-field ride-sort-field"><span>Sort by</span>
          <select onChange={(event) => change('sort', event.target.value)} value={filters.sort}><option value="time">Departure time</option><option value="price">Lowest price</option></select>
        </label>
        <button className="button button--primary ride-search-submit" disabled={loading} type="submit">{loading ? 'Searching…' : 'Search rides'}</button>
      </form>

      <div className="ride-search-status">
        <p>{loading ? 'Loading available rides…' : `${meta.total} open ${meta.total === 1 ? 'ride' : 'rides'} found`}</p>
        <p className={realtime.connected ? 'ride-live-status is-connected' : 'ride-live-status'} role="status">
          {realtime.connected ? 'Live seat updates connected' : 'Live seat updates connecting'}
        </p>
      </div>
      {realtime.connectionError && <p className="inline-alert" role="status">{realtime.connectionError}</p>}

      <div className="ride-search-results">
        <section aria-label="Available rides" className="ride-result-list">
          {loading ? (
            <div aria-label="Loading rides" className="table-loading"><div className="skeleton-line skeleton-line--wide" /><div className="skeleton-line" /><div className="skeleton-line skeleton-line--short" /></div>
          ) : rides.length ? (
            rides.map((ride) => <RideCard key={ride.id} ride={ride} />)
          ) : (
            <div className="ride-empty"><p className="eyebrow">NO MATCHING DEPARTURES</p><h2>{searched ? 'No rides match these filters.' : 'Search active routes.'}</h2><p>Try another date, a wider destination radius or fewer seats.</p></div>
          )}
          {!loading && pageCount > 1 && (
            <nav aria-label="Ride search pages" className="ride-pagination">
              <button className="text-button" disabled={page <= 1} onClick={() => changePage(page - 1)} type="button">Previous</button>
              <span>Page {page} of {pageCount}</span>
              <button className="text-button" disabled={page >= pageCount} onClick={() => changePage(page + 1)} type="button">Next</button>
            </nav>
          )}
        </section>
        <aside className="ride-map-panel">
          <p className="eyebrow">DESTINATION MAP</p>
          <RouteMap markers={rides} onMarkerSelect={(id) => { window.location.href = `/rides/${id}`; }} />
          <p className="map-instructions">Map markers show destinations for the current result page.</p>
        </aside>
      </div>
    </RideShell>
  );
}
