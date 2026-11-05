// Loading and empty states shared by the pages: shimmering placeholders shaped like the
// content that is coming, and an empty state with an icon instead of a bare sentence.

export function SkeletonCards({ count = 6 }) {
  return (
    <div className="grid grid-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card skel-card">
          <span className="skel skel-circle" />
          <span className="skel skel-line w40" />
          <span className="skel skel-line w60" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonRows({ rows = 5 }) {
  return (
    <div className="card skel-rows" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skel-row">
          <span className="skel skel-dot" />
          <span className="skel skel-line w50" />
          <span className="skel skel-line w20" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonStage() {
  return (
    <div className="container section" aria-busy="true" aria-label="Loading">
      <div className="stage skel-stage">
        <span className="skel skel-circle big" />
        <div>
          <span className="skel skel-line w30" />
          <span className="skel skel-line tall w60" />
          <div className="skel-tiles">{[0, 1, 2, 3].map((i) => <span key={i} className="skel skel-tile" />)}</div>
        </div>
      </div>
      <SkeletonRows rows={2} />
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children }) {
  return (
    <div className="empty-box">
      {Icon && <span className="empty-icon"><Icon size={26} strokeWidth={2} aria-hidden="true" /></span>}
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}
