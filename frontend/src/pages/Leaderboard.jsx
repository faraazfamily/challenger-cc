import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

const TABS = [
  { key: 'mostRuns', label: 'Most Runs', cols: [['runs', 'Runs'], ['innings', 'Innings']] },
  { key: 'mostWickets', label: 'Most Wickets', cols: [['wickets', 'Wickets'], ['innings', 'Innings']] },
  { key: 'bestStrikeRate', label: 'Best Strike Rate', cols: [['strike_rate', 'SR'], ['runs', 'Runs']] },
  { key: 'bestEconomy', label: 'Best Economy', cols: [['economy', 'Economy'], ['overs', 'Overs']] },
];

export default function Leaderboard() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('mostRuns');

  useEffect(() => { api.getLeaderboard().then(setData).catch(() => { }); }, []);

  if (!data) return <div className="container section empty-state">Loading...</div>;

  const activeTab = TABS.find((t) => t.key === tab);
  const rows = data[tab] || [];

  return (
    <div className="container section">
      <h2>Leaderboard</h2>
      <div className="stat-tabs">
        {TABS.map((t) => (
          <div key={t.key} className={`stat-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</div>
        ))}
      </div>
      {rows.length === 0 ? (
        <div className="empty-state">Not enough data yet — add some match scorecards.</div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>#</th><th>Player</th>
                {activeTab.cols.map(([key, label]) => <th key={key}>{label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id}>
                  <td>{i + 1}</td>
                  <td><Link to={`/players/${r.id}`}>{r.name}</Link></td>
                  {activeTab.cols.map(([key]) => <td key={key}>{r[key]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
