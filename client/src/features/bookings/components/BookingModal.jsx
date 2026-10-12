import { useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { requestBooking } from '../api';

export function BookingModal({ ride, isOpen, onClose, onSuccess }) {
  const { token } = useAuth();
  const [seatsBooked, setSeatsBooked] = useState(1);
  const [pickupNote, setPickupNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !ride) return null;

  const maxSeats = Math.min(6, ride.availableSeats || 1);
  const totalCost = (Number(seatsBooked) || 1) * Number(ride.costPerSeat || 0);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const result = await requestBooking(token, ride.id, {
        seatsBooked: Number(seatsBooked),
        pickupNote: pickupNote.trim() || undefined,
      });
      onSuccess?.(result.data);
      onClose();
    } catch (requestError) {
      setError(requestError.message || 'Failed to submit seat request.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="booking-modal-title">
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <p className="eyebrow">SEAT RESERVATION</p>
            <h2 id="booking-modal-title">Request seats on this ride</h2>
          </div>
          <button
            type="button"
            className="text-button"
            onClick={onClose}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="booking-form">
          <div className="booking-summary-box">
            <div className="booking-summary-row">
              <span className="booking-summary-label">Route</span>
              <span className="booking-summary-value">{ride.originText} → {ride.destText}</span>
            </div>
            <div className="booking-summary-row">
              <span className="booking-summary-label">Departure</span>
              <span className="booking-summary-value">
                {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ride.departureTime))}
              </span>
            </div>
            <div className="booking-summary-row">
              <span className="booking-summary-label">Rate</span>
              <span className="booking-summary-value font-mono">₹{Number(ride.costPerSeat).toLocaleString('en-IN')} / seat</span>
            </div>
          </div>

          {error && <div className="inline-alert" role="alert">{error}</div>}

          <div className="form-group">
            <label htmlFor="seatsBooked">Number of seats (max {maxSeats})</label>
            <select
              id="seatsBooked"
              value={seatsBooked}
              onChange={(e) => setSeatsBooked(Number(e.target.value))}
              disabled={submitting}
              className="form-control"
            >
              {Array.from({ length: maxSeats }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n} {n === 1 ? 'seat' : 'seats'}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="pickupNote">Pickup location / passenger note (optional)</label>
            <input
              id="pickupNote"
              type="text"
              maxLength={255}
              placeholder="e.g. Waiting near main exit with 1 backpack"
              value={pickupNote}
              onChange={(e) => setPickupNote(e.target.value)}
              disabled={submitting}
              className="form-control"
            />
          </div>

          <div className="booking-total-banner">
            <span>Estimated total</span>
            <strong className="booking-total-amount font-mono">₹{totalCost.toLocaleString('en-IN')}</strong>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={submitting}
            >
              {submitting ? 'Submitting request...' : 'Send seat request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
