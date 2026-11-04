import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, cached } from '../api';
import PlayerStage from '../components/PlayerStage';

export default function PlayerProfile() {
  const { id } = useParams();
  const [player, setPlayer] = useState(() => cached(`/api/players/${id}`));
  const [error, setError] = useState('');

  useEffect(() => {
    setPlayer(cached(`/api/players/${id}`));
    api.getPlayer(id).then(setPlayer).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="container section empty-state">{error}</div>;
  if (!player) return <div className="container section empty-state">Loading...</div>;

  return (
    <div className="container section">
      <PlayerStage player={player} />

      <h2 data-reveal>Career Batting Stats</h2>
      <div className="card" style={{ padding: 20, marginBottom: 32 }}>
        <table className="career-table">
          <thead>
            <tr><th>Innings</th><th>Runs</th><th>Highest</th><th>Average</th><th>Strike Rate</th><th>4s</th><th>6s</th></tr>
          </thead>
          <tbody>
            <tr>
              <td data-label="Innings">{player.career.batting.innings}</td>
              <td data-label="Runs">{player.career.batting.runs}</td>
              <td data-label="Highest">{player.career.batting.highestScore}</td>
              <td data-label="Average">{player.career.batting.average}</td>
              <td data-label="Strike Rate">{player.career.batting.strikeRate}</td>
              <td data-label="4s">{player.career.batting.fours}</td>
              <td data-label="6s">{player.career.batting.sixes}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 data-reveal>Career Bowling Stats</h2>
      <div className="card" style={{ padding: 20 }}>
        <table className="career-table">
          <thead>
            <tr><th>Innings</th><th>Overs</th><th>Wickets</th><th>Average</th><th>Economy</th><th>Maidens</th></tr>
          </thead>
          <tbody>
            <tr>
              <td data-label="Innings">{player.career.bowling.innings}</td>
              <td data-label="Overs">{player.career.bowling.overs}</td>
              <td data-label="Wickets">{player.career.bowling.wickets}</td>
              <td data-label="Average">{player.career.bowling.average}</td>
              <td data-label="Economy">{player.career.bowling.economy}</td>
              <td data-label="Maidens">{player.career.bowling.maidens}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
