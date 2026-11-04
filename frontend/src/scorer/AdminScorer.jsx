import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { matchTitle } from './engine';
import { historyItem, teamRecords, playerStats } from './stats';
import ScorerSetup from './ScorerSetup';
import ScorerLive from './ScorerLive';
import ScorecardView from './ScorecardView';
import Analysis from './Analysis';
import './scorer.css';

const eventCount = (m) => (m?.innings || []).reduce((n, i) => n + i.events.length, 0) + (m?.innings?.length || 0);
const num = (v, d = 2) => (v === null || v === undefined ? '-' : v.toFixed(d));

// A saved match, read-only: Scoreboard and Analysis (KDM "match details").
function MatchView({ row, onBack }) {
  const [tab, setTab] = useState('card');
  const m = row.state;
  return (
    <div>
      <div className="sc-topbar">
        <button className="btn btn-secondary btn-sm" onClick={onBack}>← Back</button>
        <strong>{matchTitle(m)}</strong>
        <div className="sc-topbtns">
          <button className={`btn btn-sm ${tab === 'card' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('card')}>Scoreboard</button>
          <button className={`btn btn-sm ${tab === 'analysis' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('analysis')}>Analysis</button>
        </div>
      </div>
      {tab === 'card' ? <ScorecardView match={m} /> : <Analysis match={m} />}
    </div>
  );
}

function History({ items, archived, setArchived, onOpen, onArchive, onDelete }) {
  return (
    <>
      <div className="sc-hist-bar">
        <label className="sc-check"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Show archived</label>
      </div>
      {items.length === 0 ? (
        <div className="empty-state">{archived ? 'No archived matches.' : 'No matches yet. Tap "+ New match" to start scoring.'}</div>
      ) : items.map((h) => (
        <div className="card sc-hist" key={h.id}>
          <button type="button" className="sc-hist-main" onClick={() => onOpen(h)}>
            <div className="sc-hist-top">
              <span className="sc-small">{h.date}{h.venue ? ` · ${h.venue}` : ''}</span>
              <span className={`sc-badge ${h.saved ? 'saved' : h.done ? 'over' : 'live'}`}>{h.saved ? 'Saved' : h.done ? 'Not saved' : 'Live'}</span>
              <span className="role-tag">{h.format}</span>
            </div>
            {h.scores.map((t) => (
              <div className="sc-hist-team" key={t.name}><span>{t.name}</span><strong>{t.score}</strong></div>
            ))}
            <div className="sc-hist-result">{h.result}</div>
          </button>
          <div className="sc-hist-actions">
            <button className="btn btn-primary btn-sm" onClick={() => onOpen(h)}>{h.saved ? 'View' : 'Resume'}</button>
            <button className="btn btn-secondary btn-sm" onClick={() => onArchive(h, !archived)}>{archived ? 'Unarchive' : 'Archive'}</button>
            {!h.saved && <button className="btn btn-danger btn-sm" onClick={() => onDelete(h)}>Delete</button>}
          </div>
        </div>
      ))}
    </>
  );
}

function Teams({ teams, onPick }) {
  if (!teams.length) return <div className="empty-state">Teams appear here once a match is over.</div>;
  return (
    <div className="card sc-scroll">
      <table className="sc-sb sc-stats">
        <thead><tr><th>Team</th><th>M</th><th>W</th><th>L</th><th>T</th><th>D</th><th>NR</th><th>Win %</th></tr></thead>
        <tbody>
          {teams.map((t) => (
            <tr key={t.key} className="sc-clickrow" onClick={() => onPick(t)} title="See this team's players">
              <td><strong>{t.name}</strong></td><td>{t.m}</td><td>{t.w}</td><td>{t.l}</td><td>{t.t}</td><td>{t.d}</td><td>{t.nr}</td><td>{t.pct.toFixed(0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const STAT_TABS = [['bat', 'Batting'], ['bowl', 'Bowling'], ['field', 'Fielding']];

function Players({ players, team, setTeam }) {
  const [tab, setTab] = useState('bat');
  const [q, setQ] = useState('');
  const teams = [...new Map(players.map((p) => [p.teamKey, { key: p.teamKey, name: p.team }])).values()]
    .sort((a, b) => a.name.localeCompare(b.name));
  const list = players
    .filter((p) => !team || p.teamKey === team)
    .filter((p) => !q || p.name.toLowerCase().includes(q.trim().toLowerCase()))
    .filter((p) => (tab === 'bat' ? p.bat.inns : tab === 'bowl' ? p.bowl.inns : p.field.total))
    .sort((a, b) => (tab === 'bat' ? b.bat.runs - a.bat.runs || a.bat.balls - b.bat.balls
      : tab === 'bowl' ? b.bowl.wk - a.bowl.wk || a.bowl.runs - b.bowl.runs
        : b.field.total - a.field.total));
  const who = (p) => <td><strong>{p.name}</strong><div className="sc-how">{p.team}{p.squad ? ' · squad' : ''}</div></td>;

  return (
    <>
      <div className="sc-atabs sc-stattabs">
        {STAT_TABS.map(([k, l]) => <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      <div className="sc-filters">
        <input placeholder="Search player" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={team} onChange={(e) => setTeam(e.target.value)}>
          <option value="">All teams</option>
          {teams.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
        </select>
      </div>
      {list.length === 0 ? <div className="empty-state">No {tab === 'bat' ? 'batting' : tab === 'bowl' ? 'bowling' : 'fielding'} records yet.</div> : (
        <div className="card sc-scroll">
          {tab === 'bat' && (
            <table className="sc-sb sc-stats">
              <thead><tr><th>Player</th><th>M</th><th>Inn</th><th>NO</th><th>Runs</th><th>HS</th><th>Avg</th><th>SR</th><th>30s</th><th>50s</th><th>100s</th><th>4s</th><th>6s</th><th>Ducks</th></tr></thead>
              <tbody>
                {list.map((p) => { const b = p.bat; return (
                  <tr key={p.key}>{who(p)}<td>{p.matches}</td><td>{b.inns}</td><td>{b.no}</td><td><strong>{b.runs}</strong></td><td>{b.hsText}</td><td>{num(b.avg)}</td><td>{b.sr.toFixed(2)}</td><td>{b.thirties}</td><td>{b.fifties}</td><td>{b.hundreds}</td><td>{b.fours}</td><td>{b.sixes}</td><td>{b.ducks}</td></tr>
                ); })}
              </tbody>
            </table>
          )}
          {tab === 'bowl' && (
            <table className="sc-sb sc-stats">
              <thead><tr><th>Player</th><th>M</th><th>Inn</th><th>Overs</th><th>Mdns</th><th>Runs</th><th>Wkts</th><th>Best</th><th>Avg</th><th>Econ</th><th>SR</th><th>3W</th><th>5W</th><th>Dots</th><th>Wd</th><th>Nb</th></tr></thead>
              <tbody>
                {list.map((p) => { const b = p.bowl; return (
                  <tr key={p.key}>{who(p)}<td>{p.matches}</td><td>{b.inns}</td><td>{b.overs}</td><td>{b.maidens}</td><td>{b.runs}</td><td><strong>{b.wk}</strong></td><td>{b.bestText}</td><td>{num(b.avg)}</td><td>{b.econ.toFixed(2)}</td><td>{num(b.sr, 1)}</td><td>{b.three}</td><td>{b.five}</td><td>{b.dots}</td><td>{b.wd}</td><td>{b.nb}</td></tr>
                ); })}
              </tbody>
            </table>
          )}
          {tab === 'field' && (
            <table className="sc-sb sc-stats">
              <thead><tr><th>Player</th><th>M</th><th>Catches</th><th>Stumpings</th><th>Run outs</th><th>Total</th></tr></thead>
              <tbody>
                {list.map((p) => { const f = p.field; return (
                  <tr key={p.key}>{who(p)}<td>{p.matches}</td><td>{f.catches}</td><td>{f.stumpings}</td><td>{f.runOuts}</td><td><strong>{f.total}</strong></td></tr>
                ); })}
              </tbody>
            </table>
          )}
        </div>
      )}
      <p className="sc-small">Worked out from the matches scored here (archived matches left out). Club career stats on player profiles still count only saved matches of our squad.</p>
    </>
  );
}

const HOME_TABS = [['history', 'History'], ['teams', 'Teams'], ['players', 'Players']];

export default function AdminScorer() {
  // Which screen is open lives in the URL next to the admin tab, so a refresh (or the phone's
  // back button) lands on the same place: sc = home tab, new = setup, live = match being scored,
  // view = saved match.
  const [params, setParams] = useSearchParams();
  const go = (patch, replace = false) => setParams((prev) => {
    const next = new URLSearchParams(prev);
    Object.entries(patch).forEach(([k, v]) => (v === null || v === undefined ? next.delete(k) : next.set(k, String(v))));
    return next;
  }, { replace });
  const tab = HOME_TABS.some(([k]) => k === params.get('sc')) ? params.get('sc') : 'history';
  const setTab = (k) => go({ sc: k }, true);
  const isNew = params.get('new') === '1';
  const liveId = params.get('live');
  const viewId = params.get('view');
  const home = !isNew && !liveId && !viewId;
  const [rows, setRows] = useState([]);
  const [archivedRows, setArchivedRows] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [teamFilter, setTeamFilter] = useState('');
  const [current, setCurrent] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    api.scorerHistory().then(setRows).catch((e) => setError(e.message));
    if (showArchived) api.scorerHistory(true).then(setArchivedRows).catch((e) => setError(e.message));
  };
  useEffect(() => { if (home) load(); }, [home, showArchived]);

  // Opening a URL with live= / view= (a refresh) loads that match.
  useEffect(() => {
    if (liveId && String(current?.id) !== liveId) resume(liveId);
  }, [liveId]);
  useEffect(() => {
    if (!viewId || String(viewing?.id) === viewId) return;
    api.scorerGet(viewId)
      .then((r) => setViewing({ id: Number(viewId), state: r.state }))
      .catch((e) => { setError(e.message); go({ view: null }, true); });
  }, [viewId]);

  // A match whose state is broken should not take the whole screen down.
  const safe = (fn, list) => list.flatMap((r) => { try { return [fn(r)]; } catch { return []; } });
  const items = useMemo(() => safe(historyItem, showArchived ? archivedRows : rows), [rows, archivedRows, showArchived]);
  const good = useMemo(() => safe((r) => (historyItem(r), r), rows), [rows]);
  const teams = useMemo(() => teamRecords(good), [good]);
  const players = useMemo(() => playerStats(good), [good]);

  // Throws so the setup screen can show the problem (and stay filled in).
  async function start(match) {
    setError('');
    const r = await api.scorerCreate({ title: matchTitle(match), format: match.config.format, state: match });
    setCurrent({ id: r.id, match });
    go({ new: null, adv: null, live: r.id }, true);
  }

  async function resume(id) {
    setError('');
    try {
      const r = await api.scorerGet(id);
      let match = r.state;
      try {
        // If the phone was offline for a while, the local backup can be ahead of the server copy.
        const local = JSON.parse(localStorage.getItem(`cc_scorer_${id}`) || 'null');
        if (local && eventCount(local) > eventCount(match)) match = local;
      } catch { /* ignore a broken backup */ }
      setCurrent({ id: Number(id), match });
    } catch (e) {
      setError(e.message);
      go({ live: null }, true);
    }
  }

  function open(h) {
    if (h.saved) { setViewing(h.row); go({ view: h.id }); } else go({ live: h.id });
  }

  async function archive(h, on) {
    setError('');
    try {
      await api.scorerArchive(h.id, on);
      load();
      if (!on) api.scorerHistory(true).then(setArchivedRows).catch(() => {});
    } catch (e) {
      setError(e.message);
    }
  }

  async function discard(h) {
    if (!confirm(`Delete ${h.title}? It was never saved, so nothing has been added to player stats.`)) return;
    await api.scorerDelete(h.id).catch((e) => setError(e.message));
    localStorage.removeItem(`cc_scorer_${h.id}`);
    load();
  }

  function exit() {
    setCurrent(null);
    setViewing(null);
    go({ new: null, adv: null, live: null, view: null }, true);
  }

  const loading = <div className="empty-state">Loading match...</div>;
  if (isNew) return <ScorerSetup onStart={start} onCancel={exit} />;
  if (liveId) {
    return current && String(current.id) === liveId
      ? <ScorerLive key={current.id} initial={current.match} serverId={current.id} onExit={exit} />
      : (error ? <div className="error-text">{error}</div> : loading);
  }
  if (viewId) return viewing && String(viewing.id) === viewId ? <MatchView row={viewing} onBack={exit} /> : loading;

  return (
    <div>
      <div className="squad-toolbar">
        <h3>Scorer</h3>
        <button className="btn btn-primary" onClick={() => go({ new: 1 })}>+ New match</button>
      </div>
      <div className="sc-atabs sc-hometabs">
        {HOME_TABS.map(([k, l]) => <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {error && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}
      {tab === 'history' && (
        <History items={items} archived={showArchived} setArchived={setShowArchived} onOpen={open} onArchive={archive} onDelete={discard} />
      )}
      {tab === 'teams' && <Teams teams={teams} onPick={(t) => { setTeamFilter(t.key); setTab('players'); }} />}
      {tab === 'players' && <Players players={players} team={teamFilter} setTeam={setTeamFilter} />}
    </div>
  );
}
