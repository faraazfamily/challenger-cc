import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { PlayerAvatar } from './PlayerCard';

// A dropdown of players with photos and search. A popover on desktop, a bottom sheet on phones,
// so it never fights the phone's keyboard or runs off the screen like a native <select> list.
export default function PlayerPicker({ label, players, value, disabledId, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const boxRef = useRef(null);
  const searchRef = useRef(null);
  const selected = players.find((p) => String(p.id) === String(value));
  const t = q.trim().toLowerCase();
  const list = players.filter((p) => !t || p.name.toLowerCase().includes(t));

  useEffect(() => {
    if (!open) return undefined;
    setQ('');
    // on a phone, opening the keyboard straight away would cover half the list
    if (window.matchMedia('(min-width: 721px)').matches) setTimeout(() => searchRef.current?.focus(), 30);
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  function pick(p) {
    onChange(String(p.id));
    setOpen(false);
  }

  return (
    <div className="picker" ref={boxRef}>
      <span className="picker-label">{label}</span>
      <button type="button" className={`picker-trigger ${selected ? 'filled' : ''}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {selected ? <PlayerAvatar player={selected} className="picker-avatar" size={96} /> : <span className="picker-avatar empty" aria-hidden="true">?</span>}
        <span className="picker-name">{selected ? selected.name : 'Select'}</span>
        <ChevronDown size={18} className={`picker-chev ${open ? 'up' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <>
          <div className="picker-scrim" onClick={() => setOpen(false)} />
          <div className="picker-pop" role="listbox" aria-label={label}>
            <div className="picker-handle" aria-hidden="true" />
            <div className="picker-title">{label}</div>
            <label className="search-box picker-search">
              <Search size={16} aria-hidden="true" />
              <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search player" aria-label="Search player" />
            </label>
            <div className="picker-list">
              {list.length === 0 && <div className="picker-none">No player found</div>}
              {list.map((p) => {
                const isOn = String(p.id) === String(value);
                const isOther = String(p.id) === String(disabledId);
                return (
                  <button key={p.id} type="button" role="option" aria-selected={isOn} disabled={isOther}
                    className={`picker-item ${isOn ? 'on' : ''}`} onClick={() => pick(p)}>
                    <PlayerAvatar player={p} className="picker-avatar" size={96} />
                    <span className="picker-item-text">
                      <strong>{p.name}</strong>
                      <span>{isOther ? 'Already picked' : p.role}</span>
                    </span>
                    {isOn && <Check size={18} aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
