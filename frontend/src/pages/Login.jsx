import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

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
        <h2>Admin Login</h2>
        <div className="form-group">
          <label>Username</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} required />
        </div>
        <div className="form-group">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <div className="error-text">{error}</div>}
        <button className="btn btn-primary" type="submit" style={{ width: '100%' }}>Log In</button>
      </form>
    </div>
  );
}
