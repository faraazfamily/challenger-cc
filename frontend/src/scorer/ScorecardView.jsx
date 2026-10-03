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

function RunGraphs({ s }) {
  const overs = s.completedOvers;
  if (!overs.length) return null;
  let tot = 0;
  const cum = overs.map((o) => (tot += o.runs));
  const W = 320;
  const H = 130;
  const L = 28;
  const B = 20;
  const T = 10;
  const maxR = Math.max(...overs.map((o) => o.runs), 1);
  const maxC = Math.max(...cum, 1);
  const n = overs.length;
  const bw = (W - L - 6) / n;
  const x = (k) => L + k * bw + bw / 2;
  const yR = (v) => H - B - (v / maxR) * (H - B - T);
  const yC = (v) => H - B - (v / maxC) * (H - B - T);
  const wk = s.fow.map((f) => Math.floor(parseFloat(f.over))).filter((k) => k >= 0 && k < n);
  const wkCount = {};
  wk.forEach((k) => { wkCount[k] = (wkCount[k] || 0) + 1; });
  const step = n > 12 ? Math.ceil(n / 10) : 1;
  const axis = (
    <>
      <line x1={L} y1={H - B} x2={W} y2={H - B} stroke="#9ca3af" />
      <line x1={L} y1={T} x2={L} y2={H - B} stroke="#9ca3af" />
    </>
  );
  const labels = overs.map((o, k) => ((k % step === 0 || k === n - 1) ? <text key={k} x={x(k)} y={H - 6} fontSize="9" textAnchor="middle" fill="#6b7280">{k + 1}</text> : null));
  return (
    <div className="card" style={{ marginTop: 16, padding: '12px 14px' }}>
      <strong>Runs per over</strong>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 520 }} role="img" aria-label="Runs per over">
        {axis}
        <text x={L - 4} y={T + 4} fontSize="9" textAnchor="end" fill="#6b7280">{maxR}</text>
        {overs.map((o, k) => (
          <g key={k}>
            <rect x={x(k) - bw * 0.35} y={yR(o.runs)} width={bw * 0.7} height={H - B - yR(o.runs)} fill="#1e3a5f" rx="1" />
            {Array.from({ length: wkCount[k] || 0 }).map((_, w) => <circle key={w} cx={x(k)} cy={yR(o.runs) - 5 - w * 8} r="3" fill="#dc2626" />)}
          </g>
        ))}
        {labels}
      </svg>
      <div className="sc-small" style={{ padding: 0 }}>Red dots are wickets in that over.</div>
      <strong style={{ display: 'block', marginTop: 12 }}>Run progression (worm)</strong>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 520 }} role="img" aria-label="Run progression">
        {axis}
        <text x={L - 4} y={T + 4} fontSize="9" textAnchor="end" fill="#6b7280">{maxC}</text>
        <polyline fill="none" stroke="#1e3a5f" strokeWidth="2" points={[`${L},${H - B}`, ...cum.map((v, k) => `${x(k)},${yC(v)}`)].join(' ')} />
        {wk.map((k, w) => <circle key={w} cx={x(k)} cy={yC(cum[k])} r="3.5" fill="#dc2626" />)}
        {labels}
      </svg>
    </div>
  );
}

export default function ScorecardView({ match }) {
  const count = match.innings.length;
  const [tab, setTab] = useState(count - 1);
  const i = Math.min(tab, count - 1);
  const s = summarize(match, i);
  const ex = s.extras;
  const nameOf = (pid) => s.batters.find((b) => b.pid === pid)?.name || '?';
  const parts = [...s.partnerships.filter((p) => p.runs > 0 || p.balls > 0), ...(s.partnership && !s.complete ? [{ ...s.partnership, aName: nameOf(s.partnership.a), bName: nameOf(s.partnership.b), open: true }] : [])];

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
      {parts.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="sc-card-head"><strong>Partnerships</strong></div>
          <table>
            <thead><tr><th>Batters</th><th>Runs</th><th>Balls</th></tr></thead>
            <tbody>
              {parts.map((p, k) => (
                <tr key={k}><td>{p.aName} &amp; {p.bName}{p.open ? ' *' : ''}</td><td><strong>{p.runs}</strong></td><td>{p.balls}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <RunGraphs s={s} />
    </div>
  );
}
