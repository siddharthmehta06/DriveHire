import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../../api/http';
import { useAuth } from '../../../context/AuthContext';
import { RideShell } from '../components/RideShell';
import { RouteMap } from '../components/RouteMap';
import { createRide, listRideVehicles } from '../api';

function initialDeparture() {
  const date = new Date(Date.now() + 5 * 60 * 60 * 1000);
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

const INITIAL_FORM = {
  vehicleId: '',
  originText: '',
  originLat: '18.5204',
  originLng: '73.8567',
  destText: '',
  destLat: '19.0760',
  destLng: '72.8777',
  departureTime: initialDeparture(),
  totalSeats: '3',
  costPerSeat: '',
  distanceKm: '',
  notes: '',
};

export function PostRidePage() {
  const { user, token, signOut } = useAuth();
  const [vehicles, setVehicles] = useState([]);
  const [form, setForm] = useState(INITIAL_FORM);
  const [activePoint, setActivePoint] = useState('origin');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    let active = true;
    listRideVehicles(token)
      .then((result) => {
        if (!active) return;
        setVehicles(result.data);
        if (result.data[0]) setForm((current) => ({ ...current, vehicleId: result.data[0].id }));
      })
      .catch((requestError) => {
        if (requestError instanceof ApiError && requestError.status === 401) signOut();
        else setError(requestError.message);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [signOut, token]);

  const origin = useMemo(() => ({
    text: form.originText,
    lat: Number(form.originLat),
    lng: Number(form.originLng),
  }), [form.originLat, form.originLng, form.originText]);
  const destination = useMemo(() => ({
    text: form.destText,
    lat: Number(form.destLat),
    lng: Number(form.destLng),
  }), [form.destLat, form.destLng, form.destText]);

  const selectPoint = useCallback((point) => {
    setForm((current) => ({
      ...current,
      ...(activePoint === 'origin'
        ? { originLat: point.lat.toFixed(6), originLng: point.lng.toFixed(6) }
        : { destLat: point.lat.toFixed(6), destLng: point.lng.toFixed(6) }),
    }));
  }, [activePoint]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setError('');
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess(null);
    try {
      const result = await createRide(token, {
        vehicleId: form.vehicleId,
        originText: form.originText,
        originLat: Number(form.originLat),
        originLng: Number(form.originLng),
        destText: form.destText,
        destLat: Number(form.destLat),
        destLng: Number(form.destLng),
        departureTime: new Date(form.departureTime).toISOString(),
        totalSeats: Number(form.totalSeats),
        costPerSeat: Number(form.costPerSeat),
        ...(form.distanceKm ? { distanceKm: Number(form.distanceKm) } : {}),
        ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
      });
      setSuccess(result.data);
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) signOut();
      else setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <RideShell signOut={signOut} user={user}>
      <div className="page-heading ride-page-heading">
        <div>
          <p className="eyebrow">DRIVER ROUTE REGISTER</p>
          <h1>Post a ride</h1>
          <p className="page-heading__subtitle">Set a departure, verified vehicle, passenger seats and an exact route.</p>
        </div>
        <a className="text-button" href="/rides/mine">View my rides</a>
      </div>
      {error && <div className="inline-alert" role="alert">{error}</div>}
      {success && (
        <div className="ride-success" role="status">
          <div><p className="eyebrow">RIDE POSTED</p><h2>{success.originText} to {success.destText}</h2><p>Your ride is open for search. {success.availableSeats} seats are available.</p></div>
          <a className="button button--primary" href={`/rides/${success.id}`}>Review ride</a>
        </div>
      )}
      {loading ? (
        <div aria-label="Loading verified vehicles" className="table-loading"><div className="skeleton-line skeleton-line--wide" /><div className="skeleton-line" /></div>
      ) : vehicles.length === 0 ? (
        <section className="ride-empty"><p className="eyebrow">VEHICLE REQUIREMENT</p><h2>No verified vehicle is available.</h2><p>Complete vehicle review and mark the vehicle available before posting a ride.</p><a className="text-button" href="/documents">Open document register</a></section>
      ) : (
        <form className="ride-form" onSubmit={submit}>
          <section className="ride-form-section">
            <p className="eyebrow">01 / VEHICLE & SCHEDULE</p>
            <label className="form-field"><span>Verified vehicle</span>
              <select onChange={(event) => update('vehicleId', event.target.value)} required value={form.vehicleId}>
                {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.make} {vehicle.model} · {vehicle.registrationNumber} · {vehicle.seatCapacity} seats</option>)}
              </select>
            </label>
            <label className="form-field"><span>Departure time</span>
              <input min={initialDeparture()} onChange={(event) => update('departureTime', event.target.value)} required type="datetime-local" value={form.departureTime} />
              <small>At least 30 minutes from now.</small>
            </label>
          </section>
          <section className="ride-form-section ride-route-section">
            <p className="eyebrow">02 / ROUTE & MAP</p>
            <div className="route-location-fields">
              <fieldset className={activePoint === 'origin' ? 'route-location is-active' : 'route-location'}>
                <legend>Origin</legend>
                <label className="form-field"><span>Origin name</span><input maxLength="160" onChange={(event) => update('originText', event.target.value)} required value={form.originText} /></label>
                <div className="route-coordinate-fields">
                  <label className="form-field"><span>Latitude</span><input max="90" min="-90" onChange={(event) => update('originLat', event.target.value)} required step="any" type="number" value={form.originLat} /></label>
                  <label className="form-field"><span>Longitude</span><input max="180" min="-180" onChange={(event) => update('originLng', event.target.value)} required step="any" type="number" value={form.originLng} /></label>
                </div>
                <button className="text-button" onClick={() => setActivePoint('origin')} type="button">Choose origin on map</button>
              </fieldset>
              <fieldset className={activePoint === 'destination' ? 'route-location is-active' : 'route-location'}>
                <legend>Destination</legend>
                <label className="form-field"><span>Destination name</span><input maxLength="160" onChange={(event) => update('destText', event.target.value)} required value={form.destText} /></label>
                <div className="route-coordinate-fields">
                  <label className="form-field"><span>Latitude</span><input max="90" min="-90" onChange={(event) => update('destLat', event.target.value)} required step="any" type="number" value={form.destLat} /></label>
                  <label className="form-field"><span>Longitude</span><input max="180" min="-180" onChange={(event) => update('destLng', event.target.value)} required step="any" type="number" value={form.destLng} /></label>
                </div>
                <button className="text-button" onClick={() => setActivePoint('destination')} type="button">Choose destination on map</button>
              </fieldset>
            </div>
            <p className="map-instructions">Click the map to place the selected {activePoint}. You can also enter coordinates directly.</p>
            <RouteMap destination={destination} onPointSelect={selectPoint} origin={origin} />
          </section>
          <section className="ride-form-section ride-pricing-section">
            <p className="eyebrow">03 / SEATS & PRICE</p>
            <div className="ride-form-inline">
              <label className="form-field"><span>Passenger seats</span><input max={vehicles.find((vehicle) => vehicle.id === form.vehicleId)?.seatCapacity || 8} min="1" onChange={(event) => update('totalSeats', event.target.value)} required type="number" value={form.totalSeats} /></label>
              <label className="form-field"><span>Cost per seat (INR)</span><input max="10000" min="0" onChange={(event) => update('costPerSeat', event.target.value)} required step="0.01" type="number" value={form.costPerSeat} /></label>
              <label className="form-field"><span>Route distance (km)</span><input min="0.01" onChange={(event) => update('distanceKm', event.target.value)} step="0.01" type="number" value={form.distanceKm} /></label>
            </div>
            <label className="form-field"><span>Notes for passengers <small className="form-hint">Optional, up to 1,000 characters</small></span><textarea maxLength="1000" onChange={(event) => update('notes', event.target.value)} rows="3" value={form.notes} /></label>
          </section>
          <div className="ride-form-actions">
            <p>Available seats start at the ride capacity. You can cancel this ride until it begins.</p>
            <button className="button button--primary" disabled={saving} type="submit">{saving ? 'Posting ride…' : 'Post ride'}</button>
          </div>
        </form>
      )}
    </RideShell>
  );
}
