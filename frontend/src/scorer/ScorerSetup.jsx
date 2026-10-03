import { useEffect, useState } from 'react';
import { api } from '../api';
import { FORMATS, defaultConfig, createMatch, newPid } from './engine';

const today = () => new Date().toISOString().slice(0, 10);
const blankTeam = () => ({ name: '', players: [] });

function TeamPicker({ label, team, setTeam, squad, takenIds, isOurs, onMakeOurs }) {
  const [guest, setGuest] = useState('');
  const free = squad.filter((p) => !takenIds.has(p.id));

  function addSquad(id) {
    const p = squad.find((x) => String(x.id) === String(id));
    if (!p) return;
    setTeam({ ...team, players: [...team.players, { pid: newPid('p'), playerId: p.id, name: p.name }] });
  }
  function addGuest() {
    const name = guest.trim();
    if (!name) return;
    setTeam({ ...team, players: [...team.players, { pid: newPid('g'), playerId: null, name }] });
    setGuest('');
  }
  function move(i, d) {
    const arr = [...team.players];
    const j = i + d;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setTeam({ ...team, players: arr });
  }
  const remove = (i) => setTeam({ ...team, players: team.players.filter((_, k) => k !== i) });

  return (
    <div className="card sc-panel">
      <h3>{label} {isOurs && <span className="badge badge-won" style={{ marginLeft: 8 }}>My team</span>}</h3>
      {!isOurs && <button type="button" className="btn btn-secondary btn-sm" style={{ marginBottom: 10 }} onClick={onMakeOurs}>Make this my team</button>}
      <div className="form-group">
        <label>Team name</label>
        <input value={team.name} onChange={(e) => setTeam({ ...team, name: e.target.value })} placeholder="e.g. Asad" />
      </div>
      <div className="form-group">
        <label>Players in batting order ({team.players.length})</label>
        {team.players.length === 0 && <div className="sc-small">No players yet. Add from the squad or type a guest name.</div>}
        <ol className="sc-order">
          {team.players.map((p, i) => (
            <li key={p.pid}>
              <span>{p.name}{!p.playerId && <em> (guest)</em>}</span>
              <span className="sc-order-btns">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => move(i, 1)} disabled={i === team.players.length - 1}>↓</button>
                <button type="button" className="btn btn-danger btn-sm" onClick={() => remove(i)}>✕</button>
              </span>
            </li>
          ))}
        </ol>
      </div>
      <div className="form-group">
        <select value="" onChange={(e) => addSquad(e.target.value)}>
          <option value="">+ Add squad player...</option>
          {free.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className="form-group sc-inline">
        <input value={guest} onChange={(e) => setGuest(e.target.value)} placeholder="Guest / opponent player name"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addGuest(); } }} />
        <button type="button" className="btn btn-secondary" onClick={addGuest}>Add</button>
      </div>
      <div className="sc-small">{isOurs ? "This is YOUR team: squad players here get career stats after the match." : "Opponent team: players here appear on the scorecard only, no career stats."}</div>
    </div>
  );
}

export default function ScorerSetup({ onStart, onCancel }) {
  const [format, setFormat] = useState('T20');
  const [cfg, setCfg] = useState(defaultConfig('T20'));
  const [teams, setTeams] = useState([blankTeam(), blankTeam()]);
  const [tossWinner, setTossWinner] = useState(0);
  const [elected, setElected] = useState('bat');
  const [date, setDate] = useState(today());
  const [venue, setVenue] = useState('');
  const [tournamentId, setTournamentId] = useState('');
  const [ourSide, setOurSide] = useState(0);
  const [squad, setSquad] = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getPlayers().then(setSquad).catch(() => {});
    api.getTournaments().then(setTournaments).catch(() => {});
  }, []);

  function pickFormat(f) {
    setFormat(f);
    setCfg(defaultConfig(f));
  }
  const setNum = (key, v, allowEmpty) => setCfg({ ...cfg, [key]: v === '' ? (allowEmpty ? null : 0) : Number(v) });
  const takenIds = new Set(teams.flatMap((t) => t.players.map((p) => p.playerId).filter(Boolean)));
  const setTeam = (i) => (t) => setTeams(teams.map((x, k) => (k === i ? t : x)));
  const two = cfg.inningsPerSide === 2;

  function start(e) {
    e.preventDefault();
    const names = teams.map((t) => t.name.trim());
    if (!names[0] || !names[1]) return setError('Give both teams a name.');
    if (names[0].toLowerCase() === names[1].toLowerCase()) return setError('The two teams need different names.');
    if (teams.some((t) => t.players.length < 2)) return setError('Each team needs at least 2 players.');
    if (!teams[Number(ourSide)].players.some((p) => p.playerId)) return setError('Your team (' + names[Number(ourSide)] + ') has no squad player, so no career stats would be saved. Add at least one squad player to your team, or switch "My team".');
    if (format !== 'Test' && !(cfg.overs > 0)) return setError('Enter the number of overs per innings.');
    const match = createMatch({
      config: { ...cfg, format },
      teams: teams.map((t, i) => ({ name: names[i], players: t.players })),
      toss: { winner: Number(tossWinner), elected },
      meta: { date, venue: venue.trim(), tournamentId: tournamentId || null, ourSide: Number(ourSide) },
    });
    onStart(match);
  }

  return (
    <form onSubmit={start}>
      <div className="card sc-panel">
        <h3>Match format</h3>
        <div className="stat-tabs">
          {FORMATS.map((f) => (
            <button key={f} type="button" className={`stat-tab ${format === f ? 'active' : ''}`} onClick={() => pickFormat(f)}>{f}</button>
          ))}
        </div>
        <div className="form-row">
          {format !== 'Test' && (
            <div className="form-group">
              <label>Overs per innings</label>
              <input type="number" min="1" value={cfg.overs ?? ''} onChange={(e) => setNum('overs', e.target.value, true)} />
            </div>
          )}
          {format !== 'Test' && (
            <div className="form-group">
              <label>Max overs per bowler (blank = no limit)</label>
              <input type="number" min="1" value={cfg.maxBowlerOvers ?? ''} onChange={(e) => setNum('maxBowlerOvers', e.target.value, true)} />
            </div>
          )}
          {format === 'Custom' && (
            <div className="form-group">
              <label>Innings per side</label>
              <select value={cfg.inningsPerSide} onChange={(e) => setCfg({ ...cfg, inningsPerSide: Number(e.target.value), followOnLead: Number(e.target.value) === 2 ? cfg.followOnLead : 0 })}>
                <option value={1}>1 innings each</option>
                <option value={2}>2 innings each</option>
              </select>
            </div>
          )}
          {two && (
            <div className="form-group">
              <label>Follow-on lead</label>
              <select value={cfg.followOnLead} onChange={(e) => setNum('followOnLead', e.target.value)}>
                <option value={200}>200 runs (5-day Test)</option>
                <option value={150}>150 runs (3 / 4-day)</option>
                <option value={100}>100 runs (2-day)</option>
                <option value={0}>No follow-on</option>
              </select>
            </div>
          )}
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Runs for a wide</label>
            <input type="number" min="0" value={cfg.wideRuns} onChange={(e) => setNum('wideRuns', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Runs for a no-ball</label>
            <input type="number" min="0" value={cfg.noBallRuns} onChange={(e) => setNum('noBallRuns', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Free hit after no-ball</label>
            <select value={cfg.freeHit ? 'yes' : 'no'} onChange={(e) => setCfg({ ...cfg, freeHit: e.target.value === 'yes' })}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
        </div>
        {format === 'Test' && <div className="review-note">Test: 2 innings per side, no over limit, declarations, lead / trail, follow-on, innings victories and draws.</div>}
      </div>

      <div className="sc-two">
        <TeamPicker label="Team A" team={teams[0]} setTeam={setTeam(0)} squad={squad} takenIds={takenIds} isOurs={Number(ourSide) === 0} onMakeOurs={() => setOurSide(0)} />
        <TeamPicker label="Team B" team={teams[1]} setTeam={setTeam(1)} squad={squad} takenIds={takenIds} isOurs={Number(ourSide) === 1} onMakeOurs={() => setOurSide(1)} />
      </div>

      <div className="card sc-panel">
        <h3>Toss and match details</h3>
        <div className="form-row">
          <div className="form-group">
            <label>Toss won by</label>
            <select value={tossWinner} onChange={(e) => setTossWinner(e.target.value)}>
              <option value={0}>{teams[0].name || 'Team A'}</option>
              <option value={1}>{teams[1].name || 'Team B'}</option>
            </select>
          </div>
          <div className="form-group">
            <label>Elected to</label>
            <select value={elected} onChange={(e) => setElected(e.target.value)}>
              <option value="bat">Bat first</option>
              <option value="bowl">Bowl first</option>
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="form-group"><label>Venue</label><input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Optional" /></div>
          <div className="form-group">
            <label>Tournament</label>
            <select value={tournamentId} onChange={(e) => setTournamentId(e.target.value)}>
              <option value="">Friendly / none</option>
              {tournaments.map((t) => <option key={t.id} value={t.id}>{t.name}{t.year ? ` (${t.year})` : ''}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="review-note" style={{ marginBottom: 12 }}>My team: <strong>{teams[Number(ourSide)].name || (Number(ourSide) === 0 ? 'Team A' : 'Team B')}</strong>. After the match, win/loss and career stats are saved for this team only.</div>
      {error && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-primary" type="submit">Start scoring</button>
        <button className="btn btn-secondary" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
