import { useEffect, useMemo, useState } from 'react';

const VEHICLE_TYPES = ['HATCHBACK', 'SEDAN', 'SUV', 'MPV', 'LUXURY'];

export function VehicleForm({ initialVehicle, onCancel, onSave, saving }) {
  const [form, setForm] = useState(() => ({
    make: initialVehicle?.make || '',
    model: initialVehicle?.model || '',
    year: initialVehicle?.year || new Date().getFullYear(),
    registrationNumber: initialVehicle?.registrationNumber || '',
    vehicleType: initialVehicle?.vehicleType || 'SEDAN',
    seatCapacity: initialVehicle?.seatCapacity || 4,
  }));
  const [photos, setPhotos] = useState([]);
  const [removedPhotoUrls, setRemovedPhotoUrls] = useState([]);
  const [photoError, setPhotoError] = useState('');
  const newPhotoPreviews = useMemo(() => photos.map((photo) => URL.createObjectURL(photo)), [photos]);

  useEffect(() => {
    return () => newPhotoPreviews.forEach((url) => URL.revokeObjectURL(url));
  }, [newPhotoPreviews]);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function choosePhotos(event) {
    const selected = Array.from(event.target.files || []);
    const keptPhotoCount = (initialVehicle?.photoUrls?.length || 0) - removedPhotoUrls.length;
    if (selected.length + keptPhotoCount > 5) {
      setPhotoError(`Choose up to ${Math.max(0, 5 - keptPhotoCount)} additional photos.`);
      event.target.value = '';
      return;
    }
    const unsupported = selected.find((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type));
    const oversized = selected.find((file) => file.size > 5 * 1024 * 1024);
    if (unsupported || oversized) {
      setPhotoError(unsupported ? 'Photos must be JPG, PNG or WEBP.' : 'Each photo must be 5 MB or smaller.');
      event.target.value = '';
      return;
    }
    setPhotoError('');
    setPhotos(selected);
  }

  function submit(event) {
    event.preventDefault();
    const editableFields = { ...form };
    if (initialVehicle) delete editableFields.registrationNumber;
    onSave({
      fields: {
        ...editableFields,
        year: Number(form.year),
        seatCapacity: Number(form.seatCapacity),
        ...(removedPhotoUrls.length ? { removePhotoUrls: removedPhotoUrls } : {}),
      },
      photos,
    });
  }

  return (
    <form className="vehicle-form" onSubmit={submit}>
      <div className="form-grid">
        <div className="form-field">
          <label htmlFor="vehicle-make">Make</label>
          <input id="vehicle-make" name="make" onChange={updateField} required maxLength={120} value={form.make} />
        </div>
        <div className="form-field">
          <label htmlFor="vehicle-model">Model</label>
          <input id="vehicle-model" name="model" onChange={updateField} required maxLength={120} value={form.model} />
        </div>
        <div className="form-field">
          <label htmlFor="vehicle-year">Model year</label>
          <input id="vehicle-year" max={new Date().getFullYear() + 1} min="1990" name="year" onChange={updateField} required type="number" value={form.year} />
        </div>
        <div className="form-field">
          <label htmlFor="vehicle-seats">Passenger seats</label>
          <input id="vehicle-seats" max="8" min="1" name="seatCapacity" onChange={updateField} required type="number" value={form.seatCapacity} />
        </div>
        <div className="form-field form-field--wide">
          <label htmlFor="vehicle-registration">Registration number</label>
          <input
            autoCapitalize="characters"
            disabled={Boolean(initialVehicle)}
            id="vehicle-registration"
            maxLength={40}
            name="registrationNumber"
            onChange={updateField}
            placeholder="e.g. MH 12 AB 1234"
            required
            value={form.registrationNumber}
          />
          {initialVehicle && <span className="form-hint">Registration cannot be changed after adding a vehicle.</span>}
        </div>
        <div className="form-field form-field--wide">
          <label htmlFor="vehicle-type">Vehicle class</label>
          <select id="vehicle-type" name="vehicleType" onChange={updateField} value={form.vehicleType}>
            {VEHICLE_TYPES.map((type) => <option key={type} value={type}>{type.replace('_', ' ')}</option>)}
          </select>
        </div>
      </div>

      {initialVehicle && initialVehicle.photoUrls?.length > 0 && (
        <div className="existing-photos">
          <span className="field-label">Current photographs</span>
          <div className="photo-preview-grid">
            {initialVehicle.photoUrls.map((url) => {
              const removed = removedPhotoUrls.includes(url);
              return (
                <div className={`photo-preview${removed ? ' photo-preview--removed' : ''}`} key={url}>
                  <img alt={`${initialVehicle.make} ${initialVehicle.model}`} src={url} />
                  <button
                    aria-label={`${removed ? 'Keep' : 'Remove'} photo`}
                    onClick={() => setRemovedPhotoUrls((current) => (
                      removed ? current.filter((item) => item !== url) : [...current, url]
                    ))}
                    type="button"
                  >
                    {removed ? 'Keep' : 'Remove'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="photo-field">
        <label htmlFor="vehicle-photos">
          {initialVehicle ? 'Add photographs' : 'Vehicle photographs'}
          <span className="field-note">Optional · up to 5 total</span>
        </label>
        <input accept="image/jpeg,image/png,image/webp" id="vehicle-photos" multiple onChange={choosePhotos} type="file" />
        <p className="form-hint">JPG, PNG or WEBP. Maximum 5 MB per image.</p>
        {photoError && <p className="form-error" role="alert">{photoError}</p>}
        {photos.length > 0 && (
          <div className="photo-preview-grid">
            {photos.map((photo, index) => (
              <img alt={`Selected vehicle photo ${index + 1}`} key={`${photo.name}-${photo.lastModified}`} src={newPhotoPreviews[index]} />
            ))}
          </div>
        )}
      </div>

      <div className="dialog-actions">
        <button className="button button--quiet" onClick={onCancel} type="button">Cancel</button>
        <button className="button button--primary" disabled={saving} type="submit">
          {saving ? 'Saving…' : initialVehicle ? 'Save vehicle details' : 'Add vehicle'}
        </button>
      </div>
    </form>
  );
}
