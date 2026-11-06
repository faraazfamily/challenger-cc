import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { api } from '../api';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const expired = useSearchParams()[0].get('expired') === '1';

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const res = await api.login(username, password);
      localStorage.setItem('cc_token', res.token);
      navigate('/admin');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="container">
      <form className="card login-box" onSubmit={handleSubmit}>
        <span className="login-icon"><ShieldCheck size={26} aria-hidden="true" /></span>
        <h2>Admin Login</h2>
        {expired && <div className="review-note">Your login expired. Please log in again.</div>}
        <div className="form-group">
          <label>Username</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" required />
        </div>
        <div className="form-group">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </div>
        {error && <div className="error-text">{error}</div>}
        <button className="btn btn-primary" type="submit" style={{ width: '100%' }}>Log In</button>
      </form>
    </div>
  );
}
