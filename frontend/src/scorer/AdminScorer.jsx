import { useEffect, useState } from 'react';
import { api } from '../api';
import { matchTitle } from './engine';
import ScorerSetup from './ScorerSetup';
import ScorerLive from './ScorerLive';
import './scorer.css';

const eventCount = (m) => (m?.innings || []).reduce((n, i) => n + i.events.length, 0) + (m?.innings?.length || 0);

export default function AdminScorer() {
  const [view, setView] = useState('home');
  const [list, setList] = useState([]);
  const [current, setCurrent] = useState(null);
  const [error, setError] = useState('');

  const load = () => api.scorerList().then(setList).catch(() => {});
  useEffect(() => { load(); }, []);

  async function start(match) {
    setError('');
    try {
      const r = await api.scorerCreate({ title: matchTitle(match), format: match.config.format, state: match });
      setCurrent({ id: r.id, match });
      setView('live');
    } catch (e) {
      setError(e.message);
    }
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
      setCurrent({ id, match });
      setView('live');
    } catch (e) {
      setError(e.message);
    }
  }

  async function discard(id) {
    if (!confirm('Delete this unfinished match? Nothing has been added to player stats yet.')) return;
    await api.scorerDelete(id).catch((e) => setError(e.message));
    localStorage.removeItem(`cc_scorer_${id}`);
    load();
  }

  function exit() {
    setView('home');
    setCurrent(null);
    load();
  }

  if (view === 'setup') return <ScorerSetup onStart={start} onCancel={() => setView('home')} />;
  if (view === 'live' && current) return <ScorerLive key={current.id} initial={current.match} serverId={current.id} onExit={exit} />;

  return (
    <div>
      <div className="review-note">
        Score a match ball by ball: T10, T20, ODI, Test (2 innings, lead, follow-on, declaration) or Custom.
        When it ends, one tap saves the match, every player's stats and the scorecard PDF.
      </div>
      <div className="squad-toolbar">
        <h3>Matches being scored</h3>
        <button className="btn btn-primary" onClick={() => setView('setup')}>+ New match</button>
      </div>
      {error && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}
      {list.length === 0 ? (
        <div className="empty-state">No match in progress. Start a new one.</div>
      ) : (
        <div className="card squad-list">
          {list.map((m) => (
            <div className="squad-row" key={m.id}>
              <div className="squad-row-main">
                <strong>{m.title}</strong>
                <span className="role-tag">{m.format}</span>
                <span className="sc-small">updated {new Date(m.updated_at).toLocaleString()}</span>
              </div>
              <div className="squad-actions">
                <button className="btn btn-primary btn-sm" onClick={() => resume(m.id)}>Resume</button>
                <button className="btn btn-danger btn-sm" onClick={() => discard(m.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
