// KDM-style History / Teams / Players numbers, worked out from the scored matches themselves
// (the full ball-by-ball state of every match in the scorer's history). These cover BOTH sides
// and every player, unlike the club's career stats, which only count our squad.
import { summarize, nextStep, scoreString, matchTitle, situation, fmtOvers } from './engine';

// One line per scored match for the History list.
export function historyItem(row) {
  const m = row.state;
  const step = nextStep(m);
  const done = row.status === 'finished' || step.kind === 'done';
  return {
    id: row.id,
    row,
    title: matchTitle(m),
    format: m.config.format,
    date: m.meta?.date || String(row.created_at || '').slice(0, 10),
    venue: m.meta?.venue || '',
    scores: m.teams.map((t, k) => ({ name: t.name, score: scoreString(m, k) || 'Yet to bat' })),
    result: done ? (step.result?.text || 'Match over') : situation(m) || 'In progress',
    done,
    saved: row.status === 'finished',
  };
}

const teamKey = (name) => String(name || '').trim().toLowerCase();

// Won / lost / tied / drawn per team name (case-insensitive), from matches that are over.
export function teamRecords(rows) {
  const teams = {};
  for (const row of rows) {
    const m = row.state;
    const step = nextStep(m);
    if (step.kind !== 'done') continue;
    const res = step.result || {};
    m.teams.forEach((t, k) => {
      const key = teamKey(t.name);
      const r = teams[key] || (teams[key] = { key, name: t.name, m: 0, w: 0, l: 0, t: 0, d: 0, nr: 0 });
      r.m += 1;
      if (res.type === 'win') { if (res.winner === k) r.w += 1; else r.l += 1; }
      else if (res.type === 'tie') r.t += 1;
      else if (res.type === 'draw') r.d += 1;
      else r.nr += 1;
    });
  }
  return Object.values(teams)
    .map((r) => ({ ...r, pct: r.m ? (r.w / r.m) * 100 : 0 }))
    .sort((a, b) => b.w - a.w || b.m - a.m || a.name.localeCompare(b.name));
}

// Squad players are one person across every match; anyone typed in is per team name,
// so two different "Rahul"s in two opponent teams stay apart.
const playerKey = (team, p) => (p.playerId ? `id:${p.playerId}` : `n:${teamKey(team.name)}:${teamKey(p.name)}`);

function blank(team, p) {
  return {
    key: playerKey(team, p), name: p.name, team: team.name, teamKey: teamKey(team.name), squad: !!p.playerId,
    matches: 0,
    bat: { inns: 0, no: 0, runs: 0, balls: 0, fours: 0, sixes: 0, hs: 0, hsNotOut: false, thirties: 0, fifties: 0, hundreds: 0, ducks: 0 },
    bowl: { inns: 0, balls: 0, realOvers: 0, maidens: 0, runs: 0, wk: 0, wd: 0, nb: 0, dots: 0, best: null, three: 0, five: 0 },
    field: { catches: 0, stumpings: 0, runOuts: 0 },
  };
}

// Career numbers for every player in the given matches.
export function playerStats(rows) {
  const players = {};
  for (const row of rows) {
    const m = row.state;
    const bpo = m.config.ballsPerOver || 6;
    const get = (t, pid) => {
      const team = m.teams[t];
      const p = team.players.find((x) => x.pid === pid);
      return p ? players[playerKey(team, p)] : null;
    };
    m.teams.forEach((team) => team.players.forEach((p) => {
      const key = playerKey(team, p);
      const r = players[key] || (players[key] = blank(team, p));
      r.matches += 1;
      r.name = p.name;
      r.team = team.name;
      r.teamKey = teamKey(team.name);
    }));
    m.innings.forEach((inn, i) => {
      const s = summarize(m, i);
      const bt = inn.team;
      s.batters.forEach((b) => {
        const r = get(bt, b.pid);
        if (!r) return;
        const x = r.bat;
        const notOut = b.status !== 'out';
        x.inns += 1;
        if (notOut) x.no += 1;
        x.runs += b.runs; x.balls += b.balls; x.fours += b.fours; x.sixes += b.sixes;
        if (b.runs > x.hs || (b.runs === x.hs && notOut)) { x.hs = b.runs; x.hsNotOut = notOut; }
        if (b.runs >= 100) x.hundreds += 1;
        else if (b.runs >= 50) x.fifties += 1;
        else if (b.runs >= 30) x.thirties += 1;
        if (!notOut && b.runs === 0) x.ducks += 1;
      });
      s.bowlers.forEach((b) => {
        const r = get(1 - bt, b.pid);
        if (!r) return;
        const x = r.bowl;
        x.inns += 1;
        x.balls += b.legal; x.realOvers += b.legal / bpo; x.maidens += b.maidens; x.runs += b.runs; x.wk += b.wk;
        x.wd += b.wd; x.nb += b.nb; x.dots += b.dots || 0;
        if (b.wk >= 5) x.five += 1;
        else if (b.wk >= 3) x.three += 1;
        if (!x.best || b.wk > x.best.wk || (b.wk === x.best.wk && b.runs < x.best.runs)) x.best = { wk: b.wk, runs: b.runs };
      });
      (s.fielding || []).forEach((f) => {
        const r = get(1 - bt, f.pid);
        if (!r) return;
        r.field.catches += f.catches; r.field.stumpings += f.stumpings; r.field.runOuts += f.runOuts;
      });
    });
  }
  return Object.values(players).map((r) => {
    const b = r.bat;
    const w = r.bowl;
    const outs = b.inns - b.no;
    return {
      ...r,
      bat: { ...b, avg: outs ? b.runs / outs : null, sr: b.balls ? (b.runs / b.balls) * 100 : 0, hsText: b.inns ? `${b.hs}${b.hsNotOut ? '*' : ''}` : '-' },
      bowl: {
        ...w,
        // Shown as 6-ball overs; economy uses each match's own over length.
        overs: fmtOvers(w.balls, 6),
        avg: w.wk ? w.runs / w.wk : null,
        econ: w.realOvers ? w.runs / w.realOvers : 0,
        sr: w.wk ? w.balls / w.wk : null,
        bestText: w.best ? `${w.best.wk}/${w.best.runs}` : '-',
      },
      field: { ...r.field, total: r.field.catches + r.field.stumpings + r.field.runOuts },
    };
  });
}
