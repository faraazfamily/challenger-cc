import { useEffect, useState } from 'react';
import { api } from '../api';

export default function AdminMatches() {
  const [matches, setMatches] = useState([]);

  useEffect(() => {
    api.getMatches().then(setMatches).catch(() => {});
  }, []);

  async function toggleRecords(m) {
    const next = !m.in_records;
    const msg = next
      ? 'Count this match in player stats, the leaderboard and the team record again?'
      : 'Remove this match from player stats, the leaderboard and the team record? The match itself is kept and you can switch it back on any time.';
    if (!confirm(msg)) return;
    await api.setMatchInRecords(m.id, next);
    api.getMatches().then(setMatches).catch(() => {});
  }

  async function handleDelete(id) {
    if (!confirm('Delete this match? This also removes its scorecard stats.')) return;
    await api.deleteMatch(id);
    api.getMatches().then(setMatches).catch(() => {});
  }

  return (
    <div>
      <div className="review-note">Matches are created from the scorecard PDF. Upload one from the Upload Scorecard tab.</div>
      <h3>All Matches</h3>
      {matches.length === 0 ? (
        <div className="empty-state">No matches yet.</div>
      ) : (
        <div className="card">
          <table>
            <thead><tr><th>Date</th><th>Opponent</th><th>Score</th><th>Result</th><th>In records</th><th></th></tr></thead>
            <tbody>
              {matches.map((m) => (
                <tr key={m.id}>
                  <td>{new Date(m.match_date).toLocaleDateString()}</td>
                  <td>{m.opponent}</td>
                  <td>{m.our_score || '—'} vs {m.opponent_score || '—'}</td>
                  <td>{m.result}</td>
                  <td>
                    <button className={`btn btn-sm ${m.in_records ? 'btn-primary' : 'btn-secondary'}`} onClick={() => toggleRecords(m)}>
                      {m.in_records ? 'Counted ✓' : 'Not counted'}
                    </button>
                  </td>
                  <td><button className="btn btn-danger btn-sm" onClick={() => handleDelete(m.id)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
