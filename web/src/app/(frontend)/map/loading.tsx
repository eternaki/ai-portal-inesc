export default function MapLoading() {
  return (
    <div>
      <div className="skeleton skeleton-title" style={{ width: '14ch' }} />
      <div className="skeleton skeleton-text" style={{ width: '60ch', maxWidth: '100%' }} />
      <div className="skeleton skeleton-chip-row">
        <span className="skeleton skeleton-chip" />
        <span className="skeleton skeleton-chip" />
        <span className="skeleton skeleton-chip" />
      </div>
      <div className="skeleton skeleton-map" />
    </div>
  )
}
