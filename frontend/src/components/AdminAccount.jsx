import { useState } from 'react';
import { Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react';
import { api } from '../api';
import { useDialog } from './Dialog';

function tokenUsername() {
  try {
    const token = localStorage.getItem('cc_token') || '';
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).username || '';
  } catch {
    return '';
  }
}

// The same rules the server enforces (auth.go), shown live while typing.
const RULES = [
  ['At least 8 characters', (p) => p.length >= 8],
  ['A capital letter', (p) => /[A-Z]/.test(p)],
  ['A small letter', (p) => /[a-z]/.test(p)],
  ['A number', (p) => /[0-9]/.test(p)],
];

function PasswordField({ label, value, onChange, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <div className="form-group">
      <label>{label}</label>
      <div className="pw-field">
        <input type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} />
        <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'}>
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  );
}

export default function AdminAccount() {
  const { toast } = useDialog();
  const [username, setUsername] = useState(tokenUsername());
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const passed = RULES.filter(([, ok]) => ok(next)).length;
  const changingPassword = next.length > 0;

  async function save(e) {
    e.preventDefault();
    setError('');
    if (changingPassword && passed < RULES.length) { setError('The new password does not meet all the rules.'); return; }
    if (changingPassword && next !== repeat) { setError('The two new passwords do not match.'); return; }
    setBusy(true);
    try {
      const res = await api.changeCredentials({ current_password: current, new_username: username.trim(), new_password: next });
      localStorage.setItem('cc_token', res.token); // older tokens on every device stop working
      setUsername(res.username);
      setCurrent(''); setNext(''); setRepeat('');
      toast('Saved. Other devices have been logged out.', 'success', 4500);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="account-wrap">
      <form className="card account-card" onSubmit={save} autoComplete="off">
        <div className="account-head">
          <span className="login-icon"><KeyRound size={24} aria-hidden="true" /></span>
          <div>
            <h3>Login details</h3>
            <p>Change your username or password. Your current password is always needed.</p>
          </div>
        </div>

        <div className="form-group">
          <label>Username</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
        </div>
        <PasswordField label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" />
        <PasswordField label="New password (leave empty to keep it)" value={next} onChange={setNext} autoComplete="new-password" />
        {changingPassword && (
          <>
            <div className="pw-meter" aria-hidden="true"><span style={{ width: `${(passed / RULES.length) * 100}%` }} className={passed === RULES.length ? 'ok' : ''} /></div>
            <ul className="pw-rules">
              {RULES.map(([text, ok]) => <li key={text} className={ok(next) ? 'ok' : ''}>{text}</li>)}
            </ul>
            <PasswordField label="Repeat new password" value={repeat} onChange={setRepeat} autoComplete="new-password" />
          </>
        )}
        {error && <div className="error-text" role="alert">{error}</div>}
        <button className="btn btn-primary account-save" type="submit" disabled={busy || !current}>{busy ? 'Saving...' : 'Save changes'}</button>
        <p className="account-note"><ShieldCheck size={15} aria-hidden="true" /> After saving, every other device is logged out automatically.</p>
      </form>
    </div>
  );
}
