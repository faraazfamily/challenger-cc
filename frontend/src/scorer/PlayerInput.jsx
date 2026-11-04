import { useState } from 'react';

// KDM-style player box: a compact dropdown with the players already in this match, the squad
// and "+ Add" for a typed name. Typing filters it; arrow keys + Enter pick.
// `alwaysOpen` keeps the list showing (bowler / new batsman popups, where picking is the job);
// otherwise it opens when the box is focused.
// onPick gets { pid } | { playerId, name } | { name }.
export default function PlayerInput({ options = [], squad = [], onPick, placeholder = 'Type player name', alwaysOpen = false }) {
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);
  const [hi, setHi] = useState(-1); // highlighted row, -1 = none
  const t = q.trim().toLowerCase();
  const shown = options.filter((p) => !t || p.name.toLowerCase().includes(t));
  const sq = squad.filter((p) => !t || p.name.toLowerCase().includes(t)).slice(0, 40);
  const exact = [...options, ...squad].some((p) => p.name.toLowerCase() === t);

  // One flat list so the arrow keys walk through every section.
  const items = [
    ...shown.map((p) => ({ key: p.pid, group: 'match', label: p.name, note: p.note, disabled: !!p.disabled, value: { pid: p.pid } })),
    ...sq.map((p) => ({ key: `s${p.id}`, group: 'squad', label: p.name, value: { playerId: p.id, name: p.name } })),
    ...(t && !exact ? [{ key: 'new', group: 'new', label: `+ Add "${q.trim()}"`, note: 'new player', value: { name: q.trim() } }] : []),
  ];
  const usable = items.filter((x) => !x.disabled);
  const open = alwaysOpen || focused;

  const pick = (v) => { setQ(''); setHi(-1); onPick(v); };

  function key(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!usable.length) return;
      const n = usable.length;
      setHi((h) => (e.key === 'ArrowDown' ? (h + 1) % n : (h <= 0 ? n - 1 : h - 1)));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // highlighted row, else an exact name, else add what was typed
      const hit = usable[hi] || usable.find((x) => x.label.toLowerCase() === t);
      if (hit) pick(hit.value);
      else if (t) pick({ name: q.trim() });
    } else if (e.key === 'Escape') {
      setQ('');
      e.currentTarget.blur();
    }
  }

  const heading = { match: 'In this match', squad: 'Squad', new: '' };
  let lastGroup = null;

  return (
    <div className={`sc-pin ${open ? 'open' : ''}`}>
      <div className="sc-pin-box">
        <input value={q} placeholder={placeholder} autoComplete="off"
          onChange={(e) => { setQ(e.target.value); setHi(-1); }} onKeyDown={key}
          onFocus={() => setFocused(true)} onClick={() => setFocused(true)} onBlur={() => setFocused(false)} />
        {!alwaysOpen && <span className="sc-pin-caret" aria-hidden="true">▾</span>}
      </div>
      {open && (
        <div className="sc-drop" role="listbox">
          {items.length === 0 && <div className="sc-drop-empty">{t ? 'No match' : 'Type a name to add a player'}</div>}
          {items.map((x) => {
            const head = x.group !== lastGroup && heading[x.group];
            lastGroup = x.group;
            const active = !x.disabled && usable[hi] === x;
            return (
              <div key={x.key}>
                {head && <div className="sc-drop-head">{head}</div>}
                <button type="button" role="option" aria-selected={active} disabled={x.disabled}
                  className={`sc-drop-item ${active ? 'hi' : ''} ${x.group === 'new' ? 'new' : ''}`}
                  // mousedown, not click: picking must happen before the input's blur closes the list
                  onMouseDown={(e) => { e.preventDefault(); if (!x.disabled) pick(x.value); }}>
                  <span>{x.label}</span>
                  {x.note && <span className="sc-drop-note">{x.note}</span>}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
