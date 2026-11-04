import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, cached } from '../api';

function badgeClass(result) {
  if (result === 'Won') return 'badge badge-won';
  if (result === 'Lost') return 'badge badge-lost';
  return 'badge badge-upcoming';
}

export default function Matches() {
  const [matches, setMatches] = useState(() => cached('/api/matches') || []);

  useEffect(() => { api.getMatches().then(setMatches).catch(() => {}); }, []);

  return (
    <div className="container section">
      <h2 data-reveal>Matches</h2>
      {matches.length === 0 ? (
        <div className="empty-state">No matches recorded yet.</div>
      ) : (
        <div className="card">
          <table className="match-table">
            <thead>
              <tr><th>Date</th><th>Opponent</th><th>Tournament</th><th>Score</th><th>Result</th></tr>
            </thead>
            <tbody>
              {matches.map((m) => (
                <tr key={m.id} data-reveal>
                  <td className="mt-date">{new Date(m.match_date).toLocaleDateString()}</td>
                  <td className="mt-opp"><Link to={`/matches/${m.id}`}>{m.opponent}</Link></td>
                  <td className="mt-tour">{m.tournament_name || '-'}</td>
                  <td className="mt-score">{m.our_score || '-'} {m.opponent_score ? `vs ${m.opponent_score}` : ''}</td>
                  <td className="mt-res">
                    <span className={badgeClass(m.result)}>{m.result}</span>
                    {m.in_records === false && <span className="badge badge-upcoming" style={{ marginLeft: 6 }}>Not counted</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
