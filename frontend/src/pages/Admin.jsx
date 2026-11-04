import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { isLoggedIn } from '../api';
import AdminPlayers from '../components/AdminPlayers';
import AdminMatches from '../components/AdminMatches';
import AdminTournaments from '../components/AdminTournaments';
import AdminScorecard from '../components/AdminScorecard';
import AdminScorer from '../scorer/AdminScorer';

const TABS = ['Players', 'Matches', 'Scorer', 'Tournaments', 'Upload Scorecard'];
const slug = (t) => t.toLowerCase().replace(/ /g, '-');

export default function Admin() {
  // The open tab lives in the URL (/admin?tab=scorer), so a refresh stays on it.
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((t) => slug(t) === params.get('tab')) || TABS[0];
  const setTab = (t) => setParams({ tab: slug(t) });
  const navigate = useNavigate();

  useEffect(() => {
    // A token that is there but no longer valid means the login ran out.
    if (!isLoggedIn()) navigate(localStorage.getItem('cc_token') ? '/login?expired=1' : '/login');
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
      {tab === 'Scorer' && <AdminScorer />}
      {tab === 'Tournaments' && <AdminTournaments />}
      {tab === 'Upload Scorecard' && <AdminScorecard />}
    </div>
  );
}
