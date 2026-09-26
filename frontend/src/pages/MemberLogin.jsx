import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function MemberLogin() {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const player = await api.memberLogin(name.trim());
      localStorage.setItem('cc_member', JSON.stringify({ id: player.id, name: player.name }));
      navigate('/me');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="container">
      <form className="card login-box" onSubmit={handleSubmit}>
        <h2>Member Login</h2>
        <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>Enter the name on the team list. No password needed.</p>
        <div className="form-group">
          <label>Enter your name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        {error && <div className="error-text">{error}</div>}
        <button className="btn btn-primary" type="submit" style={{ width: '100%' }}>View My Dashboard</button>
      </form>
    </div>
  );
}
