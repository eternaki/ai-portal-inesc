export default function SearchLoading() {
  return (
    <div>
      <div className="skeleton skeleton-title" style={{ width: '10ch' }} />
      <div className="skeleton skeleton-text" style={{ width: '50ch', maxWidth: '100%' }} />
      <div className="skeleton skeleton-search-bar" />
      <div className="skeleton skeleton-chip-row">
        <span className="skeleton skeleton-chip" />
        <span className="skeleton skeleton-chip" />
        <span className="skeleton skeleton-chip" />
        <span className="skeleton skeleton-chip" />
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="skeleton-pub-row">
          <div className="skeleton skeleton-text" style={{ width: '46ch', maxWidth: '90%', height: '1.1rem' }} />
          <div className="skeleton skeleton-text" style={{ width: '28ch', maxWidth: '70%' }} />
        </div>
      ))}
    </div>
  )
}
