import { useEffect, useMemo } from 'react';
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';

const DEFAULT_CENTER = [18.5204, 73.8567];

function MapPicker({ onPointSelect }) {
  useMapEvents({
    click(event) {
      onPointSelect?.({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });
  return null;
}

function MapViewport({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) map.fitBounds(points, { padding: [24, 24], maxZoom: 10 });
    else if (points.length === 1) map.setView(points[0], Math.max(map.getZoom(), 7));
  }, [map, points]);
  return null;
}

function validPoint(point) {
  return Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lng));
}

export function RouteMap({ origin, destination, markers = [], onPointSelect, onMarkerSelect }) {
  const center = useMemo(() => {
    const firstMarker = { lat: markers[0]?.destLat, lng: markers[0]?.destLng };
    const point = validPoint(origin) ? origin : validPoint(destination) ? destination : firstMarker;
    return validPoint(point) ? [Number(point.lat), Number(point.lng)] : DEFAULT_CENTER;
  }, [destination, markers, origin]);
  const points = useMemo(() => [origin, destination, ...markers.map((ride) => ({
    lat: ride.destLat,
    lng: ride.destLng,
  }))]
    .filter(validPoint)
    .map((point) => [Number(point.lat), Number(point.lng)]), [destination, markers, origin]);

  return (
    <div aria-label="Route map" className="route-map">
      <MapContainer center={center} scrollWheelZoom={false} zoom={7}>
        <MapViewport points={points} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapPicker onPointSelect={onPointSelect} />
        {validPoint(origin) && (
          <CircleMarker center={[Number(origin.lat), Number(origin.lng)]} pathOptions={{ color: '#244b43', fillOpacity: 0.9 }} radius={8}>
            <Popup>Origin: {origin.text || 'Selected point'}</Popup>
          </CircleMarker>
        )}
        {validPoint(destination) && (
          <CircleMarker center={[Number(destination.lat), Number(destination.lng)]} pathOptions={{ color: '#a66b30', fillOpacity: 0.9 }} radius={8}>
            <Popup>Destination: {destination.text || 'Selected point'}</Popup>
          </CircleMarker>
        )}
        {validPoint(origin) && validPoint(destination) && (
          <Polyline positions={[[Number(origin.lat), Number(origin.lng)], [Number(destination.lat), Number(destination.lng)]]} pathOptions={{ color: '#244b43', dashArray: '6 8', weight: 2 }} />
        )}
        {markers.map((ride) => validPoint({ lat: ride.destLat, lng: ride.destLng }) && (
          <CircleMarker
            center={[Number(ride.destLat), Number(ride.destLng)]}
            eventHandlers={{ click: () => onMarkerSelect?.(ride.id) }}
            key={ride.id}
            pathOptions={{ color: '#a54a3a', fillOpacity: 0.85 }}
            radius={7}
          >
            <Popup>
              <strong>{ride.originText} to {ride.destText}</strong>
              <br />
              {ride.availableSeats} seats · ₹{ride.costPerSeat} per seat
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
