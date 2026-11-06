import { useEffect, useState } from 'react';
import { Users, CalendarDays, ClipboardList, Trophy, FileUp, LogOut, KeyRound } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, isLoggedIn } from '../api';
import { CountUp } from '../motion';
import AdminPlayers from '../components/AdminPlayers';
import AdminMatches from '../components/AdminMatches';
import AdminTournaments from '../components/AdminTournaments';
import AdminScorecard from '../components/AdminScorecard';
import AdminScorer from '../scorer/AdminScorer';
import AdminAccount from '../components/AdminAccount';

const TABS = ['Players', 'Matches', 'Scorer', 'Tournaments', 'Upload Scorecard', 'Account'];
const ICONS = { Players: Users, Matches: CalendarDays, Scorer: ClipboardList, Tournaments: Trophy, 'Upload Scorecard': FileUp, Account: KeyRound };
const slug = (t) => t.toLowerCase().replace(/ /g, '-');
const TabIcon = ({ name, ...rest }) => { const Icon = ICONS[name]; return <Icon aria-hidden="true" {...rest} />; };

// Username from the login token, for the greeting (display only; the server checks the token).
function adminName() {
  try {
    const token = localStorage.getItem('cc_token') || '';
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).username || 'admin';
  } catch {
    return 'admin';
  }
}

// Club at a glance: each tile counts up and opens its tab.
function Summary({ setTab }) {
  const [n, setN] = useState({});
  useEffect(() => {
    const put = (k) => (v) => setN((o) => ({ ...o, [k]: v }));
    api.getPlayers().then((p) => put('players')(p.length)).catch(() => {});
    api.getMatches().then((m) => {
      put('matches')(m.length);
      put('won')(m.filter((x) => x.result === 'Won').length);
    }).catch(() => {});
    api.getTournaments().then((t) => put('tournaments')(t.length)).catch(() => {});
    api.scorerList().then((l) => put('live')(l.length)).catch(() => {});
  }, []);
  const tiles = [
    ['Players', 'players', 'Squad players'],
    ['Matches', 'matches', n.matches != null ? `${n.won ?? 0} won` : 'Matches'],
    ['Tournaments', 'tournaments', 'Tournaments'],
    ['Scorer', 'live', 'Being scored'],
  ];
  return (
    <div className="admin-summary">
      {tiles.map(([tab, key, label], i) => (
        <button key={key} type="button" className={`admin-tile ${key === 'live' && n.live ? 'is-live' : ''}`}
          style={{ '--i': i }} onClick={() => setTab(tab)}>
          <span className="admin-tile-icon" aria-hidden="true"><TabIcon name={tab} size={20} /></span>
          <strong>{n[key] == null ? '–' : <CountUp value={n[key]} />}</strong>
          <span>{key === 'matches' ? 'Matches' : label}</span>
          {key === 'matches' && n.matches != null && <em>{label}</em>}
          {key === 'live' && n.live > 0 && <em className="admin-live-dot">live now</em>}
        </button>
      ))}
    </div>
  );
}

export default function Admin() {
  // The open tab lives in the URL (/admin?tab=scorer), so a refresh stays on it.
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((t) => slug(t) === params.get('tab')) || TABS[0];
  const setTab = (t) => setParams({ tab: slug(t) });
  // While a match is being set up / scored / viewed, the scorer gets the whole screen
  // (it has its own Exit button); on a phone that keeps the run keys in reach.
  const focus = tab === 'Scorer' && ['new', 'live', 'view'].some((k) => params.get(k));

  // On a phone the tab strip scrolls sideways: bring the open tab into view after a refresh.
  useEffect(() => {
    // scroll only the strip sideways (scrollIntoView would also move the page under the sticky bar)
    const strip = document.querySelector('.admin-tabs');
    const active = strip?.querySelector('.stat-tab.active');
    if (strip && active) strip.scrollLeft = active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2;
  }, [tab, focus]);
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
      {!focus && (
      <>
      <div className="admin-head">
        <div>
          <h2>Admin Panel</h2>
          <p className="admin-hello">Welcome back, <strong>{adminName()}</strong></p>
        </div>
        <button className="btn btn-secondary btn-sm btn-icon" onClick={logout}><LogOut size={15} aria-hidden="true" /> Log out</button>
      </div>
      <Summary setTab={setTab} />
      <div className="stat-tabs admin-tabs">
        {TABS.map((t) => (
          <button key={t} type="button" className={`stat-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            <TabIcon name={t} size={16} className="admin-tab-icon" />{t}
          </button>
        ))}
      </div>
      </>
      )}
      {/* keyed by tab only (not focus), so the scorer keeps its state when a match opens */}
      <div className="admin-pane" key={tab}>
        {tab === 'Players' && <AdminPlayers />}
        {tab === 'Matches' && <AdminMatches />}
        {tab === 'Scorer' && <AdminScorer />}
        {tab === 'Tournaments' && <AdminTournaments />}
        {tab === 'Upload Scorecard' && <AdminScorecard />}
        {tab === 'Account' && <AdminAccount />}
      </div>
    </div>
  );
}
