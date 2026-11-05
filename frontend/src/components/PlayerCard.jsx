import { useState } from 'react';
import { Link } from 'react-router-dom';
import { assetUrl } from '../api';

export function hasPhoto(url) {
  return !!url && url !== 'null' && url !== 'undefined';
}

// size: the largest the avatar is shown at, so the API can send a small image
export function PlayerAvatar({ player, className = '', size = 200, eager = false }) {
  const [broken, setBroken] = useState(false);
  const initials = (player.name || '?').split(' ').map((n) => n[0]).slice(0, 2).join('');
  if (hasPhoto(player.photo_url) && !broken) {
    return <img className={className} src={assetUrl(player.photo_url, size)} alt={player.name} width={size} height={size} loading={eager ? 'eager' : 'lazy'} fetchpriority={eager ? 'high' : undefined} decoding="async" onError={() => setBroken(true)} />;
  }
  return <div className={`player-photo-placeholder ${className}`}>{initials}</div>;
}

// Desktop only: the card tilts a few degrees toward the pointer (ui.css .tilt).
function tiltHandlers() {
  if (typeof window === 'undefined' || !window.matchMedia('(hover: hover) and (pointer: fine)').matches
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return {};
  return {
    onPointerMove: (e) => {
      const el = e.currentTarget;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.classList.add('tilt');
      el.style.setProperty('--ry', `${(x * 10).toFixed(2)}deg`);
      el.style.setProperty('--rx', `${(-y * 10).toFixed(2)}deg`);
    },
    onPointerLeave: (e) => {
      e.currentTarget.classList.remove('tilt');
    },
  };
}

export default function PlayerCard({ player }) {
  return (
    <Link to={`/players/${player.id}`} className="card player-card" {...tiltHandlers()}>
      {/* the avatar "walks in" toward the screen when the card scrolls into view (motion.css) */}
      <div className="pc-stage">
        <PlayerAvatar player={player} className="pc-avatar" />
        <span className="pc-floor" aria-hidden="true" />
      </div>
      {player.jersey_number ? <div className="jersey-badge pc-jersey">{player.jersey_number}</div> : null}
      <h3>{player.name}</h3>
      <span className="role-tag">{player.role}</span>
      <div>
        {player.is_captain && <span className="captain-badge">★ Captain</span>}
        {player.is_vice_captain && <span className="captain-badge">Vice-Captain</span>}
        {player.is_wicketkeeper && <span className="captain-badge">Wicketkeeper</span>}
      </div>
    </Link>
  );
}
