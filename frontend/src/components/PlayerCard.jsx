import { useState } from 'react';
import { Link } from 'react-router-dom';
import { assetUrl } from '../api';

export function hasPhoto(url) {
  return !!url && url !== 'null' && url !== 'undefined';
}

export function PlayerAvatar({ player, className = '' }) {
  const [broken, setBroken] = useState(false);
  const initials = (player.name || '?').split(' ').map((n) => n[0]).slice(0, 2).join('');
  if (hasPhoto(player.photo_url) && !broken) {
    return <img className={className} src={assetUrl(player.photo_url)} alt={player.name} onError={() => setBroken(true)} />;
  }
  return <div className={`player-photo-placeholder ${className}`}>{initials}</div>;
}

export default function PlayerCard({ player }) {
  return (
    <Link to={`/players/${player.id}`} className="card player-card">
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
