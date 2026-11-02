import { useState } from 'react';

// KDM-style player box: shows the players already in this match, filters them as you type,
// suggests squad members, or adds the typed name as a new player.
// onPick gets { pid } | { playerId, name } | { name }.
export default function PlayerInput({ options = [], squad = [], onPick, placeholder = 'Type player name' }) {
  const [q, setQ] = useState('');
  const t = q.trim().toLowerCase();
  const shown = options.filter((p) => !t || p.name.toLowerCase().includes(t));
  const sq = t ? squad.filter((p) => p.name.toLowerCase().includes(t)).slice(0, 6) : [];
  const exact = [...options, ...squad].some((p) => p.name.toLowerCase() === t);
  const pick = (c) => { setQ(''); onPick(c); };

  function enter(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const hit = shown.find((p) => !p.disabled && p.name.toLowerCase() === t) || sq.find((p) => p.name.toLowerCase() === t);
    if (hit) pick(hit.pid ? { pid: hit.pid } : { playerId: hit.id, name: hit.name });
    else if (t) pick({ name: q.trim() });
  }

  return (
    <div className="sc-pin">
      <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={enter} placeholder={placeholder} />
      <div className="sc-list">
        {shown.map((p) => (
          <button key={p.pid} type="button" className="sc-pick" disabled={!!p.disabled} onClick={() => pick({ pid: p.pid })}>
            <span>{p.name}</span>
            {p.note && <span className="sc-small">{p.note}</span>}
          </button>
        ))}
        {sq.map((p) => (
          <button key={`s${p.id}`} type="button" className="sc-pick" onClick={() => pick({ playerId: p.id, name: p.name })}>
            <span>{p.name}</span><span className="sc-small">squad</span>
          </button>
        ))}
        {t && !exact && (
          <button type="button" className="sc-pick sc-pick-new" onClick={() => pick({ name: q.trim() })}>
            <span>+ Add &quot;{q.trim()}&quot;</span><span className="sc-small">new player</span>
          </button>
        )}
      </div>
    </div>
  );
}
