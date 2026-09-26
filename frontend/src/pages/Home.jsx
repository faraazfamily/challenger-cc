import { useEffect, useState } from 'react';
import { api } from '../api';
import PlayerCard from '../components/PlayerCard';

export default function Home() {
  const [team, setTeam] = useState(null);
  const [players, setPlayers] = useState([]);
  const [record, setRecord] = useState([]);

  useEffect(() => {
    api.getTeam().then(setTeam).catch(() => {});
    api.getPlayers().then(setPlayers).catch(() => {});
    api.getTeamRecord().then(setRecord).catch(() => {});
  }, []);

  const recordFor = (r) => record.find((x) => x.result === r)?.count || 0;

  return (
    <div>
      <div className="hero">
        <div className="container">
          <img className="hero-logo" src="/jersey-logo.png" alt="Chaillengers crest" />
          <h1>{team?.name || 'The Challengers'}</h1>
          <p>{team?.tagline || 'Play Hard. Play Fair. Challenge Everything.'}</p>
        </div>
      </div>

      <div className="container section">
        <div className="grid grid-3" style={{ marginBottom: 40 }}>
          <div className="card" style={{ padding: 20, textAlign: 'center' }}>
            <h2 style={{ margin: 0, color: '#1a7a4c' }}>{recordFor('Won')}</h2>
            <div>Matches Won</div>
          </div>
          <div className="card" style={{ padding: 20, textAlign: 'center' }}>
            <h2 style={{ margin: 0, color: '#c0392b' }}>{recordFor('Lost')}</h2>
            <div>Matches Lost</div>
          </div>
          <div className="card" style={{ padding: 20, textAlign: 'center' }}>
            <h2 style={{ margin: 0 }}>{players.length > 0 ? players.length : '-'}+</h2>
            <div>Squad Members</div>
          </div>
        </div>

        {team?.about && (
          <div style={{ marginBottom: 40 }}>
            <h2>About the Club</h2>
            <p style={{ color: '#c9d3e8', lineHeight: 1.6 }}>{team.about}</p>
          </div>
        )}

        <h2>Squad Highlights</h2>
        {players.length === 0 ? (
          <div className="empty-state">No players added yet. Head to Admin to add your squad.</div>
        ) : (
          <div className="grid grid-3">
            {players.map((p) => <PlayerCard key={p.id} player={p} />)}
          </div>
        )}
      </div>
    </div>
  );
}
