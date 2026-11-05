import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Swords, RotateCw } from 'lucide-react';
import { api } from '../api';
import { PlayerAvatar } from '../components/PlayerCard';
import { SkeletonStage, SkeletonRows, EmptyState } from '../components/Feedback';
import { CountUp } from '../motion';

const bat = (p) => p.career?.batting || {};
const bowl = (p) => p.career?.bowling || {};
const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

// Counting stats (runs, wickets, highest) compare as they are: 0 is a real total.
// Rate stats only mean something when the player has actually batted / bowled, so they
// need both players to have data; otherwise nobody gets the point and "—" is shown.
// (A player who never bowled has economy 0.00 in the data, which used to "win".)
const ROWS = [
  { key: 'runs', label: 'Runs', higher: true, pick: (p) => bat(p).runs },
  { key: 'hs', label: 'Highest score', higher: true, pick: (p) => bat(p).highestScore },
  { key: 'batAvg', label: 'Batting average', higher: true, rate: true, pick: (p) => bat(p).average, has: (p) => bat(p).innings > 0, none: 'Did not bat' },
  { key: 'sr', label: 'Strike rate', higher: true, rate: true, pick: (p) => bat(p).strikeRate, has: (p) => bat(p).innings > 0, none: 'Did not bat' },
  { key: 'wkts', label: 'Wickets', higher: true, pick: (p) => bowl(p).wickets },
  { key: 'econ', label: 'Economy', higher: false, rate: true, pick: (p) => bowl(p).economy, has: (p) => bowl(p).innings > 0 && num(bowl(p).overs) > 0, none: 'Did not bowl' },
  { key: 'bowlAvg', label: 'Bowling average', higher: false, rate: true, pick: (p) => bowl(p).average, has: (p) => bowl(p).wickets > 0, none: 'No wickets' },
  { key: 'field', label: 'Fielding', higher: true, rate: true, pick: (p) => fieldingLevel(p.fielding_notes).rank, has: (p) => fieldingLevel(p.fielding_notes).rank > 0, show: (p) => fieldingLevel(p.fielding_notes).label, none: 'Not rated' },
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

// One row: who leads ('a' | 'b' | null), what to show, and how wide each side of the bar is.
function compareRow(row, a, b) {
  const okA = row.has ? row.has(a) : true;
  const okB = row.has ? row.has(b) : true;
  const va = num(row.pick(a)) ?? 0;
  const vb = num(row.pick(b)) ?? 0;
  const label = (p, ok) => (!ok ? row.none : row.show ? row.show(p) : row.pick(p) ?? 0);
  const out = { showA: label(a, okA), showB: label(b, okB), lead: null, share: 50, compared: okA && okB };
  if (!out.compared) return out;
  if (va !== vb) out.lead = (row.higher ? va > vb : va < vb) ? 'a' : 'b';
  const sa = row.higher ? va : vb; // lower is better: the other player's number is this side's "strength"
  const sb = row.higher ? vb : va;
  out.share = sa + sb > 0 ? Math.round((sa / (sa + sb)) * 100) : 50;
  return out;
}

function Duel({ me, other }) {
  const rows = ROWS.map((r) => ({ ...r, ...compareRow(r, me, other) }));
  const aWins = rows.filter((r) => r.lead === 'a').length;
  const bWins = rows.filter((r) => r.lead === 'b').length;
  const verdict = aWins === bWins ? 'Level overall' : `${aWins > bWins ? me.name : other.name} is ahead`;
  return (
    <div className="duel" key={other.id}>
      <div className="duel-head">
        <div className={`duel-player ${aWins > bWins ? 'ahead' : ''}`}>
          <PlayerAvatar player={me} className="duel-avatar" />
          <strong>{me.name}</strong>
          <span>{me.role}</span>
        </div>
        <div className="duel-score">
          <span className="duel-points"><b><CountUp value={aWins} /></b><i>–</i><b><CountUp value={bWins} /></b></span>
          <span className="duel-verdict">{verdict}</span>
        </div>
        <div className={`duel-player right ${bWins > aWins ? 'ahead' : ''}`}>
          <PlayerAvatar player={other} className="duel-avatar" />
          <strong>{other.name}</strong>
          <span>{other.role}</span>
        </div>
      </div>

      <div className="duel-rows">
        {rows.map((r, i) => (
          <div key={r.key} className={`duel-row ${r.compared ? '' : 'off'}`} style={{ '--i': i, '--share': `${r.share}%` }}>
            <div className="duel-values">
              <span className={r.lead === 'a' ? 'win' : ''}>{r.showA}</span>
              <em>{r.label}</em>
              <span className={r.lead === 'b' ? 'win' : ''}>{r.showB}</span>
            </div>
            <div className="duel-bar" aria-hidden="true">
              <span className={`a ${r.lead === 'a' ? 'win' : ''}`} />
              <span className={`b ${r.lead === 'b' ? 'win' : ''}`} />
            </div>
            {!r.compared && <div className="duel-note">Not compared: needs data for both players</div>}
          </div>
        ))}
      </div>
      <p className="duel-foot">Points only count where both players have numbers. Fielding uses the note on each player: poor, average, good or excellent.</p>
    </div>
  );
}

export default function MemberDashboard() {
  const navigate = useNavigate();
  const [player, setPlayer] = useState(null);
  const [squad, setSquad] = useState([]);
  const [compareId, setCompareId] = useState('');
  const [other, setOther] = useState(null);
  const [compareError, setCompareError] = useState('');
  const [retry, setRetry] = useState(0);

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
    setCompareError('');
    Promise.all([api.getPlayer(player.id), api.getPlayer(compareId)])
      .then(([me, teammate]) => {
        if (cancelled) return;
        setPlayer(me);
        setOther(teammate);
      })
      // keep the page; just say this comparison did not load and offer a retry
      .catch((e) => { if (!cancelled) setCompareError(e.message || 'Could not load this player'); });
    return () => { cancelled = true; };
  }, [compareId, retry]);

  function logout() {
    localStorage.removeItem('cc_member');
    navigate('/member-login');
  }

  if (!player) return <SkeletonStage />;

  const others = squad.filter((p) => p.id !== player.id);

  return (
    <div className="container section">
      <div className="member-head">
        <PlayerAvatar player={player} className="member-avatar" size={96} />
        <div>
          <span className="member-hi">Welcome back</span>
          <h2>{player.name}</h2>
        </div>
        <button className="btn btn-secondary btn-sm btn-icon" type="button" onClick={logout}><LogOut size={15} aria-hidden="true" /> Log out</button>
      </div>

      <h3 className="pick-title"><Swords size={20} aria-hidden="true" /> Compare with a teammate</h3>
      {/* tap a face instead of a native dropdown: scrolls sideways on a phone */}
      <div className="mate-strip" role="listbox" aria-label="Pick a teammate">
        {others.map((p, i) => (
          <button key={p.id} type="button" role="option" aria-selected={String(p.id) === String(compareId)}
            className={`mate ${String(p.id) === String(compareId) ? 'on' : ''}`} style={{ '--i': i }}
            onClick={() => setCompareId(String(p.id) === String(compareId) ? '' : String(p.id))}>
            <PlayerAvatar player={p} className="mate-avatar" size={96} />
            <span>{p.name}</span>
          </button>
        ))}
      </div>

      {compareError && (
        <div className="inline-error" role="alert">
          <span>{compareError}. Check your connection and try again.</span>
          <button type="button" className="btn btn-secondary btn-sm btn-icon" onClick={() => setRetry((n) => n + 1)}><RotateCw size={14} aria-hidden="true" /> Try again</button>
        </div>
      )}
      {other && String(other.id) === String(compareId) ? <Duel me={player} other={other} /> : compareId && !compareError ? <SkeletonRows rows={4} /> : (
        <EmptyState icon={Swords} title="Pick a teammate">Tap a face above to see who is ahead, stat by stat.</EmptyState>
      )}
    </div>
  );
}
