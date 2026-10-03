import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isLoggedIn } from '../api';
import AdminPlayers from '../components/AdminPlayers';
import AdminMatches from '../components/AdminMatches';
import AdminTournaments from '../components/AdminTournaments';
import AdminScorecard from '../components/AdminScorecard';
import AdminLiveScorer from '../components/AdminLiveScorer';

const TABS = ['Players', 'Matches', 'Tournaments', 'Upload Scorecard', 'Live Scorer'];

export default function Admin() {
  const [tab, setTab] = useState('Players');
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoggedIn()) navigate('/login');
  }, [navigate]);

  function logout() {
    localStorage.removeItem('cc_token');
    navigate('/login');
  }

  return (
    <div className="container section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Admin Panel</h2>
        <button className="btn btn-secondary btn-sm" onClick={logout}>Log Out</button>
      </div>
      <div className="stat-tabs">
        {TABS.map((t) => (
          <button key={t} type="button" className={`stat-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      {tab === 'Players' && <AdminPlayers />}
      {tab === 'Matches' && <AdminMatches />}
      {tab === 'Tournaments' && <AdminTournaments />}
      {tab === 'Upload Scorecard' && <AdminScorecard />}
      {tab === 'Live Scorer' && <AdminLiveScorer />}
    </div>
  );
}