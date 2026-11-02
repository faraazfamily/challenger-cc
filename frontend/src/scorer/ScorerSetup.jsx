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

// Overs typed on the quick-start screen pick the format label and the usual bowler quota.
const formatForOvers = (o) => ({ 10: 'T10', 20: 'T20', 50: 'ODI' }[o] || 'Custom');

function Radio({ name, value, options, onChange }) {
  return (
    <div className="sc-radios">
      {options.map(([v, label]) => (
        <label key={v} className="sc-radio">
          <input type="radio" name={name} checked={String(value) === String(v)} onChange={() => onChange(v)} /> {label}
        </label>
      ))}
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
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getPlayers().then(setSquad).catch(() => {});
    api.getTournaments().then(setTournaments).catch(() => {});
  }, []);

  function pickFormat(f) {
    setFormat(f);
    setCfg({ ...defaultConfig(f), playersPerSide: cfg.playersPerSide });
  }
  function setOvers(v) {
    const o = v === '' ? null : Number(v);
    if (o) setFormat(formatForOvers(o));
    setCfg({ ...cfg, overs: o, maxBowlerOvers: o ? Math.ceil(o / 5) : cfg.maxBowlerOvers });
  }
  const setNum = (key, v, allowEmpty) => setCfg({ ...cfg, [key]: v === '' ? (allowEmpty ? null : 0) : Number(v) });
  const takenIds = new Set(teams.flatMap((t) => t.players.map((p) => p.playerId).filter(Boolean)));
  const setTeam = (i) => (t) => setTeams(teams.map((x, k) => (k === i ? t : x)));
  const setName = (i, name) => setTeams(teams.map((x, k) => (k === i ? { ...x, name } : x)));
  const two = cfg.inningsPerSide === 2;
  const label = (i) => teams[i].name.trim() || (i === 0 ? 'Host Team' : 'Visitor Team');

  function start(e) {
    e.preventDefault();
    const names = teams.map((t) => t.name.trim());
    if (!names[0] || !names[1]) return setError('Give both teams a name.');
    if (names[0].toLowerCase() === names[1].toLowerCase()) return setError('The two teams need different names.');
    if (format !== 'Test' && !(cfg.overs > 0)) return setError('Enter the number of overs.');
    if (!(cfg.playersPerSide >= 2)) return setError('Players per team must be at least 2.');
    const match = createMatch({
      config: { ...cfg, format },
      teams: teams.map((t, i) => ({ name: names[i], players: t.players })),
      toss: { winner: Number(tossWinner), elected },
      meta: { date, venue: venue.trim(), tournamentId: tournamentId || null, ourSide: Number(ourSide) },
    });
    onStart(match);
  }

  return (
    <form onSubmit={start} className="sc-quick">
      <div className="sc-qlabel">Teams</div>
      <div className="card sc-panel">
        <div className="form-group"><input value={teams[0].name} onChange={(e) => setName(0, e.target.value)} placeholder="Host Team" /></div>
        <div className="form-group" style={{ marginBottom: 0 }}><input value={teams[1].name} onChange={(e) => setName(1, e.target.value)} placeholder="Visitor Team" /></div>
      </div>

      <div className="sc-qlabel">Toss won by?</div>
      <div className="card sc-panel"><Radio name="toss" value={tossWinner} onChange={setTossWinner} options={[[0, label(0)], [1, label(1)]]} /></div>

      <div className="sc-qlabel">Opted to?</div>
      <div className="card sc-panel"><Radio name="elected" value={elected} onChange={setElected} options={[['bat', 'Bat'], ['bowl', 'Bowl']]} /></div>

      {format !== 'Test' && (
        <>
          <div className="sc-qlabel">Overs?</div>
          <div className="card sc-panel"><input type="number" min="1" value={cfg.overs ?? ''} onChange={(e) => setOvers(e.target.value)} placeholder="20" /></div>
        </>
      )}

      <div className="sc-qlabel">Which one is your team? <span className="sc-small">(career stats are saved for this team only)</span></div>
      <div className="card sc-panel"><Radio name="ours" value={ourSide} onChange={(v) => setOurSide(Number(v))} options={[[0, label(0)], [1, label(1)]]} /></div>

      {error && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="sc-qactions">
        <button type="button" className="sc-linkbtn" onClick={() => setAdvanced(!advanced)}>{advanced ? 'Hide advanced settings' : 'Advanced settings'}</button>
        <button className="btn btn-primary" type="submit">Start match</button>
      </div>
      <div className="sc-small" style={{ marginBottom: 16 }}>Players are added while scoring: just type their names when asked. <button type="button" className="sc-linkbtn" onClick={onCancel}>Cancel</button></div>

      {advanced && (
      <>
      <div className="card sc-panel">
        <h3>Match format</h3>
        <div className="stat-tabs">
          {FORMATS.map((f) => (
            <button key={f} type="button" className={`stat-tab ${format === f ? 'active' : ''}`} onClick={() => pickFormat(f)}>{f}</button>
          ))}
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Players per team</label>
            <input type="number" min="2" value={cfg.playersPerSide ?? ''} onChange={(e) => setNum('playersPerSide', e.target.value, true)} />
          </div>
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

      <div className="card sc-panel">
        <h3>Match details</h3>
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

      <div className="review-note">Optional: pick players before the match (batting order). You can skip this and add players while scoring.</div>
      <div className="sc-two">
        <TeamPicker label={label(0)} team={teams[0]} setTeam={setTeam(0)} squad={squad} takenIds={takenIds} isOurs={Number(ourSide) === 0} onMakeOurs={() => setOurSide(0)} />
        <TeamPicker label={label(1)} team={teams[1]} setTeam={setTeam(1)} squad={squad} takenIds={takenIds} isOurs={Number(ourSide) === 1} onMakeOurs={() => setOurSide(1)} />
      </div>
      </>
      )}
    </form>
  );
}
