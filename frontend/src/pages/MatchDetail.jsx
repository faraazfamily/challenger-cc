import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';

export default function MatchDetail() {
  const { id } = useParams();
  const [match, setMatch] = useState(null);

  useEffect(() => { api.getMatch(id).then(setMatch).catch(() => {}); }, [id]);

  if (!match) return <div className="container section empty-state">Loading...</div>;

  return (
    <div className="container section">
      <h2>vs {match.opponent}</h2>
      <p style={{ color: '#6b7280' }}>
        {new Date(match.match_date).toLocaleDateString()} · {match.venue || 'Venue TBD'} · {match.tournament_name || 'Friendly'}
      </p>
      <p><strong>{match.our_score}</strong> {match.opponent_score ? `vs ${match.opponent_score}` : ''} — <strong>{match.result}</strong></p>

      <h3>Batting</h3>
      <div className="card" style={{ marginBottom: 24 }}>
        <table>
          <thead><tr><th>Player</th><th>Runs</th><th>Balls</th><th>4s</th><th>6s</th><th>Dismissal</th></tr></thead>
          <tbody>
            {match.batting.length === 0 ? (
              <tr><td colSpan="6" style={{ textAlign: 'center', color: '#6b7280' }}>No batting stats recorded</td></tr>
            ) : match.batting.map((b) => (
              <tr key={b.id}>
                <td>{b.player_name}</td><td>{b.runs}{!b.is_out && '*'}</td><td>{b.balls_faced}</td>
                <td>{b.fours}</td><td>{b.sixes}</td><td>{b.dismissal_type || (b.is_out ? '-' : 'Not Out')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Bowling</h3>
      <div className="card">
        <table>
          <thead><tr><th>Player</th><th>Overs</th><th>Maidens</th><th>Runs</th><th>Wickets</th></tr></thead>
          <tbody>
            {match.bowling.length === 0 ? (
              <tr><td colSpan="5" style={{ textAlign: 'center', color: '#6b7280' }}>No bowling stats recorded</td></tr>
            ) : match.bowling.map((b) => (
              <tr key={b.id}>
                <td>{b.player_name}</td><td>{b.overs}</td><td>{b.maidens}</td><td>{b.runs_conceded}</td><td>{b.wickets}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
