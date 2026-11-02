import { useState } from 'react';
import { progression, inningsLabel } from './engine';

// KDM-style "Analysis": Worm and Run Rate with both teams on one chart (plus Manhattan).
// Host team is orange, visitor blue; a team's 2nd innings (Test) is dashed.
const TEAM_COLORS = ['#f59e0b', '#3bb6dc'];
const W = 520;
const H = 260;
const L = 40;
const R = 14;
const T = 14;
const B = 30;

function niceStep(max, count) {
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}
const ticks = (max, count, whole = false) => {
  const step = whole ? Math.max(1, Math.round(niceStep(max, count))) : niceStep(max, count);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const out = [];
  for (let v = 0; v <= top + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
};

// y of a polyline at x, so a marker sits on the drawn line.
function lineAt(points, x) {
  const k = points.findIndex((p) => p.x >= x);
  if (k <= 0) return points[Math.max(k, 0)]?.y ?? 0;
  const a = points[k - 1];
  const b = points[k];
  return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x || 1);
}

function Chart({ series, maxX, yTicks, xTicks, children }) {
  const yMax = yTicks[yTicks.length - 1];
  const x = (v) => L + (v / maxX) * (W - L - R);
  const y = (v) => H - B - (v / yMax) * (H - B - T);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="sc-chart" role="img">
      {yTicks.map((v) => (
        <g key={`y${v}`}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="sc-grid" />
          <text x={L - 6} y={y(v) + 4} textAnchor="end" className="sc-tick">{v}</text>
        </g>
      ))}
      {xTicks.map((v) => <text key={`x${v}`} x={x(v)} y={H - B + 18} textAnchor="middle" className="sc-tick">{v}</text>)}
      <line x1={L} x2={W - R} y1={H - B} y2={H - B} className="sc-axis" />
      {children ? children({ x, y }) : series.map((s) => (
        <g key={s.key}>
          <polyline fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
            strokeDasharray={s.dashed ? '6 4' : undefined} points={s.points.map((p) => `${x(p.x)},${y(p.y)}`).join(' ')} />
          {s.marks.map((p, k) => (
            <circle key={k} cx={x(p.x)} cy={y(p.y)} r="5" fill="#fff" stroke={s.color} strokeWidth="2.5"><title>{p.title}</title></circle>
          ))}
        </g>
      ))}
    </svg>
  );
}

export default function Analysis({ match }) {
  const [tab, setTab] = useState('worm');
  const bpo = match.config.ballsPerOver || 6;
  const inns = match.innings.map((inn, i) => {
    const pr = progression(match, i);
    const nth = match.innings.slice(0, i + 1).filter((x) => x.team === inn.team).length;
    return { ...pr, i, key: i, label: inningsLabel(match, i), color: TEAM_COLORS[inn.team], dashed: nth > 1 };
  }).filter((d) => d.s.opened);

  if (!inns.length) return <div className="card sc-panel">Charts appear once the first ball is bowled.</div>;

  const limit = Math.max(...inns.map((d) => d.s.limit || 0));
  const maxX = Math.max(limit, ...inns.map((d) => d.points[d.points.length - 1].x), 1);
  const xTicks = ticks(maxX, 8, true).filter((v) => v <= maxX);
  const overTitle = (p) => `${Math.floor(p.x)}.${Math.round((p.x % 1) * bpo)} ov`;

  let body;
  if (tab === 'worm') {
    const series = inns.map((d) => ({
      ...d,
      points: d.points.map((p) => ({ x: p.x, y: p.runs })),
      marks: d.wickets.map((w) => ({ x: w.x, y: w.runs, title: `Wicket at ${w.runs} (${overTitle(w)})` })),
    }));
    body = <Chart series={series} maxX={maxX} xTicks={xTicks} yTicks={ticks(Math.max(...inns.map((d) => d.s.runs), 10), 5)} />;
  } else if (tab === 'rate') {
    const series = inns.map((d) => {
      const points = d.points.map((p) => ({ x: p.x, y: p.x ? p.runs / p.x : 0 }));
      return {
        ...d,
        points,
        marks: d.wickets.filter((w) => w.x > 0).map((w) => ({ x: w.x, y: lineAt(points, w.x), title: `Wicket, run rate ${(w.runs / w.x).toFixed(2)} (${overTitle(w)})` })),
      };
    });
    const top = Math.max(...series.flatMap((s) => s.points.map((p) => p.y)), 6);
    body = <Chart series={series} maxX={maxX} xTicks={xTicks} yTicks={ticks(top, 5)} />;
  } else {
    const overs = Math.max(...inns.map((d) => d.perOver.length), 1);
    const top = Math.max(...inns.flatMap((d) => d.perOver), 6);
    const slot = (W - L - R) / overs;
    const bw = (slot * 0.8) / inns.length;
    const mTicks = ticks(overs, 8, true).filter((v) => v >= 1 && v <= overs);
    body = (
      <Chart series={[]} maxX={overs} xTicks={[]} yTicks={ticks(top, 5)}>
        {({ y }) => (
          <>
            {mTicks.map((v) => <text key={v} x={L + (v - 0.5) * slot} y={H - B + 18} textAnchor="middle" className="sc-tick">{v}</text>)}
            {inns.map((d, k) => d.perOver.map((r, o) => {
              const bx = L + o * slot + slot * 0.1 + k * bw;
              const wk = d.wickets.filter((w) => w.x > 0 && Math.ceil(w.x - 1e-9) - 1 === o).length;
              return (
                <g key={`${k}-${o}`}>
                  <rect x={bx} y={y(r)} width={Math.max(bw - 1, 1)} height={H - B - y(r)} fill={d.color} opacity={d.dashed ? 0.6 : 1} rx="1"><title>{`${d.label}, over ${o + 1}: ${r} runs`}</title></rect>
                  {Array.from({ length: wk }).map((_, w) => <circle key={w} cx={bx + bw / 2} cy={y(r) - 6 - w * 9} r="3.5" fill="#dc2626" />)}
                </g>
              );
            }))}
          </>
        )}
      </Chart>
    );
  }

  return (
    <div className="card sc-analysis">
      <div className="sc-atabs">
        {[['worm', 'Worm'], ['rate', 'Run rate'], ['bars', 'Manhattan']].map(([k, l]) => (
          <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      <div className="sc-abody">
        {body}
        <div className="sc-legend">
          {inns.map((d) => (
            <span key={d.key}><i style={{ background: d.color, opacity: d.dashed ? 0.6 : 1 }} />{d.label}</span>
          ))}
          <span className="sc-small">{tab === 'bars' ? 'Red dots: wickets in that over' : 'Circles: wickets'}</span>
        </div>
      </div>
    </div>
  );
}
