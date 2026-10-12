import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import { useAuth } from '../../../context/AuthContext';
import { RideShell } from '../../rides/components/RideShell';
import { getRide } from '../../rides/api';
import { fetchRideLocation } from '../api';

const DEFAULT_CENTER = [18.5204, 73.8567];

function MapViewport({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) {
      map.fitBounds(points, { padding: [32, 32], maxZoom: 14 });
    } else if (points.length === 1) {
      map.setView(points[0], 12);
    }
  }, [map, points]);
  return null;
}

function validPoint(p) {
  return p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng));
}

export function TrackRidePage() {
  const { user, token, signOut } = useAuth();
  const rideId = window.location.pathname.split('/')[2]; // /rides/:id/track
  const [ride, setRide] = useState(null);
  const [liveLocation, setLiveLocation] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 1. Fetch ride details
  useEffect(() => {
    let active = true;
    getRide(token, rideId)
      .then((res) => {
        if (active) setRide(res.data);
      })
      .catch((err) => {
        if (active) setError(err.message || 'Ride not accessible.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [rideId, token]);

  // 2. Fetch initial location
  useEffect(() => {
    if (!rideId || !token) return;
    fetchRideLocation(token, rideId)
      .then((res) => {
        if (res.data) setLiveLocation(res.data);
      })
      .catch(() => {
        // Location might not be posted yet
      });
  }, [rideId, token]);

  // 3. Connect socket for real-time location stream
  useEffect(() => {
    if (!token || !rideId) return;

    const socket = io('/', {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      setSocketConnected(true);
      socket.emit('join:ride', rideId, (ack) => {
        if (!ack?.success) {
          setError(ack?.error || 'Unable to join live tracking session.');
        }
      });
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    socket.on('ride:location', (data) => {
      if (data && data.rideId === rideId) {
        setLiveLocation({
          lat: Number(data.lat),
          lng: Number(data.lng),
          updatedAt: data.updatedAt,
        });
      }
    });

    return () => {
      socket.emit('leave:ride', rideId);
      socket.disconnect();
    };
  }, [rideId, token]);

  const origin = ride && {
    text: ride.originText,
    lat: Number(ride.originLat),
    lng: Number(ride.originLng),
  };

  const destination = ride && {
    text: ride.destText,
    lat: Number(ride.destLat),
    lng: Number(ride.destLng),
  };

  const points = useMemo(() => {
    const list = [origin, destination];
    if (validPoint(liveLocation)) {
      list.push({ lat: liveLocation.lat, lng: liveLocation.lng });
    }
    return list.filter(validPoint).map((p) => [Number(p.lat), Number(p.lng)]);
  }, [destination, liveLocation, origin]);

  const center = useMemo(() => {
    if (validPoint(liveLocation)) return [Number(liveLocation.lat), Number(liveLocation.lng)];
    if (validPoint(origin)) return [Number(origin.lat), Number(origin.lng)];
    return DEFAULT_CENTER;
  }, [liveLocation, origin]);

  return (
    <RideShell signOut={signOut} user={user}>
      <div className="page-heading">
        <div>
          <p className="eyebrow">TELEMETRY & POSITIONING</p>
          <h1>Live Ride Tracking</h1>
          <p className="page-heading__subtitle">
            {ride ? `${ride.originText} → ${ride.destText}` : 'Connecting live ride feed...'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <a className="secondary-button" href="/bookings">
            Back to Bookings
          </a>
          {user.role === 'DRIVER' && ride?.driverId === user.id && (
            <a className="primary-button" href={`/driver/rides/${rideId}`}>
              Manage Ride Controls
            </a>
          )}
        </div>
      </div>

      {error && <div className="inline-alert" role="alert">{error}</div>}

      {loading ? (
        <div aria-label="Loading tracking" className="table-loading">
          <div className="skeleton-line skeleton-line--wide" />
          <div className="skeleton-line" />
        </div>
      ) : (
        <div className="track-layout">
          <section className="track-map-container">
            <div aria-label="Live Tracking Map" className="route-map" style={{ height: '520px' }}>
              <MapContainer center={center} scrollWheelZoom={true} zoom={11} style={{ height: '100%', width: '100%' }}>
                <MapViewport points={points} />
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {/* Origin Marker */}
                {validPoint(origin) && (
                  <CircleMarker
                    center={[Number(origin.lat), Number(origin.lng)]}
                    pathOptions={{ color: '#244b43', fillColor: '#244b43', fillOpacity: 0.9 }}
                    radius={8}
                  >
                    <Popup>
                      <strong>Origin</strong>
                      <br />
                      {origin.text}
                    </Popup>
                  </CircleMarker>
                )}

                {/* Destination Marker */}
                {validPoint(destination) && (
                  <CircleMarker
                    center={[Number(destination.lat), Number(destination.lng)]}
                    pathOptions={{ color: '#a66b30', fillColor: '#a66b30', fillOpacity: 0.9 }}
                    radius={8}
                  >
                    <Popup>
                      <strong>Destination</strong>
                      <br />
                      {destination.text}
                    </Popup>
                  </CircleMarker>
                )}

                {/* Route Line */}
                {validPoint(origin) && validPoint(destination) && (
                  <Polyline
                    positions={[
                      [Number(origin.lat), Number(origin.lng)],
                      [Number(destination.lat), Number(destination.lng)],
                    ]}
                    pathOptions={{ color: '#244b43', dashArray: '6 8', weight: 3, opacity: 0.6 }}
                  />
                )}

                {/* Live Driver Position Marker */}
                {validPoint(liveLocation) && (
                  <>
                    {/* Pulsing Outer Ring */}
                    <CircleMarker
                      center={[Number(liveLocation.lat), Number(liveLocation.lng)]}
                      pathOptions={{ color: '#2e7d32', fillColor: '#2e7d32', fillOpacity: 0.25, weight: 1 }}
                      radius={16}
                    />
                    {/* Core Vehicle Marker */}
                    <CircleMarker
                      center={[Number(liveLocation.lat), Number(liveLocation.lng)]}
                      pathOptions={{ color: '#1b5e20', fillColor: '#2e7d32', fillOpacity: 1, weight: 2 }}
                      radius={9}
                    >
                      <Popup>
                        <strong>Driver Live Location</strong>
                        <br />
                        Lat: {Number(liveLocation.lat).toFixed(5)}, Lng: {Number(liveLocation.lng).toFixed(5)}
                        <br />
                        <small className="font-mono">
                          {liveLocation.updatedAt ? new Date(liveLocation.updatedAt).toLocaleTimeString() : 'Just now'}
                        </small>
                      </Popup>
                    </CircleMarker>
                  </>
                )}
              </MapContainer>
            </div>
          </section>

          <aside className="track-sidebar">
            <div className="telemetry-card">
              <div className="telemetry-card__header">
                <span className="eyebrow">FEED STATUS</span>
                <span className={`status-indicator ${socketConnected ? 'status-indicator--live' : ''}`}>
                  {socketConnected ? '● LIVE STREAM' : '○ CONNECTING'}
                </span>
              </div>

              <div className="telemetry-item">
                <span className="telemetry-label">Vehicle Position</span>
                <span className="telemetry-value font-mono">
                  {validPoint(liveLocation)
                    ? `${Number(liveLocation.lat).toFixed(4)}° N, ${Number(liveLocation.lng).toFixed(4)}° E`
                    : 'Awaiting driver coordinates...'}
                </span>
              </div>

              {liveLocation?.updatedAt && (
                <div className="telemetry-item">
                  <span className="telemetry-label">Last Ping</span>
                  <span className="telemetry-value font-mono">
                    {new Date(liveLocation.updatedAt).toLocaleTimeString('en-IN', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                </div>
              )}

              <div className="telemetry-item">
                <span className="telemetry-label">Ride Status</span>
                <span className="telemetry-value font-mono" style={{ textTransform: 'uppercase' }}>
                  {ride?.status || 'UNKNOWN'}
                </span>
              </div>

              {ride?.vehicle && (
                <div className="telemetry-item">
                  <span className="telemetry-label">Vehicle</span>
                  <span className="telemetry-value">
                    {ride.vehicle.make} {ride.vehicle.model} ({ride.vehicle.vehicleType})
                  </span>
                </div>
              )}

              {ride?.driver && (
                <div className="telemetry-item">
                  <span className="telemetry-label">Driver</span>
                  <span className="telemetry-value">{ride.driver.firstName || 'Assigned Driver'}</span>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </RideShell>
  );
}
