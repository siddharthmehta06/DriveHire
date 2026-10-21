export function BrandMark({ compact = false }) {
  return (
    <a className={`brand-mark${compact ? ' brand-mark--compact' : ''}`} href="/" aria-label="DriveHire home">
      <span className="brand-mark__drive">drive</span>
      <span className="brand-mark__hire">hire</span>
    </a>
  );
}
