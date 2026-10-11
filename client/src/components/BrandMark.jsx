export function BrandMark({ compact = false }) {
  return (
    <a className={`brand-mark${compact ? ' brand-mark--compact' : ''}`} href="/" aria-label="DriveHire home">
      <span className="brand-mark__glyph" aria-hidden="true">D</span>
      <span className="brand-mark__word">drivehire<span className="brand-mark__period">.</span></span>
    </a>
  );
}
