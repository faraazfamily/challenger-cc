// Cricket scoring engine for The Challengers.
//
// A match is plain JSON. Every innings keeps an ordered list of events and ALL numbers
// (score, overs, batters, bowlers, fall of wickets, result) are re-calculated from those
// events by summarize(). That makes Undo trivial (drop the last event) and the match can
// be saved to the server / localStorage and resumed at any time.

export const FORMATS = ['T10', 'T20', 'ODI', 'Test', 'Custom'];

export function defaultConfig(format) {
  const base = { format, ballsPerOver: 6, wideRuns: 1, noBallRuns: 1, freeHit: true, followOnLead: 0, inningsPerSide: 1 };
  switch (format) {
    case 'T10': return { ...base, overs: 10, maxBowlerOvers: 2 };
    case 'T20': return { ...base, overs: 20, maxBowlerOvers: 4 };
    case 'ODI': return { ...base, overs: 50, maxBowlerOvers: 10 };
    case 'Test': return { ...base, overs: null, maxBowlerOvers: null, inningsPerSide: 2, followOnLead: 200 };
    default: return { ...base, overs: 5, maxBowlerOvers: 1 };
  }
}

export const WICKET_TYPES = [
  { key: 'bowled', label: 'Bowled' },
  { key: 'caught', label: 'Caught', fielder: true },
  { key: 'lbw', label: 'LBW' },
  { key: 'run out', label: 'Run out', fielder: true, either: true, runs: true },
  { key: 'stumped', label: 'Stumped', fielder: true },
  { key: 'hit wicket', label: 'Hit wicket' },
  { key: 'obstructing', label: 'Obstructing the field', either: true },
  { key: 'handled', label: 'Handled the ball' },
  { key: 'hit twice', label: 'Hit the ball twice' },
];
const BOWLER_WICKETS = new Set(['bowled', 'caught', 'lbw', 'stumped', 'hit wicket']);
const WIDE_WICKETS = new Set(['stumped', 'run out', 'hit wicket', 'obstructing']);
const NOBALL_WICKETS = new Set(['run out', 'handled', 'obstructing', 'hit twice']);

// Which dismissals are allowed on this delivery (wide / no-ball / free hit rules).
export function allowedWickets(extra, freeHit) {
  return WICKET_TYPES.filter((w) => {
    if (extra === 'wd') return WIDE_WICKETS.has(w.key);
    if (extra === 'nb' || freeHit) return NOBALL_WICKETS.has(w.key);
    return true;
  });
}

export const fmtOvers = (legal, bpo = 6) => `${Math.floor(legal / bpo)}.${legal % bpo}`;
export const oversToDecimal = (legal, bpo = 6) => Math.floor(legal / bpo) + (legal % bpo) / 10;

let uid = 0;
export const newPid = (team) => `${team}-${Date.now().toString(36)}${(uid++).toString(36)}`;

// ---------- match creation / structure ----------

export function createMatch({ config, teams, toss, meta }) {
  const battingFirst = toss.elected === 'bat' ? toss.winner : 1 - toss.winner;
  return {
    v: 1,
    config,
    teams,
    toss,
    meta,
    battingFirst,
    followOn: false,
    resultOverride: null,
    innings: [{ team: battingFirst, events: [], revised: null }],
  };
}

export const totalInnings = (m) => (m.config.inningsPerSide || 1) * 2;

export function battingTeamOf(m, i, followOn = m.followOn) {
  const first = m.battingFirst;
  if ((m.config.inningsPerSide || 1) === 1) return i === 0 ? first : 1 - first;
  if (i === 0) return first;
  if (i === 1) return 1 - first;
  if (i === 2) return followOn ? 1 - first : first;
  return followOn ? first : 1 - first;
}

const teamName = (m, t) => m.teams[t].name;
const playerName = (m, t, pid) => m.teams[t].players.find((p) => p.pid === pid)?.name || '?';

export function targetFor(m, i) {
  if (i !== totalInnings(m) - 1 || m.innings.length - 1 < i) return null;
  const inn = m.innings[i];
  if (inn.revised?.target) return inn.revised.target;
  let own = 0;
  let opp = 0;
  for (let j = 0; j < i; j++) {
    const s = summarize(m, j);
    if (m.innings[j].team === inn.team) own += s.runs;
    else opp += s.runs;
  }
  return opp - own + 1;
}

// ---------- the replay ----------

export function summarize(m, i) {
  const inn = m.innings[i];
  const cfg = m.config;
  const bpo = cfg.ballsPerOver || 6;
  const bt = m.teams[inn.team];
  const fl = m.teams[1 - inn.team];
  const nameBat = (pid) => bt.players.find((p) => p.pid === pid)?.name || '?';
  const nameBowl = (pid) => fl.players.find((p) => p.pid === pid)?.name || '?';
  const limit = (inn.revised?.overs ?? cfg.overs) || null;
  const maxBalls = limit ? limit * bpo : Infinity;
  const target = targetFor(m, i);

  let S = null;
  let N = null;
  let bowler = null;
  let lastBowler = null;
  let runs = 0;
  let wk = 0;
  let legal = 0;
  let inOver = 0;
  let overRuns = 0;
  let opened = false;
  let complete = false;
  let reason = null;
  let freeHit = false;
  let chips = [];
  let part = null;
  const extras = { wd: 0, nb: 0, b: 0, lb: 0, pen: 0 };
  const batters = {};
  const order = [];
  const bowlers = {};
  const bOrder = [];
  const fow = [];
  const overs = [];
  const partnerships = [];

  const swap = () => { [S, N] = [N, S]; };
  const ensureBatter = (pid) => {
    if (!batters[pid]) {
      batters[pid] = { pid, name: nameBat(pid), runs: 0, balls: 0, fours: 0, sixes: 0, status: 'batting', how: '' };
      order.push(pid);
    } else if (batters[pid].status === 'retired') {
      batters[pid].status = 'batting';
      batters[pid].how = '';
    }
    return batters[pid];
  };
  const ensureBowler = (pid) => {
    if (!bowlers[pid]) {
      bowlers[pid] = { pid, name: nameBowl(pid), legal: 0, runs: 0, wk: 0, maidens: 0, wd: 0, nb: 0, overRuns: 0, overBalls: 0 };
      bOrder.push(pid);
    }
    return bowlers[pid];
  };
  const available = () => bt.players.filter((p) => !batters[p.pid] || batters[p.pid].status === 'retired');
  const startPart = () => { if (S && N) part = { a: S, b: N, runs: 0, balls: 0, startScore: runs }; };
  const closePart = () => { if (part) { partnerships.push({ ...part, aName: nameBat(part.a), bName: nameBat(part.b) }); part = null; } };
  const checkAllOut = () => {
    if (!complete && (S === null || N === null) && available().length === 0) { complete = true; reason = 'allout'; }
  };
  const chip = (ev) => {
    if (ev.wicket) return { t: 'w', label: ev.runs ? `W+${ev.runs}` : 'W' };
    if (ev.extra === 'wd') return { t: 'x', label: ev.runs ? `Wd+${ev.runs}` : 'Wd' };
    if (ev.extra === 'nb') {
      const off = ev.nbOff && ev.nbOff !== 'bat' ? ev.nbOff : '';
      return { t: 'x', label: ev.runs ? `Nb+${ev.runs}${off}` : 'Nb' };
    }
    if (ev.extra === 'b') return { t: 'x', label: `${ev.runs}b` };
    if (ev.extra === 'lb') return { t: 'x', label: `${ev.runs}lb` };
    if (ev.boundary === 4) return { t: 'four', label: '4' };
    if (ev.boundary === 6) return { t: 'six', label: '6' };
    return { t: ev.runs ? 'run' : 'dot', label: ev.runs ? String(ev.runs) : '•' };
  };

  for (const ev of inn.events) {
    if (complete) break;
    switch (ev.t) {
      case 'open':
        S = ev.striker; N = ev.nonStriker; bowler = ev.bowler;
        ensureBatter(S); ensureBatter(N); ensureBowler(bowler);
        opened = true; startPart();
        break;
      case 'bat':
        if (S === null) S = ev.pid; else N = ev.pid;
        ensureBatter(ev.pid); startPart();
        break;
      case 'bowler': {
        bowler = ev.pid;
        const b = ensureBowler(ev.pid);
        if (inOver === 0) { b.overRuns = 0; b.overBalls = 0; }
        break;
      }
      case 'swap': swap(); break;
      case 'pen':
        extras.pen += ev.runs; runs += ev.runs;
        break;
      case 'retire': {
        const b = batters[ev.pid];
        if (!b) break;
        if (ev.hurt) { b.status = 'retired'; b.how = 'retired hurt'; } else { b.status = 'out'; b.how = 'retired out'; wk += 1; fow.push({ wkt: wk, score: runs, pid: ev.pid, name: b.name, over: fmtOvers(legal, bpo) }); }
        closePart();
        if (S === ev.pid) S = null; else if (N === ev.pid) N = null;
        checkAllOut();
        break;
      }
      case 'declare': complete = true; reason = 'declared'; break;
      case 'end': complete = true; reason = 'end'; break;
      case 'ball': {
        if (!opened || S === null || N === null || bowler === null) break;
        const wide = ev.extra === 'wd';
        const nb = ev.extra === 'nb';
        const nbOff = ev.nbOff || 'bat';
        const striker = batters[S];
        const bw = bowlers[bowler];
        const legalBall = !wide && !nb;
        const wasFree = freeHit;
        let total = 0;
        let bat = 0;
        let charged = 0;
        if (wide) { total = cfg.wideRuns + ev.runs; charged = total; extras.wd += total; bw.wd += total; }
        else if (nb) {
          total = cfg.noBallRuns + ev.runs; extras.nb += cfg.noBallRuns; bw.nb += 1;
          if (nbOff === 'bat') { bat = ev.runs; charged = total; }
          else { extras[nbOff] += ev.runs; charged = cfg.noBallRuns; }
        } else if (ev.extra === 'b' || ev.extra === 'lb') { total = ev.runs; extras[ev.extra] += ev.runs; }
        else { total = ev.runs; bat = ev.runs; charged = ev.runs; }

        runs += total; bw.runs += charged; bw.overRuns += charged; overRuns += total;
        if (!wide) striker.balls += 1;
        striker.runs += bat;
        if (bat && ev.boundary === 4) striker.fours += 1;
        if (bat && ev.boundary === 6) striker.sixes += 1;
        if (legalBall) { legal += 1; inOver += 1; bw.legal += 1; bw.overBalls += 1; }
        if (part) { part.runs += total; if (legalBall) part.balls += 1; }

        const ran = ev.boundary ? 0 : ev.runs;
        if (ran % 2 === 1) swap();

        if (ev.wicket) {
          const w = ev.wicket;
          const outPid = w.out || S;
          if (w.crossed) swap();
          const ob = batters[outPid];
          if (ob) {
            ob.status = 'out';
            const f = w.fielder ? nameBowl(w.fielder) : '';
            const bn = bw.name;
            if (w.type === 'bowled') ob.how = `b ${bn}`;
            else if (w.type === 'caught') ob.how = w.fielder === bowler ? `c & b ${bn}` : `c ${f || 'sub'} b ${bn}`;
            else if (w.type === 'lbw') ob.how = `lbw b ${bn}`;
            else if (w.type === 'stumped') ob.how = `st ${f || 'wk'} b ${bn}`;
            else if (w.type === 'run out') ob.how = `run out (${f || 'sub'})`;
            else if (w.type === 'hit wicket') ob.how = `hit wicket b ${bn}`;
            else if (w.type === 'obstructing') ob.how = 'obstructing the field';
            else if (w.type === 'handled') ob.how = 'handled the ball';
            else ob.how = 'hit the ball twice';
            ob.type = w.type;
          }
          wk += 1;
          if (BOWLER_WICKETS.has(w.type)) bw.wk += 1;
          fow.push({ wkt: wk, score: runs, pid: outPid, name: nameBat(outPid), over: fmtOvers(legal, bpo) });
          closePart();
          if (S === outPid) S = null; else if (N === outPid) N = null;
        }
        chips.push(chip(ev));
        freeHit = !!cfg.freeHit && (nb || (wasFree && wide));

        if (legalBall && inOver === bpo) {
          swap();
          if (bw.overBalls === bpo && bw.overRuns === 0) bw.maidens += 1;
          bw.overRuns = 0; bw.overBalls = 0;
          overs.push({ no: overs.length + 1, bowler: bw.name, chips, runs: overRuns });
          chips = []; overRuns = 0; inOver = 0; lastBowler = bowler; bowler = null;
        }
        if (target !== null && runs >= target) { complete = true; reason = 'target'; }
        else { checkAllOut(); if (!complete && legal >= maxBalls) { complete = true; reason = 'overs'; } }
        break;
      }
      default: break;
    }
  }

  let needs = null;
  if (!opened) needs = 'open';
  else if (!complete) needs = S === null || N === null ? 'batter' : bowler === null ? 'bowler' : null;

  const ballsLeft = limit ? Math.max(0, maxBalls - legal) : null;
  const crr = legal ? (runs * bpo) / legal : 0;
  const need = target !== null ? Math.max(0, target - runs) : null;
  const rrr = need !== null && ballsLeft ? (need * bpo) / ballsLeft : null;
  const batList = order.map((pid) => {
    const b = batters[pid];
    return { ...b, sr: b.balls ? (b.runs / b.balls) * 100 : 0 };
  });
  const bowlList = bOrder.map((pid) => {
    const b = bowlers[pid];
    return { ...b, overs: fmtOvers(b.legal, bpo), econ: b.legal ? (b.runs * bpo) / b.legal : 0 };
  });
  const maxB = cfg.maxBowlerOvers ? cfg.maxBowlerOvers * bpo : Infinity;
  const bowlerOptions = fl.players.map((p) => {
    const b = bowlers[p.pid];
    let blocked = '';
    if (p.pid === lastBowler) blocked = 'bowled the last over';
    else if (b && b.legal >= maxB) blocked = 'quota finished';
    return { ...p, overs: b ? fmtOvers(b.legal, bpo) : '0.0', runs: b?.runs || 0, wk: b?.wk || 0, blocked };
  });

  return {
    i, team: inn.team, teamName: bt.name, runs, wickets: wk, legal, overs: fmtOvers(legal, bpo),
    extras, extrasTotal: extras.wd + extras.nb + extras.b + extras.lb + extras.pen,
    batters: batList, bowlers: bowlList, fow, completedOvers: overs, currentChips: chips,
    partnership: part, partnerships, striker: S, nonStriker: N, bowler, lastBowler,
    opened, complete, reason, needs, freeHit, target, need, ballsLeft, crr, rrr, limit,
    available: available(), didNotBat: bt.players.filter((p) => !batters[p.pid]),
    bowlerOptions, battingPlayers: bt.players, fieldingPlayers: fl.players,
    declared: reason === 'declared',
  };
}

// ---------- editing helpers (all return a NEW match) ----------

const withLast = (m, fn) => ({ ...m, innings: m.innings.map((inn, k) => (k === m.innings.length - 1 ? fn(inn) : inn)) });

export const addEvent = (m, ev) => withLast(m, (inn) => ({ ...inn, events: [...inn.events, ev] }));

export function undo(m) {
  const last = m.innings[m.innings.length - 1];
  if (last.events.length === 0) {
    if (m.innings.length === 1) return m;
    const next = { ...m, innings: m.innings.slice(0, -1) };
    if (m.innings.length === 3) next.followOn = false;
    return next;
  }
  const ev = [...last.events];
  while (ev.length) {
    const e = ev.pop();
    if (e.t !== 'bat' && e.t !== 'bowler') break;
  }
  return withLast(m, (inn) => ({ ...inn, events: ev }));
}

export function startNext(m, followOn = false) {
  const i = m.innings.length;
  const fo = i === 2 ? followOn : m.followOn;
  const next = { ...m, followOn: fo };
  next.innings = [...m.innings, { team: battingTeamOf(next, i, fo), events: [], revised: null }];
  return next;
}

export const reviseTarget = (m, target, overs) =>
  withLast(m, (inn) => ({ ...inn, revised: { target: Number(target) || null, overs: Number(overs) || null } }));

export const setOverride = (m, resultOverride) => ({ ...m, resultOverride });

// ---------- totals, lead, results ----------

export function teamRuns(m) {
  const r = [0, 0];
  m.innings.forEach((inn, i) => { r[inn.team] += summarize(m, i).runs; });
  return r;
}

const winText = (m, w, how) => `${teamName(m, w)} won by ${how}`;

export function matchResult(m) {
  if (m.resultOverride) return { done: true, ...m.resultOverride };
  const per = m.config.inningsPerSide || 1;
  const sums = m.innings.map((_, i) => summarize(m, i));
  const ballsLeftText = (s) => (s.ballsLeft ? ` (${s.ballsLeft} balls left)` : '');

  const chaseResult = (k) => {
    const s = sums[k];
    const chaser = m.innings[k].team;
    const defender = 1 - chaser;
    const tgt = s.target;
    const left = m.teams[chaser].players.length - 1 - s.wickets;
    if (s.runs >= tgt) {
      return { done: true, type: 'win', winner: chaser, text: winText(m, chaser, `${left} wicket${left === 1 ? '' : 's'}${ballsLeftText(s)}`) };
    }
    if (s.reason === 'end' && per === 2) return { done: true, type: 'draw', winner: null, text: 'Match drawn' };
    if (s.runs === tgt - 1) return { done: true, type: 'tie', winner: null, text: 'Match tied' };
    const margin = tgt - 1 - s.runs;
    return { done: true, type: 'win', winner: defender, text: winText(m, defender, `${margin} run${margin === 1 ? '' : 's'}`) };
  };

  if (per === 1) {
    if (m.innings.length === 2 && sums[1].complete) return chaseResult(1);
    return { done: false };
  }
  if (m.innings.length >= 3 && sums[2].complete) {
    const t = m.innings[2].team;
    const o = 1 - t;
    let tAgg = 0;
    let oRuns = 0;
    for (let k = 0; k <= 2; k++) { if (m.innings[k].team === t) tAgg += sums[k].runs; else oRuns += sums[k].runs; }
    if (tAgg < oRuns) {
      const margin = oRuns - tAgg;
      return { done: true, type: 'win', winner: o, text: winText(m, o, `an innings and ${margin} run${margin === 1 ? '' : 's'}`) };
    }
  }
  if (m.innings.length === 4 && sums[3].complete) return chaseResult(3);
  return { done: false };
}

// What should the scorer do next?
export function nextStep(m) {
  if (m.resultOverride) return { kind: 'done', result: { done: true, ...m.resultOverride } };
  const last = m.innings.length - 1;
  const s = summarize(m, last);
  if (!s.complete) return { kind: 'play' };
  const res = matchResult(m);
  if (res.done) return { kind: 'done', result: res };
  if (m.innings.length >= totalInnings(m)) return { kind: 'done', result: { done: true, type: 'draw', winner: null, text: 'Match drawn' } };
  if ((m.config.inningsPerSide || 1) === 2 && last === 1) {
    const r = teamRuns(m);
    const lead = r[m.battingFirst] - r[1 - m.battingFirst];
    if (m.config.followOnLead > 0 && lead >= m.config.followOnLead) return { kind: 'followon', lead };
  }
  return { kind: 'next', index: last + 1 };
}

// One-line situation shown under the score.
export function situation(m) {
  const i = m.innings.length - 1;
  const s = summarize(m, i);
  const tn = (t) => teamName(m, t);
  if (s.target !== null) {
    if (s.need === 0) return `${s.teamName} have reached the target`;
    const left = s.ballsLeft !== null ? ` from ${s.ballsLeft} ball${s.ballsLeft === 1 ? '' : 's'}` : '';
    return `${s.teamName} need ${s.need} run${s.need === 1 ? '' : 's'}${left}`;
  }
  if ((m.config.inningsPerSide || 1) === 2 && i >= 1) {
    const r = teamRuns(m);
    const diff = r[s.team] - r[1 - s.team];
    if (diff > 0) return `${tn(s.team)} lead by ${diff} run${diff === 1 ? '' : 's'}`;
    if (diff < 0) return `${tn(s.team)} trail by ${-diff} run${diff === -1 ? '' : 's'}`;
    return 'Scores are level';
  }
  return i === 0 ? `${s.teamName} batting first` : '';
}

// ---------- strings + export for the database ----------

export function scoreString(m, team) {
  const parts = [];
  let lastOvers = '';
  m.innings.forEach((inn, i) => {
    if (inn.team !== team) return;
    const s = summarize(m, i);
    parts.push(`${s.runs}/${s.wickets}${s.declared ? 'd' : ''}`);
    lastOvers = s.overs;
  });
  if (!parts.length) return '';
  return (m.config.inningsPerSide || 1) === 1 ? `${parts[0]} (${lastOvers})` : parts.join(' & ');
}

export function extractStats(m) {
  const batting = [];
  const bowling = [];
  const bpo = m.config.ballsPerOver || 6;
  m.innings.forEach((inn, i) => {
    const s = summarize(m, i);
    const bt = m.teams[inn.team].players;
    const fl = m.teams[1 - inn.team].players;
    s.batters.forEach((b) => {
      const pl = bt.find((p) => p.pid === b.pid);
      if (!pl?.playerId) return;
      batting.push({
        player_id: pl.playerId, innings_no: i + 1, runs: b.runs, balls_faced: b.balls, fours: b.fours, sixes: b.sixes,
        is_out: b.status === 'out', dismissal_type: b.status === 'out' ? b.how : b.status === 'retired' ? 'retired hurt' : 'Not Out',
      });
    });
    s.bowlers.forEach((b) => {
      const pl = fl.find((p) => p.pid === b.pid);
      if (!pl?.playerId) return;
      bowling.push({
        player_id: pl.playerId, innings_no: i + 1, overs: oversToDecimal(b.legal, bpo),
        maidens: b.maidens, runs_conceded: b.runs, wickets: b.wk,
      });
    });
  });
  return { batting, bowling };
}

export function buildFinishPayload(m) {
  const res = matchResult(m);
  const our = m.meta.ourSide || 0;
  const other = 1 - our;
  let result = 'No Result';
  if (res.type === 'win') result = res.winner === our ? 'Won' : 'Lost';
  else if (res.type === 'tie') result = 'Tied';
  else if (res.type === 'draw') result = 'Draw';
  const { batting, bowling } = extractStats(m);
  return {
    opponent: m.teams[other].name,
    match_date: m.meta.date,
    venue: m.meta.venue || '',
    our_score: scoreString(m, our),
    opponent_score: scoreString(m, other),
    result,
    result_note: res.text || '',
    tournament_id: m.meta.tournamentId ? Number(m.meta.tournamentId) : null,
    batting,
    bowling,
  };
}

export const matchTitle = (m) => `${m.teams[0].name} v/s ${m.teams[1].name}`;
export const playerLabel = playerName;
