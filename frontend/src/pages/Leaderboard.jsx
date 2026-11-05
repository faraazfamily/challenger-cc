import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Target, Zap, ShieldHalf } from 'lucide-react';
import { api, cached } from '../api';
import { SkeletonRows, EmptyState } from '../components/Feedback';
import { PlayerAvatar } from '../components/PlayerCard';

const TABS = [
  { key: 'mostRuns', label: 'Most Runs', icon: Trophy, cols: [['runs', 'Runs'], ['innings', 'Innings']] },
  { key: 'mostWickets', label: 'Most Wickets', icon: Target, cols: [['wickets', 'Wickets'], ['innings', 'Innings']] },
  { key: 'bestStrikeRate', label: 'Best Strike Rate', icon: Zap, cols: [['strike_rate', 'SR'], ['runs', 'Runs']] },
  { key: 'bestEconomy', label: 'Best Economy', icon: ShieldHalf, cols: [['economy', 'Economy'], ['overs', 'Overs']] },
];

// Top three on a podium: 2nd, 1st (raised), 3rd. Photos come from the cached squad list.
function Podium({ rows, col, label }) {
  const squad = cached('/api/players') || [];
  const withPhoto = (r) => ({ ...squad.find((p) => p.id === r.id), ...r });
  const order = [rows[1], rows[0], rows[2]];
  return (
    <div className="podium">
      {order.map((r, k) => {
        if (!r) return <div key={k} className="podium-spot empty" />;
        const place = k === 1 ? 1 : k === 0 ? 2 : 3;
        return (
          <Link key={r.id} to={`/players/${r.id}`} className={`podium-spot p${place}`} style={{ '--k': k }}>
            <span className={`lb-rank r${place}`}>{place}</span>
            <PlayerAvatar player={withPhoto(r)} className="podium-avatar" size={200} />
            <strong>{r.name}</strong>
            <span className="podium-value">{r[col]}</span>
            <span className="podium-label">{label}</span>
            <span className="podium-block" aria-hidden="true" />
          </Link>
        );
      })}
    </div>
  );
}

export default function Leaderboard() {
  const [data, setData] = useState(() => cached('/api/stats/leaderboard'));
  const [tab, setTab] = useState('mostRuns');

  useEffect(() => { api.getLeaderboard().then(setData).catch(() => { }); }, []);

  const activeTab = TABS.find((t) => t.key === tab);
  const rows = data?.[tab] || [];

  return (
    <div className="container section">
      <h2 data-reveal>Leaderboard</h2>
      <div className="stat-tabs">
        {TABS.map((t) => (
          <button type="button" key={t.key} className={`stat-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            <t.icon size={16} aria-hidden="true" />{t.label}
          </button>
        ))}
      </div>
      {!data ? <><div className="podium-skel" aria-hidden="true" /><SkeletonRows /></> : rows.length === 0 ? (
        <EmptyState icon={Trophy} title="No numbers yet">Add some match scorecards and the leaders show up here.</EmptyState>
      ) : (
        <>
        <Podium key={tab} rows={rows} col={activeTab.cols[0][0]} label={activeTab.cols[0][1]} />
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
                // keyed by tab, so switching tabs re-plays the row reveal
                <tr key={`${tab}-${r.id}`} data-reveal className={`lb-row ${i < 3 ? 'lb-top' : ''}`}>
                  <td><span className={`lb-rank r${i + 1}`}>{i + 1}</span></td>
                  <td><Link to={`/players/${r.id}`}>{r.name}</Link></td>
                  {activeTab.cols.map(([key]) => <td key={key}>{r[key]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}
