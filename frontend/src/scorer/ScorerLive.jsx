import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import * as E from './engine';
import ScorecardView from './ScorecardView';

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

function Openers({ sum, onStart, onBack }) {
  const bp = sum.battingPlayers;
  const [striker, setStriker] = useState(bp[0]?.pid || '');
  const [non, setNon] = useState(bp[1]?.pid || '');
  const [bowler, setBowler] = useState('');
  const ok = striker && non && striker !== non && bowler;
  return (
    <Modal title={`${sum.teamName} innings: openers`}>
      <div className="form-group"><label>Striker</label>
        <select value={striker} onChange={(e) => setStriker(e.target.value)}>{bp.map((p) => <option key={p.pid} value={p.pid}>{p.name}</option>)}</select></div>
      <div className="form-group"><label>Non-striker</label>
        <select value={non} onChange={(e) => setNon(e.target.value)}>{bp.map((p) => <option key={p.pid} value={p.pid}>{p.name}</option>)}</select></div>
      <div className="form-group"><label>Opening bowler</label>
        <select value={bowler} onChange={(e) => setBowler(e.target.value)}>
          <option value="">Select bowler</option>
          {sum.fieldingPlayers.map((p) => <option key={p.pid} value={p.pid}>{p.name}</option>)}</select></div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" disabled={!ok} onClick={() => onStart({ t: 'open', striker, nonStriker: non, bowler })}>Start innings</button>
        <button className="btn btn-secondary" onClick={onBack}>Back</button>
      </div>
    </Modal>
  );
}

export default function ScorerLive({ initial, serverId, onExit }) {
  const [match, setMatch] = useState(initial);
  const [mode, setMode] = useState(null);
  const [nbOff, setNbOff] = useState('bat');
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

  const commit = (m) => setMatch(m);
  const push = (ev) => commit(E.addEvent(match, ev));

  function score(runs, boundary) {
    push({ t: 'ball', runs, boundary: boundary || undefined, extra: mode || undefined, nbOff: mode === 'nb' ? nbOff : undefined });
    setMode(null); setNbOff('bat');
  }
  function undo() {
    setMode(null);
    commit(match.resultOverride ? E.setOverride(match, null) : E.undo(match));
  }
  function openWicket() {
    const allowed = E.allowedWickets(mode, sum.freeHit);
    setWk({ type: allowed[0].key, out: sum.striker, fielder: '', runs: 0, crossed: false });
    setModal('wicket');
  }
  function confirmWicket() {
    const def = E.WICKET_TYPES.find((w) => w.key === wk.type);
    if ((wk.type === 'caught' || wk.type === 'stumped') && !wk.fielder) { setError('Pick the fielder.'); return; }
    setError('');
    push({
      t: 'ball', runs: def.runs ? wk.runs : 0, extra: mode || undefined, nbOff: mode === 'nb' ? nbOff : undefined,
      wicket: { type: wk.type, out: def.either ? wk.out : sum.striker, fielder: wk.fielder || null, crossed: wk.type === 'caught' && wk.crossed },
    });
    setMode(null); setNbOff('bat'); setModal(null);
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
  const allowed = E.allowedWickets(mode, sum.freeHit);
  const wDef = wk ? E.WICKET_TYPES.find((w) => w.key === wk.type) : null;
  const runButtons = [0, 1, 2, 3];
  const noZero = mode === 'b' || mode === 'lb';

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
            <thead><tr><th>Batter</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead>
            <tbody>
              {[striker, non].map((b, k) => (b ? (
                <tr key={b.pid}><td><strong style={{ cursor: 'pointer', textDecoration: 'underline dotted' }} title="Tap to change name" onClick={() => rename(sum.team, b.pid, b.name)}>{b.name}</strong>{k === 0 ? ' *' : ''}</td><td><strong>{b.runs}</strong></td><td>{b.balls}</td><td>{b.fours}</td><td>{b.sixes}</td><td>{b.sr.toFixed(0)}</td></tr>
              ) : null))}
            </tbody>
          </table>
          {bw && <div className="sc-bowler"><strong style={{ cursor: 'pointer', textDecoration: 'underline dotted' }} title="Tap to change name" onClick={() => rename(1 - sum.team, bw.pid, bw.name)}>{bw.name}</strong> {bw.overs}-{bw.maidens}-{bw.runs}-{bw.wk}</div>}
          <div className="sc-chips">
            {sum.currentChips.length === 0 && <span className="sc-small">New over</span>}
            {sum.currentChips.map((c, k) => <span key={k} className={`sc-chip sc-${c.t}`}>{c.label}</span>)}
          </div>
          {lastOver && <div className="sc-small">Last over ({lastOver.bowler}, {lastOver.runs} runs): {lastOver.chips.map((c) => c.label).join(' ')}</div>}
        </div>
      )}

      {view === 'score' && playable && (
        <div className="sc-pad">
          {sum.freeHit && <div className="sc-free">FREE HIT: only run-out type dismissals</div>}
          {mode && <div className="sc-mode">{{ wd: 'Wide: tap the extra runs run', nb: 'No-ball: tap the runs', b: 'Byes: tap the runs', lb: 'Leg byes: tap the runs' }[mode]}</div>}
          {mode === 'nb' && (
            <div className="sc-seg">
              {[['bat', 'Off the bat'], ['b', 'Byes'], ['lb', 'Leg byes']].map(([k, l]) => (
                <button key={k} type="button" className={nbOff === k ? 'on' : ''} onClick={() => setNbOff(k)}>{l}</button>
              ))}
            </div>
          )}
          <div className="sc-keys">
            {runButtons.map((n) => <button key={n} className="sc-key" disabled={noZero && n === 0} onClick={() => score(n)}>{n}</button>)}
            <button className="sc-key sc-four" onClick={() => score(4, 4)}>4</button>
            <button className="sc-key" onClick={() => score(5)}>5</button>
            <button className="sc-key sc-six" disabled={mode === 'wd' || mode === 'b' || mode === 'lb'} onClick={() => score(6, 6)}>6</button>
            <button className="sc-key sc-wkt" onClick={openWicket}>OUT</button>
            {[['wd', 'Wide'], ['nb', 'No ball'], ['b', 'Bye'], ['lb', 'Leg bye']].map(([k, l]) => (
              <button key={k} className={`sc-key sc-ex ${mode === k ? 'on' : ''}`} onClick={() => { setMode(mode === k ? null : k); setNbOff('bat'); }}>{l}</button>
            ))}
            <button className="sc-key sc-util" onClick={undo}>Undo</button>
            <button className="sc-key sc-util" onClick={() => push({ t: 'swap' })}>Swap</button>
            <button className="sc-key sc-util" onClick={openMore}>More</button>
            <button className="sc-key sc-util" onClick={() => setView('card')}>Card</button>
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
        <Openers sum={sum} onStart={push} onBack={() => (last > 0 ? undo() : onExit())} />
      )}
      {view === 'score' && step.kind === 'play' && sum.needs === 'batter' && (
        <Modal title="New batter">
          <div className="sc-list">
            {sum.available.map((p) => (
              <button key={p.pid} className="sc-pick" onClick={() => push({ t: 'bat', pid: p.pid })}>
                {p.name}{sum.batters.some((b) => b.pid === p.pid) ? ' (returning)' : ''}
              </button>
            ))}
          </div>
          <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={undo}>Undo last ball</button>
        </Modal>
      )}
      {view === 'score' && step.kind === 'play' && sum.needs === 'bowler' && (
        <Modal title={`Over ${Math.floor(sum.legal / (cfg.ballsPerOver || 6)) + 1}: choose bowler`}>
          <div className="sc-list">
            {sum.bowlerOptions.map((p) => (
              <button key={p.pid} className="sc-pick" disabled={!!p.blocked} onClick={() => push({ t: 'bowler', pid: p.pid })}>
                <span>{p.name}</span>
                <span className="sc-small">{p.blocked || `${p.overs} ov · ${p.runs} runs · ${p.wk} wkts`}</span>
              </button>
            ))}
          </div>
          <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={undo}>Undo last ball</button>
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
            <div className="form-group"><label>{wk.type === 'stumped' ? 'Wicketkeeper' : 'Fielder'}</label>
              <select value={wk.fielder} onChange={(e) => setWk({ ...wk, fielder: e.target.value })}>
                <option value="">{wk.type === 'run out' ? 'Select (optional)' : 'Select'}</option>
                {sum.fieldingPlayers.map((p) => <option key={p.pid} value={p.pid}>{p.name}{p.pid === sum.bowler ? ' (bowler)' : ''}</option>)}
              </select></div>
          )}
          {wDef.runs && (
            <div className="form-group"><label>Runs completed before the run out</label>
              <div className="sc-seg">{[0, 1, 2, 3].map((n) => <button key={n} type="button" className={wk.runs === n ? 'on' : ''} onClick={() => setWk({ ...wk, runs: n })}>{n}</button>)}</div></div>
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
            <div className="sc-list">
              {sum.bowlerOptions.filter((p) => p.pid !== sum.bowler).map((p) => (
                <button key={p.pid} className="sc-pick" onClick={() => { push({ t: 'bowler', pid: p.pid }); closeModal(); }}>{p.name}<span className="sc-small">{p.overs} ov</span></button>
              ))}
            </div>
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
