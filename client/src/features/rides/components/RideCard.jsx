export function SeatBadge({ availableSeats, totalSeats }) {
  return <span className={`ride-seat-badge${availableSeats === 0 ? ' is-full' : ''}`}>{availableSeats} of {totalSeats} seats</span>;
}

export function RideCard({ ride }) {
  const departure = new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(ride.departureTime));
  return (
    <a className="ride-card" href={`/rides/${ride.id}`}>
      <div className="ride-card__route">
        <span className="eyebrow">DEPARTURE / {departure}</span>
        <h2>{ride.originText}</h2>
        <span className="ride-route-connector" aria-hidden="true" />
        <h2>{ride.destText}</h2>
      </div>
      <div className="ride-card__details">
        <span>Driver <strong>{ride.driver.firstName}</strong></span>
        <span>Vehicle <strong>{ride.vehicle.make} {ride.vehicle.model}</strong></span>
        <SeatBadge availableSeats={ride.availableSeats} totalSeats={ride.totalSeats} />
        <strong className="ride-card__price">₹{Number(ride.costPerSeat).toLocaleString('en-IN')} <small>/ seat</small></strong>
      </div>
    </a>
  );
}
