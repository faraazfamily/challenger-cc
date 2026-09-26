import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { PlayerAvatar } from '../components/PlayerCard';

const ROWS = [
  { key: 'runs', label: 'Runs', higher: true, pick: (p) => p.career.batting.runs },
  { key: 'batAvg', label: 'Batting Average', higher: true, pick: (p) => p.career.batting.average },
  { key: 'sr', label: 'Strike Rate', higher: true, pick: (p) => p.career.batting.strikeRate },
  { key: 'hs', label: 'Highest Score', higher: true, pick: (p) => p.career.batting.highestScore },
  { key: 'wkts', label: 'Wickets', higher: true, pick: (p) => p.career.bowling.wickets },
  { key: 'bowlAvg', label: 'Bowling Average', higher: false, pick: (p) => p.career.bowling.average },
  { key: 'econ', label: 'Economy', higher: false, pick: (p) => p.career.bowling.economy },
  { key: 'field', label: 'Fielding', higher: true, pick: (p) => fieldingLevel(p.fielding_notes).rank, show: (p) => fieldingLevel(p.fielding_notes).label },
];

function fieldingLevel(notes) {
  const text = (notes || '').toLowerCase();
  if (!text) return { label: 'Not rated', rank: 0 };
  if (/best|excellent|outstanding/.test(text)) return { label: 'Excellent', rank: 4 };
  if (/good|strong|safe/.test(text)) return { label: 'Good', rank: 3 };
  if (/average|decent|okay/.test(text)) return { label: 'Average', rank: 2 };
  if (/poor|weak|bad/.test(text)) return { label: 'Poor', rank: 1 };
  return { label: notes, rank: 2 };
}

function asNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function leader(row, a, b) {
  const na = asNumber(row.pick(a));
  const nb = asNumber(row.pick(b));
  if (na == null && nb == null) return null;
  if (na == null) return 'b';
  if (nb == null) return 'a';
  if (na === nb) return null;
  if (row.higher) return na > nb ? 'a' : 'b';
  return na < nb ? 'a' : 'b';
}

function CompareColumn({ player, other }) {
  return (
    <div className="card compare-side">
      <PlayerAvatar player={player} className="compare-avatar" />
      {player.jersey_number ? <div className="jersey-badge">{player.jersey_number}</div> : null}
      <h3 style={{ margin: '8px 0 4px' }}>{player.name}</h3>
      <span className="role-tag">{player.role}</span>
      {player.is_wicketkeeper && <div className="captain-badge">Wicketkeeper</div>}
      {ROWS.map((row) => {
        const lead = leader(row, player, other);
        const wins = lead === 'a';
        return (
          <div key={row.key} className={`compare-stat ${wins ? 'compare-lead' : ''}`}>
            <span>{row.label}</span>
            <strong>{row.show ? row.show(player) : row.pick(player)}</strong>
          </div>
        );
      })}
    </div>
  );
}

function Verdict({ a, b }) {
  let aWins = 0;
  let bWins = 0;
  ROWS.forEach((row) => {
    const lead = leader(row, a, b);
    if (lead === 'a') aWins += 1;
    if (lead === 'b') bWins += 1;
  });
  let text = 'Too close to call. They are level overall.';
  let who = '';
  if (aWins > bWins) {
    who = a.name;
    text = `${a.name} is ahead overall, ${aWins}–${bWins}.`;
  } else if (bWins > aWins) {
    who = b.name;
    text = `${b.name} is ahead overall, ${bWins}–${aWins}.`;
  }
  return (
    <div className="verdict">
      <span>Overall</span>
      <strong>{who || 'Level'}</strong>
      <p>{text} Fielding uses the note on each player: poor, average, good, or excellent.</p>
    </div>
  );
}

export default function MemberDashboard() {
  const navigate = useNavigate();
  const [player, setPlayer] = useState(null);
  const [squad, setSquad] = useState([]);
  const [compareId, setCompareId] = useState('');
  const [other, setOther] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const raw = localStorage.getItem('cc_member');
    if (!raw) {
      navigate('/member-login');
      return;
    }
    let member;
    try {
      member = JSON.parse(raw);
    } catch {
      navigate('/member-login');
      return;
    }
    api.getPlayer(member.id).then(setPlayer).catch(async () => {
      if (!member.name) {
        localStorage.removeItem('cc_member');
        navigate('/member-login');
        return;
      }
      try {
        const found = await api.memberLogin(member.name);
        localStorage.setItem('cc_member', JSON.stringify({ id: found.id, name: found.name }));
        setPlayer(found);
      } catch {
        localStorage.removeItem('cc_member');
        navigate('/member-login');
      }
    });
    api.getPlayers().then(setSquad).catch(() => {});
  }, [navigate]);

  useEffect(() => {
    if (!compareId || !player) {
      setOther(null);
      return;
    }
    let cancelled = false;
    Promise.all([api.getPlayer(player.id), api.getPlayer(compareId)])
      .then(([me, teammate]) => {
        if (cancelled) return;
        setPlayer(me);
        setOther(teammate);
      })
      .catch((e) => setError(e.message));
    return () => { cancelled = true; };
  }, [compareId]);

  function logout() {
    localStorage.removeItem('cc_member');
    navigate('/member-login');
  }

  if (error) return <div className="container section empty-state">{error}</div>;
  if (!player) return <div className="container section empty-state">Loading...</div>;

  const others = squad.filter((p) => p.id !== player.id);

  return (
    <div className="container section">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn btn-secondary" type="button" onClick={logout}>Log out</button>
      </div>
      <h2>Compare with a teammate</h2>
      <div className="form-group" style={{ maxWidth: 360 }}>
        <label style={{ color: '#d5e2f0' }}>Pick someone, for example Asad</label>
        <select value={compareId} onChange={(e) => setCompareId(e.target.value)}>
          <option value="">Select a player</option>
          {others.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>
      {other ? (
        <>
        <Verdict a={player} b={other} />
        <div className="compare-stage">
          <CompareColumn player={player} other={other} side="a" />
          <div className="compare-vs">VS</div>
          <CompareColumn player={other} other={player} side="b" />
        </div>
        </>
      ) : (
        <div className="empty-state">Choose a teammate above to see both players side by side.</div>
      )}
    </div>
  );
}
