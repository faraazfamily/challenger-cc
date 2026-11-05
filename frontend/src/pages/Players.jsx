import { useEffect, useState } from 'react';
import { api, cached } from '../api';
import { Users } from 'lucide-react';
import PlayerCard from '../components/PlayerCard';
import { SkeletonCards, EmptyState } from '../components/Feedback';

export default function Players() {
  const [players, setPlayers] = useState(() => cached('/api/players')); // null = still loading
  const [filter, setFilter] = useState('All');

  useEffect(() => { api.getPlayers().then(setPlayers).catch(() => setPlayers((p) => p || [])); }, []);

  const roles = ['All', 'Batsman', 'Bowler', 'All-rounder', 'Wicketkeeper'];
  const list = players || [];
  const filtered = filter === 'All'
    ? list
    : list.filter((p) => p.role === filter || (filter === 'Wicketkeeper' && p.is_wicketkeeper));

  return (
    <div className="container section">
      <h2 data-reveal>Squad</h2>
      <div className="stat-tabs">
        {roles.map((r) => (
          <button type="button" key={r} className={`stat-tab ${filter === r ? 'active' : ''}`} onClick={() => setFilter(r)}>{r}</button>
        ))}
      </div>
      {players === null ? <SkeletonCards /> : filtered.length === 0 ? (
        <EmptyState icon={Users} title="No players here yet">Try another role, or add players from the Admin panel.</EmptyState>
      ) : (
        <div className="grid grid-3">
          {filtered.map((p) => <PlayerCard key={p.id} player={p} />)}
        </div>
      )}
    </div>
  );
}
