import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CalendarDays, MapPin, Trophy } from 'lucide-react';
import { api, cached } from '../api';
import { SkeletonStage } from '../components/Feedback';

export default function MatchDetail() {
  const { id } = useParams();
  const [match, setMatch] = useState(() => cached(`/api/matches/${id}`));

  useEffect(() => {
    setMatch(cached(`/api/matches/${id}`));
    api.getMatch(id).then(setMatch).catch(() => {});
  }, [id]);

  if (!match) return <SkeletonStage />;

  // Test matches have 2 innings per side, so show which innings a row belongs to.
  const multi = match.batting.some((b) => b.innings_no > 1) || match.bowling.some((b) => b.innings_no > 1);

  return (
    <div className="container section">
      {/* scoreboard header: both totals side by side, result and match details */}
      <section className="match-hero">
        <div className="match-hero-top">
          <span className={`badge ${match.result === 'Won' ? 'badge-won' : match.result === 'Lost' ? 'badge-lost' : 'badge-upcoming'}`}>{match.result}</span>
          <span className="match-meta"><CalendarDays size={15} aria-hidden="true" />{new Date(match.match_date).toLocaleDateString()}</span>
          <span className="match-meta"><MapPin size={15} aria-hidden="true" />{match.venue || 'Venue TBD'}</span>
          <span className="match-meta"><Trophy size={15} aria-hidden="true" />{match.tournament_name || 'Friendly'}</span>
        </div>
        <div className="match-teams">
          <div className={`match-team ${match.result === 'Won' ? 'winner' : ''}`}>
            <span>The Challengers</span>
            <strong>{match.our_score || '—'}</strong>
          </div>
          <div className="match-vs">VS</div>
          <div className={`match-team right ${match.result === 'Lost' ? 'winner' : ''}`}>
            <span>{match.opponent}</span>
            <strong>{match.opponent_score || '—'}</strong>
          </div>
        </div>
        {match.result_note && <p className="match-note">{match.result_note}</p>}
      </section>
      {match.in_records === false && (
        <div className="review-note">This match is not counted in player stats, the leaderboard or the team record.</div>
      )}

      <h3 data-reveal>Batting</h3>
      <div className="card" style={{ marginBottom: 24 }}>
        <table>
          <thead><tr><th>Player</th>{multi && <th>Inn</th>}<th>Runs</th><th>Balls</th><th>4s</th><th>6s</th><th>Dismissal</th></tr></thead>
          <tbody>
            {match.batting.length === 0 ? (
              <tr><td colSpan="6" style={{ textAlign: 'center', color: '#6b7280' }}>No batting stats recorded</td></tr>
            ) : match.batting.map((b) => (
              <tr key={b.id}>
                <td>{b.player_name}</td>{multi && <td>{b.innings_no}</td>}<td>{b.runs}{!b.is_out && '*'}</td><td>{b.balls_faced}</td>
                <td>{b.fours}</td><td>{b.sixes}</td><td>{b.dismissal_type || (b.is_out ? '-' : 'Not Out')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 data-reveal>Bowling</h3>
      <div className="card">
        <table>
          <thead><tr><th>Player</th>{multi && <th>Inn</th>}<th>Overs</th><th>Maidens</th><th>Runs</th><th>Wickets</th></tr></thead>
          <tbody>
            {match.bowling.length === 0 ? (
              <tr><td colSpan="5" style={{ textAlign: 'center', color: '#6b7280' }}>No bowling stats recorded</td></tr>
            ) : match.bowling.map((b) => (
              <tr key={b.id}>
                <td>{b.player_name}</td>{multi && <td>{b.innings_no}</td>}<td>{b.overs}</td><td>{b.maidens}</td><td>{b.runs_conceded}</td><td>{b.wickets}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
