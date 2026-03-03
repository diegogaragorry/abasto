import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../routes/api';

export function LoginPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      await login(password);
      navigate('/comercios');
    } catch {
      setError('Invalid password');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="panel panel-narrow">
      <p className="eyebrow">Temporary access</p>
      <h2>Admin login</h2>
      <p className="muted">This local password flow is isolated so it can later be replaced by Ground auth.</p>

      <form className="stack" onSubmit={handleSubmit}>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter admin password"
            autoComplete="current-password"
          />
        </label>

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
