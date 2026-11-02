import { useState } from 'react';
import { summarize, tossText, inningsLabel, shareText } from './engine';

// KDM-style scoreboard: toss line, then one collapsible section per innings with
// batting (dismissal under the name), extras, total, bowling, fall of wickets and partnerships.
function Innings({ match, i, open, onToggle }) {
  const s = summarize(match, i);
  const ex = s.extras;
  const nameOf = (pid) => s.batters.find((b) => b.pid === pid)?.name || '?';
  const parts = [...s.partnerships.filter((p) => p.runs > 0 || p.balls > 0), ...(s.partnership ? [{ ...s.partnership, aName: nameOf(s.partnership.a), bName: nameOf(s.partnership.b), open: true }] : [])];
  const how = (b) => (b.status === 'out' || b.status === 'retired' ? b.how : s.complete || b.status === 'batting' ? 'not out' : '');

  return (
    <div className="card sc-inns">
      <button type="button" className="sc-inns-head" onClick={onToggle} aria-expanded={open}>
        <strong>{inningsLabel(match, i)}</strong>
        <span>{s.runs}-{s.wickets}{s.declared ? 'd' : ''} ({s.overs}) <span className={`sc-chev ${open ? 'open' : ''}`}>⌃</span></span>
      </button>
      {open && (
        <>
          <table className="sc-sb">
            <thead><tr><th>Batsman</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead>
            <tbody>
              {s.batters.length === 0 && <tr><td colSpan="6" style={{ textAlign: 'center' }}>Yet to start</td></tr>}
              {s.batters.map((b) => (
                <tr key={b.pid}>
                  <td><div>{b.name}{s.striker === b.pid && !s.complete ? '*' : ''}</div><div className="sc-how">{how(b)}</div></td>
                  <td><strong>{b.runs}</strong></td><td>{b.balls}</td><td>{b.fours}</td><td>{b.sixes}</td><td>{b.sr.toFixed(2)}</td>
                </tr>
              ))}
              <tr className="sc-sb-row">
                <td>Extras</td>
                <td colSpan="5" className="sc-right"><strong>{s.extrasTotal}</strong>&nbsp; {ex.b} B, {ex.lb} LB, {ex.wd} WD, {ex.nb} NB, {ex.pen} P</td>
              </tr>
              <tr className="sc-sb-row">
                <td>Total</td>
                <td colSpan="5" className="sc-right"><strong>{s.runs}-{s.wickets} ({s.overs})</strong>&nbsp; {s.crr.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
          {s.didNotBat.length > 0 && s.batters.length > 0 && (
            <p className="sc-small sc-pad14">Did not bat: {s.didNotBat.map((p) => p.name).join(', ')}</p>
          )}

          <table className="sc-sb">
            <thead><tr><th>Bowler</th><th>O</th><th>M</th><th>R</th><th>W</th><th>ER</th></tr></thead>
            <tbody>
              {s.bowlers.length === 0 && <tr><td colSpan="6" style={{ textAlign: 'center' }}>Yet to start</td></tr>}
              {s.bowlers.map((b) => (
                <tr key={b.pid}>
                  <td>{b.name}{b.wd || b.nb ? <div className="sc-how">{b.wd} wd, {b.nb} nb</div> : null}</td>
                  <td>{b.overs}</td><td>{b.maidens}</td><td>{b.runs}</td><td><strong>{b.wk}</strong></td><td>{b.econ.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {s.fow.length > 0 && (
            <table className="sc-sb">
              <thead><tr><th>Fall of wickets</th><th className="sc-right">Score</th><th className="sc-right">Over</th></tr></thead>
              <tbody>
                {s.fow.map((f) => (
                  <tr key={f.wkt}><td>{f.name}</td><td className="sc-right">{f.score}/{f.wkt}</td><td className="sc-right">{f.over}</td></tr>
                ))}
              </tbody>
            </table>
          )}

          {parts.length > 0 && (
            <table className="sc-sb">
              <thead><tr><th>Partnerships</th><th className="sc-right">Runs</th><th className="sc-right">Balls</th></tr></thead>
              <tbody>
                {parts.map((p, k) => (
                  <tr key={k}><td>{p.aName} &amp; {p.bName}{p.open ? ' *' : ''}</td><td className="sc-right"><strong>{p.runs}</strong></td><td className="sc-right">{p.balls}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}

export async function shareScorecard(match) {
  const text = shareText(match);
  try {
    if (navigator.share) { await navigator.share({ title: 'Scorecard', text }); return ''; }
    await navigator.clipboard.writeText(text);
    return 'Scorecard copied. Paste it in WhatsApp or anywhere.';
  } catch (e) {
    if (e?.name === 'AbortError') return '';
    return 'Could not share on this device.';
  }
}

export default function ScorecardView({ match }) {
  const count = match.innings.length;
  const [open, setOpen] = useState(() => new Set([count - 1]));
  const [note, setNote] = useState('');
  const toggle = (i) => setOpen((o) => { const n = new Set(o); if (n.has(i)) n.delete(i); else n.add(i); return n; });

  return (
    <div className="sc-card-view">
      <div className="card sc-toss">
        <span>{tossText(match)}</span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={async () => setNote(await shareScorecard(match))}>Share</button>
      </div>
      {note && <div className="review-note">{note}</div>}
      {match.innings.map((_, i) => (
        <Innings key={i} match={match} i={i} open={open.has(i)} onToggle={() => toggle(i)} />
      ))}
    </div>
  );
}
