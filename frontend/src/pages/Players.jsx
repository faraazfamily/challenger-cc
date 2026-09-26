import { useEffect, useState } from 'react';
import { api } from '../api';
import PlayerCard from '../components/PlayerCard';

export default function Players() {
  const [players, setPlayers] = useState([]);
  const [filter, setFilter] = useState('All');

  useEffect(() => { api.getPlayers().then(setPlayers).catch(() => {}); }, []);

  const roles = ['All', 'Batsman', 'Bowler', 'All-rounder', 'Wicketkeeper'];
  const filtered = filter === 'All'
    ? players
    : players.filter((p) => p.role === filter || (filter === 'Wicketkeeper' && p.is_wicketkeeper));

  return (
    <div className="container section">
      <h2>Squad</h2>
      <div className="stat-tabs">
        {roles.map((r) => (
          <div key={r} className={`stat-tab ${filter === r ? 'active' : ''}`} onClick={() => setFilter(r)}>{r}</div>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div className="empty-state">No players found.</div>
      ) : (
        <div className="grid grid-3">
          {filtered.map((p) => <PlayerCard key={p.id} player={p} />)}
        </div>
      )}
    </div>
  );
}
