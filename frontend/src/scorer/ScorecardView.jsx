import { useState } from 'react';
import { summarize } from './engine';

function inningsLabel(match, i) {
  const team = match.innings[i].team;
  let nth = 0;
  for (let k = 0; k <= i; k++) if (match.innings[k].team === team) nth += 1;
  const two = (match.config.inningsPerSide || 1) === 2;
  const ord = nth === 1 ? '1st' : '2nd';
  return `${match.teams[team].name}${two ? ` ${ord} inns` : ''}`;
}

export default function ScorecardView({ match }) {
  const count = match.innings.length;
  const [tab, setTab] = useState(count - 1);
  const i = Math.min(tab, count - 1);
  const s = summarize(match, i);
  const ex = s.extras;

  return (
    <div className="sc-card-view">
      {count > 1 && (
        <div className="stat-tabs">
          {match.innings.map((_, k) => (
            <button key={k} type="button" className={`stat-tab ${i === k ? 'active' : ''}`} onClick={() => setTab(k)}>
              {inningsLabel(match, k)}
            </button>
          ))}
        </div>
      )}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="sc-card-head">
          <strong>{inningsLabel(match, i)}</strong>
          <span>{s.runs}/{s.wickets}{s.declared ? ' d' : ''} ({s.overs} ov)</span>
        </div>
        <table>
          <thead><tr><th>Batter</th><th>How out</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead>
          <tbody>
            {s.batters.length === 0 && <tr><td colSpan="7" style={{ textAlign: 'center' }}>Yet to start</td></tr>}
            {s.batters.map((b) => (
              <tr key={b.pid}>
                <td><strong>{b.name}</strong>{s.striker === b.pid ? ' *' : ''}</td>
                <td>{b.status === 'out' || b.status === 'retired' ? b.how : s.complete || b.status === 'batting' ? 'not out' : ''}</td>
                <td><strong>{b.runs}</strong></td><td>{b.balls}</td><td>{b.fours}</td><td>{b.sixes}</td><td>{b.sr.toFixed(2)}</td>
              </tr>
            ))}
            <tr>
              <td><strong>Extras</strong></td>
              <td colSpan="6">{s.extrasTotal} (b {ex.b}, lb {ex.lb}, wd {ex.wd}, nb {ex.nb}, pen {ex.pen})</td>
            </tr>
            <tr>
              <td><strong>Total</strong></td>
              <td colSpan="6"><strong>{s.runs}/{s.wickets}</strong> in {s.overs} overs</td>
            </tr>
          </tbody>
        </table>
        {s.didNotBat.length > 0 && s.batters.length > 0 && (
          <p className="sc-small">Did not bat: {s.didNotBat.map((p) => p.name).join(', ')}</p>
        )}
        {s.fow.length > 0 && (
          <p className="sc-small"><strong>Fall of wickets:</strong> {s.fow.map((f) => `${f.score}/${f.wkt} (${f.name}, ${f.over} ov)`).join(' · ')}</p>
        )}
      </div>
      <div className="card">
        <table>
          <thead><tr><th>Bowler</th><th>O</th><th>M</th><th>R</th><th>W</th><th>Wd</th><th>Nb</th><th>ER</th></tr></thead>
          <tbody>
            {s.bowlers.length === 0 && <tr><td colSpan="8" style={{ textAlign: 'center' }}>Yet to start</td></tr>}
            {s.bowlers.map((b) => (
              <tr key={b.pid}>
                <td><strong>{b.name}</strong></td><td>{b.overs}</td><td>{b.maidens}</td><td>{b.runs}</td>
                <td><strong>{b.wk}</strong></td><td>{b.wd}</td><td>{b.nb}</td><td>{b.econ.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
