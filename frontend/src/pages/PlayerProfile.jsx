import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { PlayerAvatar } from '../components/PlayerCard';

export default function PlayerProfile() {
  const { id } = useParams();
  const [player, setPlayer] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getPlayer(id).then(setPlayer).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="container section empty-state">{error}</div>;
  if (!player) return <div className="container section empty-state">Loading...</div>;

  return (
    <div className="container section">
      <div className="card" style={{ padding: 32, display: 'flex', gap: 28, alignItems: 'center', marginBottom: 32, flexWrap: 'wrap' }}>
        <PlayerAvatar player={player} className="profile-avatar" />
        <div>
          <h1 style={{ margin: '0 0 6px' }}>{player.name}</h1>
          <span className="role-tag">{player.role}</span>{' '}
          {player.is_captain && <span className="captain-badge">★ Captain</span>}
          {player.is_vice_captain && <span className="captain-badge">Vice-Captain</span>}
          {player.is_wicketkeeper && <span className="captain-badge">Wicketkeeper</span>}
          <p style={{ color: '#6b7280', marginTop: 10 }}>{player.bio}</p>
          <div style={{ fontSize: '0.9rem', color: '#374151' }}>
            {player.batting_style && <div><strong>Batting:</strong> {player.batting_style}</div>}
            {player.bowling_style && <div><strong>Bowling:</strong> {player.bowling_style}</div>}
            {player.fielding_notes && <div><strong>Fielding:</strong> {player.fielding_notes}</div>}
            {player.jersey_number && <div className="jersey-badge" style={{ marginTop: 10 }}>{player.jersey_number}</div>}
          </div>
        </div>
      </div>

      <h2>Career Batting Stats</h2>
      <div className="card" style={{ padding: 20, marginBottom: 32 }}>
        <table>
          <thead>
            <tr><th>Innings</th><th>Runs</th><th>Highest</th><th>Average</th><th>Strike Rate</th><th>4s</th><th>6s</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>{player.career.batting.innings}</td>
              <td>{player.career.batting.runs}</td>
              <td>{player.career.batting.highestScore}</td>
              <td>{player.career.batting.average}</td>
              <td>{player.career.batting.strikeRate}</td>
              <td>{player.career.batting.fours}</td>
              <td>{player.career.batting.sixes}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Career Bowling Stats</h2>
      <div className="card" style={{ padding: 20 }}>
        <table>
          <thead>
            <tr><th>Innings</th><th>Overs</th><th>Wickets</th><th>Average</th><th>Economy</th><th>Maidens</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>{player.career.bowling.innings}</td>
              <td>{player.career.bowling.overs}</td>
              <td>{player.career.bowling.wickets}</td>
              <td>{player.career.bowling.average}</td>
              <td>{player.career.bowling.economy}</td>
              <td>{player.career.bowling.maidens}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
