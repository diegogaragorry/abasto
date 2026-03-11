import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../routes/api';

export function LoginPage({ onAuthenticated }: { onAuthenticated?: () => void }) {
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
      onAuthenticated?.();
      navigate('/comercios');
    } catch {
      setError('Contraseña inválida');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="panel panel-narrow">
      <p className="eyebrow">Acceso temporal</p>
      <h2>Ingreso administrador</h2>
      <p className="muted">Este acceso local está aislado para poder reemplazarse más adelante por la autenticación de Ground.</p>

      <form className="stack" onSubmit={handleSubmit}>
        <label className="field">
          <span>Contraseña</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Ingresá la contraseña de administrador"
            autoComplete="current-password"
          />
        </label>

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>

      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
