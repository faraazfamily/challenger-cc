import { useEffect, useRef, useState } from 'react';
import { api } from '../api';

export default function AdminScorecard() {
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [tournaments, setTournaments] = useState([]);
  const [tournamentId, setTournamentId] = useState('');
  const [asked, setAsked] = useState(false);

  async function handleUpload(e) {
    e.preventDefault();
    setError('');
    setResult(null);
    if (!file) {
      setError('Choose the scorecard PDF first.');
      return;
    }
    setLoading(true);
    const fd = new FormData();
    fd.append('scorecard', file);
    try {
      setResult(await api.importScorecard(fd));
      setAsked(false);
      setTournamentId('');
      setFile(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    api.getTournaments().then(setTournaments).catch(() => {});
  }, []);

  async function markFriendly() {
    setAsked(true);
  }

  async function linkTournament(e) {
    e.preventDefault();
    if (!tournamentId) {
      setError('Pick a tournament, or choose friendly.');
      return;
    }
    const chosen = tournaments.find((t) => String(t.id) === String(tournamentId));
    try {
      await api.updateMatch(result.match_id, {
        opponent: result.opponent,
        match_date: result.match_date,
        our_score: result.our_score || '',
        opponent_score: result.opponent_score || '',
        result: result.result,
        tournament_id: Number(tournamentId),
        venue: '',
      });
      setResult({ ...result, tournament_name: chosen?.name || '' });
      setAsked(true);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <h3>Scorecard PDF</h3>
        <p style={{ color: '#4b5563', marginTop: 0 }}>
          Drop the PDF. Both teams are read from the versus line, and only squad members are saved. There is nothing to edit.
        </p>
        <form onSubmit={handleUpload}>
          <div
            className={`upload-panel ${dragOver ? 'hot' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const dropped = e.dataTransfer.files?.[0];
              if (dropped) setFile(dropped);
            }}
          >
            <div className="upload-mark">PDF</div>
            <div className="upload-copy">
              <strong>{file ? file.name : 'No scorecard selected'}</strong>
              <p>Drop the PDF here. It should say one team v/s the other.</p>
            </div>
            <button className="btn btn-secondary" type="button" onClick={() => fileInput.current?.click()}>Choose PDF</button>
            <input ref={fileInput} type="file" accept="application/pdf" hidden onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading || !file} style={{ marginTop: 16 }}>
            {loading ? 'Reading PDF...' : 'Save squad scorecard'}
          </button>
        </form>
      </div>
      {error && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}
      {result && (
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ marginTop: 0 }}>{result.our_team} vs {result.opponent}</h3>
          <p><span className={result.result === 'Won' ? 'badge badge-won' : 'badge badge-lost'}>{result.result}</span></p>
          <p>{result.our_score || '—'} against {result.opponent_score || '—'}</p>
          {!asked && (
            <form onSubmit={linkTournament} className="tournament-ask">
              <p>Was this match part of a tournament?</p>
              <select value={tournamentId} onChange={(e) => setTournamentId(e.target.value)}>
                <option value="">Select a tournament</option>
                {tournaments.map((t) => <option key={t.id} value={t.id}>{t.name}{t.year ? ` (${t.year})` : ''}</option>)}
              </select>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn btn-primary" type="submit">Yes, add to tournament</button>
                <button className="btn btn-secondary" type="button" onClick={markFriendly}>No, it was a friendly</button>
              </div>
            </form>
          )}
          {asked && <p>{result.tournament_name ? `Saved under ${result.tournament_name}.` : 'Saved as a friendly. Tournaments were not changed.'}</p>}
          <ul className="saved-list">
            {(result.saved || []).map((row, i) => (
              <li key={i}>
                <strong>{row.name}</strong>
                {row.kind === 'batting' ? ` — ${row.runs} runs (${row.balls} balls)` : ` — ${row.wickets} wickets in ${row.overs} overs`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
