import { useEffect, useState } from 'react';
import { useDialog } from './Dialog';
import { Trash2 } from 'lucide-react';
import { api } from '../api';
import { SkeletonRows } from './Feedback';

export default function AdminMatches() {
  const { confirm, prompt: ask, toast } = useDialog();
  const [matches, setMatches] = useState(null); // null = still loading

  useEffect(() => {
    api.getMatches().then(setMatches).catch(() => setMatches((m) => m || []));
  }, []);

  async function toggleRecords(m) {
    const next = !m.in_records;
    const ok = await confirm(next
      ? { title: 'Count this match again?', message: 'It goes back into player stats, the leaderboard and the team record.', confirmLabel: 'Count it' }
      : { title: 'Stop counting this match?', message: 'It is taken out of player stats, the leaderboard and the team record. The match itself is kept and you can switch it back on any time.', confirmLabel: 'Stop counting', danger: true });
    if (!ok) return;
    try {
      await api.setMatchInRecords(m.id, next);
      toast(next ? 'Match counted again' : 'Match no longer counted', 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
    api.getMatches().then(setMatches).catch(() => setMatches((m) => m || []));
  }

  async function handleDelete(m) {
    if (!await confirm({ title: `Delete the match vs ${m.opponent}?`, message: 'This also removes its scorecard stats. This cannot be undone.', confirmLabel: 'Delete', danger: true })) return;
    try {
      await api.deleteMatch(m.id);
      toast('Match deleted', 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
    api.getMatches().then(setMatches).catch(() => setMatches((m) => m || []));
  }

  return (
    <div>
      <div className="review-note">Matches are created from the scorecard PDF. Upload one from the Upload Scorecard tab.</div>
      <h3>All Matches</h3>
      {matches === null ? <SkeletonRows /> : matches.length === 0 ? (
        <div className="empty-state">No matches yet.</div>
      ) : (
        <div className="card">
          <table className="admin-match-table">
            <thead><tr><th>Date</th><th>Opponent</th><th>Score</th><th>Result</th><th>In records</th><th></th></tr></thead>
            <tbody>
              {matches.map((m) => (
                <tr key={m.id} data-reveal>
                  <td className="am-date">{new Date(m.match_date).toLocaleDateString()}</td>
                  <td className="am-opp"><strong>{m.opponent}</strong></td>
                  <td className="am-score">{m.our_score || '—'} vs {m.opponent_score || '—'}</td>
                  <td className="am-res"><span className={`badge ${m.result === 'Won' ? 'badge-won' : m.result === 'Lost' ? 'badge-lost' : 'badge-upcoming'}`}>{m.result}</span></td>
                  <td className="am-rec">
                    {/* switch: counted in player stats / leaderboard or not */}
                    <button type="button" role="switch" aria-checked={!!m.in_records} className={`switch ${m.in_records ? 'on' : ''}`} onClick={() => toggleRecords(m)}>
                      <span className="switch-knob" />
                      <span className="switch-label">{m.in_records ? 'Counted' : 'Not counted'}</span>
                    </button>
                  </td>
                  <td className="am-del"><button className="btn btn-danger btn-sm btn-icon" onClick={() => handleDelete(m)}><Trash2 size={14} aria-hidden="true" /> Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
