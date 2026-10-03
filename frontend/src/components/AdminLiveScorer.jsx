import { useEffect, useState } from 'react';
import { api } from '../api';

const FORMATS = [
  { value: 'T10', label: 'T10 (10 overs)', overs: 10 },
  { value: 'T20', label: 'T20 (20 overs)', overs: 20 },
  { value: 'ODI', label: 'ODI (50 overs)', overs: 50 },
  { value: 'TEST', label: 'Test Match (2 innings each)', overs: null },
  { value: 'CUSTOM', label: 'Custom overs', overs: null },
];

export default function AdminLiveScorer() {
  const [squad, setSquad] = useState([]);
  const [resumable, setResumable] = useState([]);
  const [step, setStep] = useState('setup'); // setup | toss | started
  const [error, setError] = useState('');

  const [format, setFormat] = useState('T20');
  const [customOvers, setCustomOvers] = useState(15);
  const [teamBName, setTeamBName] = useState('');
  const [venue, setVenue] = useState('');
  const [matchDate, setMatchDate] = useState(new Date().toISOString().slice(0, 10));
  const [ourPicked, setOurPicked] = useState([]); // player ids
  const [opponentNames, setOpponentNames] = useState([]);
  const [opponentInput, setOpponentInput] = useState('');

  const [liveMatch, setLiveMatch] = useState(null);
  const [tossWinner, setTossWinner] = useState('A');
  const [tossDecision, setTossDecision] = useState('Bat');

  useEffect(() => {
    api.getPlayers().then(setSquad).catch(() => {});
    api.getLiveMatches().then(setResumable).catch(() => {});
  }, []);

  function toggleOurPlayer(id) {
    setOurPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function addOpponent() {
    const name = opponentInput.trim();
    if (!name) return;
    setOpponentNames((prev) => [...prev, name]);
    setOpponentInput('');
  }

  function removeOpponent(i) {
    setOpponentNames((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    if (ourPicked.length < 2) return setError('Pick at least 2 players for The Challengers.');
    if (opponentNames.length < 2) return setError('Add at least 2 opponent players.');
    if (!teamBName.trim()) return setError('Opponent team name is required.');

    const overs = format === 'TEST' ? null : format === 'CUSTOM' ? Number(customOvers) : FORMATS.find((f) => f.value === format).overs;

    try {
      const res = await api.createLiveMatch({
        format,
        overs_per_innings: overs,
        team_b_name: teamBName.trim(),
        venue,
        match_date: matchDate,
        team_a_players: ourPicked.map((id) => {
          const p = squad.find((s) => s.id === id);
          return { player_id: id, display_name: p.name, is_captain: !!p.is_captain, is_keeper: !!p.is_wicketkeeper };
        }),
        team_b_players: opponentNames.map((name) => ({ display_name: name })),
      });
      const full = await api.getLiveMatch(res.id);
      setLiveMatch(full);
      setStep('toss');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleToss(e) {
    e.preventDefault();
    setError('');
    try {
      await api.setLiveMatchToss(liveMatch.id, { toss_winner: tossWinner, toss_decision: tossDecision });
      const full = await api.getLiveMatch(liveMatch.id);
      setLiveMatch(full);
      setStep('started');
    } catch (err) {
      setError(err.message);
    }
  }

  async function resume(id) {
    const full = await api.getLiveMatch(id);
    setLiveMatch(full);
    setStep(full.status === 'setup' ? 'toss' : 'started');
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3>Live Scorer</h3>
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

      {resumable.length > 0 && step === 'setup' && (
        <div style={{ marginBottom: 20 }}>
          <h4>Resume a match</h4>
          {resumable.map((m) => (
            <div key={m.id} className="squad-row">
              <span>{m.format} vs {m.team_b_name} — {m.match_date} ({m.status})</span>
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => resume(m.id)}>Resume</button>
            </div>
          ))}
        </div>
      )}

      {step === 'setup' && (
        <form onSubmit={handleCreate}>
          <div className="form-row">
            <div className="form-group">
              <label>Format</label>
              <select value={format} onChange={(e) => setFormat(e.target.value)}>
                {FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            {format === 'CUSTOM' && (
              <div className="form-group">
                <label>Overs per innings</label>
                <input type="number" min="1" value={customOvers} onChange={(e) => setCustomOvers(e.target.value)} />
              </div>
            )}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Opponent team name</label>
              <input value={teamBName} onChange={(e) => setTeamBName(e.target.value)} placeholder="e.g. Royal Strikers" />
            </div>
            <div className="form-group">
              <label>Match date</label>
              <input type="date" value={matchDate} onChange={(e) => setMatchDate(e.target.value)} />
            </div>
          </div>

          <div className="form-group">
            <label>Venue (optional)</label>
            <input value={venue} onChange={(e) => setVenue(e.target.value)} />
          </div>

          <h4>The Challengers — playing XI</h4>
          <div className="squad-list">
            {squad.map((p) => (
              <label key={p.id} className="squad-row">
                <span>
                  <input type="checkbox" checked={ourPicked.includes(p.id)} onChange={() => toggleOurPlayer(p.id)} />
                  {' '}{p.name}
                </span>
              </label>
            ))}
          </div>

          <h4>{teamBName || 'Opponent'} — playing XI</h4>
          <div className="form-row">
            <div className="form-group">
              <input
                value={opponentInput}
                onChange={(e) => setOpponentInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOpponent(); } }}
                placeholder="Type a player name and press Add"
              />
            </div>
            <button type="button" className="btn btn-secondary" onClick={addOpponent}>Add</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {opponentNames.map((name, i) => (
              <span key={i} className="jersey-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {name}
                <button type="button" onClick={() => removeOpponent(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 700 }}>×</button>
              </span>
            ))}
          </div>

          <button className="btn btn-primary" type="submit">Create Match &amp; Go to Toss</button>
        </form>
      )}

      {step === 'toss' && liveMatch && (
        <form onSubmit={handleToss}>
          <h4>Toss — {liveMatch.format} vs {liveMatch.team_b_name}</h4>
          <div className="form-row">
            <div className="form-group">
              <label>Who won the toss?</label>
              <select value={tossWinner} onChange={(e) => setTossWinner(e.target.value)}>
                <option value="A">The Challengers</option>
                <option value="B">{liveMatch.team_b_name}</option>
              </select>
            </div>
            <div className="form-group">
              <label>Elected to</label>
              <select value={tossDecision} onChange={(e) => setTossDecision(e.target.value)}>
                <option value="Bat">Bat</option>
                <option value="Bowl">Bowl</option>
              </select>
            </div>
          </div>
          <button className="btn btn-primary" type="submit">Start Innings 1</button>
        </form>
      )}

      {step === 'started' && liveMatch && (
        <div>
          <h4>{liveMatch.format} vs {liveMatch.team_b_name}</h4>
          <p>Toss: {liveMatch.toss_winner === 'A' ? 'The Challengers' : liveMatch.team_b_name} elected to {liveMatch.toss_decision}.</p>
          {liveMatch.innings.map((inn) => (
            <p key={inn.id}>
              Innings {inn.innings_number} ({inn.batting_team === 'A' ? 'The Challengers' : liveMatch.team_b_name}):{' '}
              {inn.total_runs}/{inn.total_wickets} in {inn.overs_completed} overs
            </p>
          ))}
          <p style={{ color: 'var(--text-muted, #9fb0c3)' }}>Ball-by-ball scoring screen is coming in the next update — match is saved and will resume here.</p>
        </div>
      )}
    </div>
  );
}