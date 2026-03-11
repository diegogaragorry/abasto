import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { AnalyticsDashboardPage } from './pages/AnalyticsDashboardPage';
import { BasketPage } from './pages/BasketPage';
import { LoginPage } from './pages/Login';
import { ProductsPage } from './pages/ProductsPage';
import { StoresPage } from './pages/StoresPage';
import { fetchAuthSession } from './routes/api';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadAuthSession() {
      try {
        const session = await fetchAuthSession();
        if (!cancelled) {
          setIsAuthenticated(session.authenticated);
        }
      } catch {
        if (!cancelled) {
          setIsAuthenticated(false);
        }
      }
    }

    void loadAuthSession();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand-lockup">
          <p className="eyebrow">Abasto</p>
          <h1>Operación de compras y precios</h1>
          <p className="muted">Precios, catálogo y canasta mensual en una sola consola.</p>
        </div>

        <nav className="topnav">
          <NavLink to="/dashboard" className={({ isActive }) => navClassName(isActive)}>
            Análisis
          </NavLink>
          {isAuthenticated ? (
            <NavLink to="/comercios" className={({ isActive }) => navClassName(isActive)}>
              Comercios
            </NavLink>
          ) : null}
          <NavLink to="/productos" className={({ isActive }) => navClassName(isActive)}>
            Productos
          </NavLink>
          <NavLink to="/canasta" className={({ isActive }) => navClassName(isActive)}>
            Canasta
          </NavLink>
          <NavLink to="/login" className={({ isActive }) => navClassName(isActive)}>
            Ingresar
          </NavLink>
        </nav>
      </header>

      <main className="content">
        <Routes>
          <Route path="/dashboard" element={<AnalyticsDashboardPage />} />
          <Route path="/login" element={<LoginPage onAuthenticated={() => setIsAuthenticated(true)} />} />
          <Route path="/comercios" element={<StoresPage />} />
          <Route path="/productos" element={<ProductsPage isAdminAuthenticated={isAuthenticated} />} />
          <Route path="/canasta" element={<BasketPage isAdminAuthenticated={isAuthenticated} />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function navClassName(isActive: boolean) {
  return isActive ? 'topnav-link topnav-link-active' : 'topnav-link';
}

export default App;
