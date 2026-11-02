import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import * as E from './engine';
import ScorecardView from './ScorecardView';
import PlayerInput from './PlayerInput';

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card sc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          {onClose && <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>}
        </div>
        {children}
      </div>
    </div>
  );
}

const pickName = (pick, players) => (pick?.pid ? players.find((p) => p.pid === pick.pid)?.name : pick?.name) || '';
const pickKey = (pick, players) => (pick ? pickName(pick, players).toLowerCase() : '');

// One "Striker / Non-striker / Bowler" slot: the chosen name, or a type-or-pick box.
function Slot({ label, pick, setPick, options, squad, players }) {
  return (
    <div className="form-group">
      <label>{label}</label>
      {pick ? (
        <div className="sc-chosen"><strong>{pickName(pick, players)}</strong><button type="button" className="sc-linkbtn" onClick={() => setPick(null)}>change</button></div>
      ) : (
        <PlayerInput options={options} squad={squad} onPick={setPick} placeholder={`${label} name`} />
      )}
    </div>
  );
}

function Openers({ sum, squad, onStart, onBack }) {
  const bp = sum.battingPlayers;
  const fp = sum.fieldingPlayers;
  const [striker, setStriker] = useState(null);
  const [non, setNon] = useState(null);
  const [bowler, setBowler] = useState(null);
  const sk = pickKey(striker, bp);
  const nk = pickKey(non, bp);
  const ok = striker && non && bowler && sk !== nk;
  const notPicked = (...keys) => bp.filter((p) => !keys.includes(p.name.toLowerCase())).map((p) => ({ pid: p.pid, name: p.name }));
  return (
    <Modal title={`${sum.teamName} innings: openers`}>
      <Slot label="Striker" pick={striker} setPick={setStriker} options={notPicked(nk)} squad={squad} players={bp} />
      <Slot label="Non-striker" pick={non} setPick={setNon} options={notPicked(sk)} squad={squad} players={bp} />
      <Slot label="Opening bowler" pick={bowler} setPick={setBowler} options={fp.map((p) => ({ pid: p.pid, name: p.name }))} squad={squad} players={fp} />
      {striker && non && sk === nk && <div className="error-text">Striker and non-striker must be different players.</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" disabled={!ok} onClick={() => onStart(striker, non, bowler)}>Start innings</button>
        <button className="btn btn-secondary" onClick={onBack}>Back</button>
      </div>
    </Modal>
  );
}

const EXTRA_BOXES = [['wd', 'Wide'], ['nb', 'No Ball'], ['b', 'Byes'], ['lb', 'Leg Byes']];
const NO_EXTRAS = { wd: false, nb: false, b: false, lb: false, w: false };

export default function ScorerLive({ initial, serverId, onExit }) {
  const [match, setMatch] = useState(initial);
  const [ex, setEx] = useState(NO_EXTRAS);
  const [squad, setSquad] = useState([]);
  const [moreRuns, setMoreRuns] = useState(7);
  const [modal, setModal] = useState(null);
  const [view, setView] = useState('score');
  const [saveState, setSaveState] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState('');
  const [inRecords, setInRecords] = useState(true);
  const [wk, setWk] = useState(null);
  const [more, setMore] = useState({ view: 'menu', pen: 5, rt: '', ro: '', note: '' });
  const first = useRef(true);

  const last = match.innings.length - 1;
  const cfg = match.config;
  const sum = useMemo(() => E.summarize(match, last), [match]);
  const step = useMemo(() => E.nextStep(match), [match]);
  const tn = (t) => match.teams[t].name;
  const playable = step.kind === 'play' && !sum.needs;

  // ---- autosave after every change (server + a local backup for bad network)
  useEffect(() => {
    if (first.current) { first.current = false; return undefined; }
    if (saved) return undefined;
    try { localStorage.setItem(`cc_scorer_${serverId}`, JSON.stringify(match)); } catch { /* storage full */ }
    setSaveState('saving');
    const t = setTimeout(() => {
      api.scorerSave(serverId, { title: E.matchTitle(match), format: cfg.format, state: match })
        .then(() => setSaveState('saved')).catch(() => setSaveState('offline'));
    }, 600);
    return () => clearTimeout(t);
  }, [match]);

  useEffect(() => { api.getPlayers().then(setSquad).catch(() => {}); }, []);

  const commit = (m) => setMatch(m);
  const push = (ev) => commit(E.addEvent(match, ev));
  // Add any typed-in / squad players to their team first, then record the event with their pids.
  function pushWith(picks, makeEvent) {
    let m = match;
    const pids = picks.map(([team, pick]) => {
      const r = E.withPlayer(m, team, pick);
      m = r.m;
      return r.pid;
    });
    commit(E.addEvent(m, makeEvent(...pids)));
  }

  // KDM-style checkboxes: Wide / No Ball / Byes / Leg Byes / Wicket, then tap the runs.
  const extra = ex.wd ? 'wd' : ex.nb ? 'nb' : ex.b ? 'b' : ex.lb ? 'lb' : undefined;
  const nbOff = ex.nb ? (ex.b ? 'b' : ex.lb ? 'lb' : 'bat') : undefined;
  function toggle(k) {
    const on = !ex[k];
    const next = { ...ex, [k]: on };
    if (on && k === 'wd') Object.assign(next, { nb: false, b: false, lb: false });
    if (on && k === 'nb') next.wd = false;
    if (on && k === 'b') Object.assign(next, { lb: false, wd: false });
    if (on && k === 'lb') Object.assign(next, { b: false, wd: false });
    setEx(next);
  }
  function tap(runs, boundary) {
    if (ex.w) { openWicket(runs); return; }
    push({ t: 'ball', runs, boundary: boundary || undefined, extra, nbOff });
    setEx(NO_EXTRAS);
  }
  function undo() {
    setEx(NO_EXTRAS);
    commit(match.resultOverride ? E.setOverride(match, null) : E.undo(match));
  }
  function openWicket(runs = 0) {
    const allowed = E.allowedWickets(extra, sum.freeHit);
    setWk({ type: allowed[0].key, out: sum.striker, fielder: null, runs, crossed: false });
    setModal('wicket');
  }
  function confirmWicket() {
    const def = E.WICKET_TYPES.find((w) => w.key === wk.type);
    if ((wk.type === 'caught' || wk.type === 'stumped') && !wk.fielder) { setError('Pick the fielder.'); return; }
    setError('');
    const picks = def.fielder && wk.fielder ? [[1 - sum.team, wk.fielder]] : [];
    pushWith(picks, (fielder) => ({
      t: 'ball', runs: def.runs ? wk.runs : 0, extra, nbOff,
      wicket: { type: wk.type, out: def.either ? wk.out : sum.striker, fielder: fielder || null, crossed: wk.type === 'caught' && wk.crossed },
    }));
    setEx(NO_EXTRAS); setModal(null);
  }
  function rename(team, pid, current) {
    const n = prompt('Change player name', current);
    if (n && n.trim()) commit(E.renamePlayer(match, team, pid, n));
  }
  const openMore = () => { setMore({ view: 'menu', pen: 5, rt: sum.target ?? '', ro: sum.limit ?? '', note: '' }); setModal('more'); };
  const closeModal = () => { setModal(null); setError(''); };

  async function finish() {
    const payload = { ...E.buildFinishPayload(match), in_records: inRecords };
    if (payload.batting.length + payload.bowling.length === 0
      && !confirm('None of the players in this match are linked to your squad, so no player stats will be saved. Save the match anyway?')) return;
    setBusy(true); setError('');
    try {
      const { buildPdf } = await import('./pdf.js');
      const blob = buildPdf(match).output('blob');
      const fd = new FormData();
      fd.append('payload', JSON.stringify(payload));
      fd.append('pdf', blob, 'scorecard.pdf');
      const r = await api.scorerFinish(serverId, fd);
      localStorage.removeItem(`cc_scorer_${serverId}`);
      setSaved({ ...r, count: payload.batting.length + payload.bowling.length });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function downloadPdf() {
    const { buildPdf } = await import('./pdf.js');
    buildPdf(match).save(`${E.matchTitle(match).replace(/[^\w ]+/g, '')}.pdf`);
  }

  // ---------- pieces of UI ----------
  const prev = match.innings.slice(0, -1).map((_, k) => {
    const s = E.summarize(match, k);
    return `${s.teamName} ${s.runs}/${s.wickets}${s.declared ? 'd' : ''}`;
  });
  const inningsTitle = cfg.inningsPerSide === 2
    ? `${sum.teamName} ${match.innings.slice(0, last + 1).filter((x) => x.team === sum.team).length === 1 ? '1st' : '2nd'} innings`
    : `${sum.teamName} innings`;
  const striker = sum.batters.find((b) => b.pid === sum.striker);
  const non = sum.batters.find((b) => b.pid === sum.nonStriker);
  const bw = sum.bowlers.find((b) => b.pid === sum.bowler);
  const lastOver = sum.completedOvers[sum.completedOvers.length - 1];
  const saveText = { saving: 'Saving...', saved: 'Saved', offline: 'Offline: kept on this device' }[saveState] || '';
  const reasonText = { allout: 'All out', overs: 'Overs complete', declared: 'Declared', target: 'Target reached', end: 'Innings closed' }[sum.reason] || '';
  const allowed = E.allowedWickets(extra, sum.freeHit);
  const wDef = wk ? E.WICKET_TYPES.find((w) => w.key === wk.type) : null;
  const noZero = (extra === 'b' || extra === 'lb') && !ex.w;
  const noSix = extra === 'wd' || extra === 'b' || extra === 'lb';
  const inMatch = new Set(match.teams.flatMap((t) => t.players.map((p) => p.playerId).filter(Boolean)));
  const freeSquad = squad.filter((p) => !inMatch.has(p.id));
  const fieldTeam = 1 - sum.team;
  const bowlerChoices = (skip) => sum.bowlerOptions.filter((p) => p.pid !== skip)
    .map((p) => ({ pid: p.pid, name: p.name, disabled: !!p.blocked, note: p.blocked || `${p.overs} ov · ${p.runs} runs · ${p.wk} wkts` }));
  const hint = [
    ex.wd && 'Wide', ex.nb && 'No ball', ex.b && 'Byes', ex.lb && 'Leg byes', ex.w && 'Wicket',
  ].filter(Boolean).join(' + ');
  const parts = [...sum.partnerships, ...(sum.partnership ? [{ ...sum.partnership, open: true }] : [])];
  const batName = (pid) => sum.battingPlayers.find((p) => p.pid === pid)?.name || '?';

  return (
    <div className="sc-wrap">
      <div className="sc-topbar">
        <button className="btn btn-secondary btn-sm" onClick={onExit}>← Exit</button>
        <span className="sc-save">{saved ? 'Match saved' : saveText}</span>
        <button className="btn btn-secondary btn-sm" onClick={() => setView(view === 'score' ? 'card' : 'score')}>
          {view === 'score' ? 'Full scorecard' : 'Back to scoring'}
        </button>
      </div>

      <div className="sc-board">
        <div className="sc-board-top">
          <span className="sc-format">{cfg.format}{sum.limit ? ` · ${sum.limit} ov` : ''}</span>
          <span>{inningsTitle}</span>
        </div>
        <div className="sc-teams">{E.matchTitle(match)}</div>
        <div className="sc-score">{sum.runs}<small>/{sum.wickets}</small> <span className="sc-overs">({sum.overs}{sum.limit ? ` / ${sum.limit}` : ''} ov)</span></div>
        <div className="sc-meta">
          CRR {sum.crr.toFixed(2)}
          {sum.target !== null && <> · Target {sum.target}{sum.rrr !== null && <> · RRR {sum.rrr.toFixed(2)}</>}</>}
          {sum.partnership && <> · Partnership {sum.partnership.runs} ({sum.partnership.balls})</>}
        </div>
        {E.situation(match) && <div className="sc-situation">{E.situation(match)}</div>}
        {prev.length > 0 && <div className="sc-prev">{prev.join('  |  ')}</div>}
      </div>

      {view === 'card' && <ScorecardView match={match} />}

      {view === 'score' && sum.opened && !sum.complete && (
        <div className="card sc-crease">
          <table>
            <thead><tr><th>Batsman</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead>
            <tbody>
              {[striker, non].map((b, k) => (b ? (
                <tr key={b.pid} className={k === 0 ? 'sc-on-strike' : ''}><td><strong className="sc-tapname" title="Tap to change name" onClick={() => rename(sum.team, b.pid, b.name)}>{b.name}</strong>{k === 0 ? '*' : ''}</td><td><strong>{b.runs}</strong></td><td>{b.balls}</td><td>{b.fours}</td><td>{b.sixes}</td><td>{b.sr.toFixed(2)}</td></tr>
              ) : null))}
              <tr className="sc-subhead"><th>Bowler</th><th>O</th><th>M</th><th>R</th><th>W</th><th>ER</th></tr>
              {bw && (
                <tr><td><strong className="sc-tapname" title="Tap to change name" onClick={() => rename(fieldTeam, bw.pid, bw.name)}>{bw.name}</strong></td><td>{bw.overs}</td><td>{bw.maidens}</td><td>{bw.runs}</td><td>{bw.wk}</td><td>{bw.econ.toFixed(2)}</td></tr>
              )}
            </tbody>
          </table>
          <div className="sc-chips">
            <span className="sc-small sc-thisover">This over:</span>
            {sum.currentChips.map((c, k) => <span key={k} className={`sc-chip sc-${c.t}`}>{c.label}</span>)}
          </div>
          {lastOver && <div className="sc-small">Last over ({lastOver.bowler}, {lastOver.runs} runs): {lastOver.chips.map((c) => c.label).join(' ')}</div>}
        </div>
      )}

      {view === 'score' && playable && (
        <div className="sc-pad">
          {sum.freeHit && <div className="sc-free">FREE HIT: only run-out type dismissals</div>}
          <div className="card sc-boxes">
            <div className="sc-boxrow">
              {EXTRA_BOXES.map(([k, l]) => (
                <label key={k} className={`sc-box ${ex[k] ? 'on' : ''}`}><input type="checkbox" checked={ex[k]} onChange={() => toggle(k)} /> {l}</label>
              ))}
            </div>
            <div className="sc-boxrow">
              <label className={`sc-box sc-box-w ${ex.w ? 'on' : ''}`}><input type="checkbox" checked={ex.w} onChange={() => toggle('w')} /> Wicket</label>
              <span className="sc-boxbtns">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => { setMore({ ...more, view: 'retire' }); setModal('more'); }}>Retire</button>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => push({ t: 'swap' })}>Swap Batsman</button>
              </span>
            </div>
            {hint && <div className="sc-mode">{hint}: now tap the runs{ex.w ? ' (runs completed on this ball)' : ''}</div>}
          </div>
          <div className="sc-padgrid">
            <div className="card sc-utils">
              <button type="button" className="btn btn-primary btn-sm" onClick={undo}>Undo</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setModal('parts')}>Partnerships</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setModal('extras')}>Extras</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={openMore}>More</button>
            </div>
            <div className="card sc-runs">
              {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                <button key={n} type="button" className={`sc-run ${n === 4 ? 'sc-four' : n === 6 ? 'sc-six' : ''}`}
                  disabled={(noZero && n === 0) || (noSix && n === 6)}
                  onClick={() => tap(n, n === 4 || n === 6 ? n : undefined)}>{n}</button>
              ))}
              <button type="button" className="sc-run" title="More runs" onClick={() => { setMoreRuns(7); setModal('runs'); }}>…</button>
            </div>
          </div>
        </div>
      )}

      {view === 'score' && sum.complete && step.kind !== 'done' && (
        <div className="card sc-break">
          <h3>Innings complete{reasonText ? `: ${reasonText}` : ''}</h3>
          <p><strong>{sum.teamName} {sum.runs}/{sum.wickets}</strong> in {sum.overs} overs</p>
          {E.situation(match) && <p>{E.situation(match)}</p>}
          {step.kind === 'followon' && (
            <>
              <p>{tn(match.battingFirst)} lead by {step.lead} runs. They can enforce the follow-on.</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={() => commit(E.startNext(match, true))}>Enforce follow-on ({tn(1 - match.battingFirst)} bat again)</button>
                <button className="btn btn-secondary" onClick={() => commit(E.startNext(match, false))}>Don't enforce</button>
              </div>
            </>
          )}
          {step.kind === 'next' && (
            <button className="btn btn-primary" onClick={() => commit(E.startNext(match))}>
              Start innings {step.index + 1} ({tn(E.battingTeamOf(match, step.index))} bat)
            </button>
          )}
          <button className="btn btn-secondary" style={{ marginLeft: 8 }} onClick={undo}>Undo last ball</button>
        </div>
      )}

      {view === 'score' && step.kind === 'done' && (
        <div className="card sc-break sc-done">
          <h3>{step.result.text}</h3>
          {!saved && (
            <>
              <p>Saving adds this match to Matches and updates the career stats of <strong>{match.teams[match.meta.ourSide || 0].name}</strong> (your team) players, the leaderboard and the scorecard PDF. Opponent players are not added to career stats.</p>
              <label className="sc-check">
                <input type="checkbox" checked={inRecords} onChange={(e) => setInRecords(e.target.checked)} />
                Count this match in player stats and club record
              </label>
              {!inRecords && <p className="sc-small">It will be saved as a match but will not change any player's stats. You can switch it on later from Admin &gt; Matches.</p>}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={finish} disabled={busy}>{busy ? 'Saving...' : 'Save match & update player stats'}</button>
                <button className="btn btn-secondary" onClick={downloadPdf}>Download PDF</button>
                <button className="btn btn-secondary" onClick={undo}>{match.resultOverride ? 'Cancel this result' : 'Undo last ball'}</button>
              </div>
            </>
          )}
          {saved && (
            <>
              <p className="sc-ok">Saved. {saved.count} player stat row{saved.count === 1 ? '' : 's'} added. The scorecard PDF is attached to the match.</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Link className="btn btn-primary" to={`/matches/${saved.match_id}`}>Open match</Link>
                <button className="btn btn-secondary" onClick={downloadPdf}>Download PDF</button>
                <button className="btn btn-secondary" onClick={onExit}>Back to scorer</button>
              </div>
            </>
          )}
        </div>
      )}
      {error && !modal && <div className="error-text" style={{ margin: '12px 0' }}>{error}</div>}

      {/* ---- required pickers ---- */}
      {view === 'score' && step.kind === 'play' && sum.needs === 'open' && (
        <Openers sum={sum} squad={freeSquad} onBack={() => (last > 0 ? undo() : onExit())}
          onStart={(s, n, b) => pushWith([[sum.team, s], [sum.team, n], [fieldTeam, b]], (striker, nonStriker, bowler) => ({ t: 'open', striker, nonStriker, bowler }))} />
      )}
      {view === 'score' && step.kind === 'play' && sum.needs === 'batter' && (
        <Modal title="New batsman">
          <PlayerInput squad={freeSquad} placeholder="Type batsman name"
            options={sum.available.map((p) => ({ pid: p.pid, name: p.name, note: sum.batters.some((b) => b.pid === p.pid) ? 'returning' : '' }))}
            onPick={(pick) => pushWith([[sum.team, pick]], (pid) => ({ t: 'bat', pid }))} />
          <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={undo}>Undo last ball</button>
        </Modal>
      )}
      {view === 'score' && step.kind === 'play' && sum.needs === 'bowler' && (
        <Modal title={`Over ${Math.floor(sum.legal / (cfg.ballsPerOver || 6)) + 1}: choose bowler`}>
          <PlayerInput squad={freeSquad} placeholder="Type bowler name" options={bowlerChoices(null)}
            onPick={(pick) => pushWith([[fieldTeam, pick]], (pid) => ({ t: 'bowler', pid }))} />
          <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={undo}>Undo last ball</button>
        </Modal>
      )}

      {/* ---- "..." runs, partnerships, extras ---- */}
      {modal === 'runs' && (
        <Modal title="Runs on this ball" onClose={closeModal}>
          <div className="form-group"><input type="number" min="0" max="20" value={moreRuns} onChange={(e) => setMoreRuns(e.target.value)} autoFocus /></div>
          <button className="btn btn-primary" onClick={() => { const n = Math.max(0, Number(moreRuns) || 0); closeModal(); tap(n); }}>OK</button>
        </Modal>
      )}
      {modal === 'parts' && (
        <Modal title="Partnerships" onClose={closeModal}>
          {parts.length === 0 ? <p className="sc-small">No partnership yet.</p> : (
            <table className="sc-mtable">
              <thead><tr><th>Wkt</th><th>Batsmen</th><th>Runs</th><th>Balls</th></tr></thead>
              <tbody>
                {parts.map((p, k) => (
                  <tr key={k}><td>{k + 1}</td><td>{batName(p.a)} &amp; {batName(p.b)}{p.open ? ' *' : ''}</td><td><strong>{p.runs}</strong></td><td>{p.balls}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </Modal>
      )}
      {modal === 'extras' && (
        <Modal title="Extras" onClose={closeModal}>
          <table className="sc-mtable">
            <tbody>
              {[['Byes', sum.extras.b], ['Leg byes', sum.extras.lb], ['Wides', sum.extras.wd], ['No balls', sum.extras.nb], ['Penalty', sum.extras.pen]].map(([l, v]) => (
                <tr key={l}><td>{l}</td><td>{v}</td></tr>
              ))}
              <tr><td><strong>Total</strong></td><td><strong>{sum.extrasTotal}</strong></td></tr>
            </tbody>
          </table>
        </Modal>
      )}

      {/* ---- wicket ---- */}
      {modal === 'wicket' && wk && (
        <Modal title="Wicket" onClose={closeModal}>
          <div className="sc-types">
            {allowed.map((w) => (
              <button key={w.key} type="button" className={`stat-tab ${wk.type === w.key ? 'active' : ''}`} onClick={() => setWk({ ...wk, type: w.key, out: sum.striker })}>{w.label}</button>
            ))}
          </div>
          {wDef.either && (
            <div className="form-group"><label>Who is out?</label>
              <select value={wk.out} onChange={(e) => setWk({ ...wk, out: e.target.value })}>
                <option value={sum.striker}>{striker?.name} (striker)</option>
                <option value={sum.nonStriker}>{non?.name} (non-striker)</option>
              </select></div>
          )}
          {wDef.fielder && (
            <Slot label={`${wk.type === 'stumped' ? 'Wicketkeeper' : 'Fielder'}${wk.type === 'run out' ? ' (optional)' : ''}`}
              pick={wk.fielder} setPick={(f) => setWk({ ...wk, fielder: f })} squad={freeSquad} players={sum.fieldingPlayers}
              options={sum.fieldingPlayers.map((p) => ({ pid: p.pid, name: p.name, note: p.pid === sum.bowler ? 'bowler' : '' }))} />
          )}
          {wDef.runs && (
            <div className="form-group"><label>Runs completed before the run out</label>
              <div className="sc-seg">{[...new Set([0, 1, 2, 3, wk.runs])].sort((a, b) => a - b).map((n) => <button key={n} type="button" className={wk.runs === n ? 'on' : ''} onClick={() => setWk({ ...wk, runs: n })}>{n}</button>)}</div></div>
          )}
          {wk.type === 'caught' && (
            <label className="sc-check"><input type="checkbox" checked={wk.crossed} onChange={(e) => setWk({ ...wk, crossed: e.target.checked })} /> Batters had crossed</label>
          )}
          {error && <div className="error-text">{error}</div>}
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={confirmWicket}>Confirm wicket</button>
        </Modal>
      )}

      {/* ---- more ---- */}
      {modal === 'more' && (
        <Modal title="More" onClose={closeModal}>
          {more.view === 'menu' && (
            <div className="sc-list">
              <button className="sc-pick" onClick={() => setMore({ ...more, view: 'pen' })}>Penalty runs</button>
              <button className="sc-pick" onClick={() => setMore({ ...more, view: 'retire' })}>Retire a batter</button>
              <button className="sc-pick" onClick={() => setMore({ ...more, view: 'bowler' })}>Change bowler mid-over</button>
              {cfg.inningsPerSide === 2 && last < 3 && (
                <button className="sc-pick" onClick={() => { if (confirm('Declare the innings?')) { push({ t: 'declare' }); closeModal(); } }}>Declare innings</button>
              )}
              <button className="sc-pick" onClick={() => { if (confirm(last === E.totalInnings(match) - 1 && cfg.inningsPerSide === 2 ? 'End the final innings now? The match will be a draw if the target is not reached.' : 'Close this innings now (rain / time)?')) { push({ t: 'end' }); closeModal(); } }}>End innings (time / rain)</button>
              {sum.target !== null && cfg.overs && <button className="sc-pick" onClick={() => setMore({ ...more, view: 'revise' })}>Revise target (rain / D-L)</button>}
              <button className="sc-pick" onClick={() => setMore({ ...more, view: 'endmatch' })}>End match: draw / tie / abandoned / result</button>
            </div>
          )}
          {more.view === 'pen' && (
            <>
              <div className="form-group"><label>Penalty runs to {sum.teamName}</label>
                <input type="number" min="1" value={more.pen} onChange={(e) => setMore({ ...more, pen: e.target.value })} /></div>
              <button className="btn btn-primary" onClick={() => { push({ t: 'pen', runs: Math.max(1, Number(more.pen) || 5) }); closeModal(); }}>Add penalty runs</button>
            </>
          )}
          {more.view === 'retire' && (
            <div className="sc-list">
              {[striker, non].map((b) => b && (
                <div key={b.pid} className="sc-retire">
                  <strong>{b.name}</strong>
                  <button className="btn btn-secondary btn-sm" onClick={() => { push({ t: 'retire', pid: b.pid, hurt: true }); closeModal(); }}>Retired hurt (can return)</button>
                  <button className="btn btn-danger btn-sm" onClick={() => { push({ t: 'retire', pid: b.pid, hurt: false }); closeModal(); }}>Retired out</button>
                </div>
              ))}
            </div>
          )}
          {more.view === 'bowler' && (
            <PlayerInput squad={freeSquad} placeholder="Type bowler name" options={bowlerChoices(sum.bowler).map((p) => ({ ...p, disabled: false }))}
              onPick={(pick) => { pushWith([[fieldTeam, pick]], (pid) => ({ t: 'bowler', pid })); closeModal(); }} />
          )}
          {more.view === 'revise' && (
            <>
              <div className="form-row">
                <div className="form-group"><label>Revised target</label><input type="number" value={more.rt} onChange={(e) => setMore({ ...more, rt: e.target.value })} /></div>
                <div className="form-group"><label>Revised overs</label><input type="number" value={more.ro} onChange={(e) => setMore({ ...more, ro: e.target.value })} /></div>
              </div>
              <button className="btn btn-primary" onClick={() => { commit(E.reviseTarget(match, more.rt, more.ro)); closeModal(); }}>Apply</button>
            </>
          )}
          {more.view === 'endmatch' && (
            <>
              <div className="form-group"><label>Result note (optional, e.g. "rain stopped play")</label>
                <input value={more.note} onChange={(e) => setMore({ ...more, note: e.target.value })} /></div>
              <div className="sc-list">
                {[0, 1].map((t) => (
                  <button key={t} className="sc-pick" onClick={() => { commit(E.setOverride(match, { type: 'win', winner: t, text: more.note || `${tn(t)} won` })); closeModal(); }}>{tn(t)} won</button>
                ))}
                <button className="sc-pick" onClick={() => { commit(E.setOverride(match, { type: 'draw', winner: null, text: more.note || 'Match drawn' })); closeModal(); }}>Draw</button>
                <button className="sc-pick" onClick={() => { commit(E.setOverride(match, { type: 'tie', winner: null, text: more.note || 'Match tied' })); closeModal(); }}>Tied</button>
                <button className="sc-pick" onClick={() => { commit(E.setOverride(match, { type: 'noresult', winner: null, text: more.note || 'No result' })); closeModal(); }}>Abandoned / no result</button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
