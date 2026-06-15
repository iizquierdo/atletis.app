import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { MaterialIcon } from "../components/MaterialIcon";
import { useAuth } from "../context/AuthContext";
import { extractErrorMessage } from "../lib/api";
import { fetchPublicBranding } from "../lib/data";
import {
  applyDocumentTitle,
  readBrandingFromStorage,
  saveBrandingToStorage
} from "../lib/branding";
import { applyThemeFromSettings } from "../lib/theme";

export const LoginPage = () => {
  const navigate = useNavigate();
  const { isAuthenticated, login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [branding, setBranding] = useState(() => readBrandingFromStorage());
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);

  const hasCustomLogo = Boolean(branding.logoUrl && !logoLoadFailed);

  useEffect(() => {
    let cancelled = false;

    const loadBranding = async () => {
      try {
        const data = await fetchPublicBranding();
        if (cancelled || !data) return;

        applyThemeFromSettings(data);
        saveBrandingToStorage(data);
        setBranding({
          appName: data.appName,
          logoUrl: data.logoUrl ?? null
        });
        setLogoLoadFailed(false);
      } catch {
        if (cancelled) return;
      }
    };

    void loadBranding();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    applyDocumentTitle(branding.appName);
  }, [branding.appName]);

  const canSubmit = useMemo(
    () => !loading && email.trim().length > 0 && password.trim().length >= 8,
    [email, loading, password]
  );

  if (isAuthenticated) {
    return <Navigate to="/resumen" replace />;
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!email.includes("@")) {
      setError("Ingresa un email válido para iniciar sesión.");
      return;
    }

    setLoading(true);

    try {
      await login(email, password, remember);
      navigate("/resumen", { replace: true });
    } catch (submitError) {
      setError(extractErrorMessage(submitError));
    } finally {
      setLoading(false);
    }
  };

  const autofillDemo = () => {
    setEmail("tutor.demo@natacion.local");
    setPassword("Demo1234");
  };

  return (
    <div className="login-screen">
      <div className="login-shell">
        <header className="login-top-bar">
          <div className="brand-block">
            {hasCustomLogo ? (
              <div className="brand-logo brand-logo-plain">
                <img
                  alt={branding.appName}
                  className="brand-logo-image"
                  onError={() => setLogoLoadFailed(true)}
                  src={branding.logoUrl ?? undefined}
                />
              </div>
            ) : null}
            <span className="brand-name">{branding.appName}</span>
          </div>
        </header>

        <main className="login-card">
          <section className="login-hero">
            <h1>Bienvenido</h1>
            <p>Ingresa tus credenciales para acceder al seguimiento de tu familia.</p>
          </section>

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="field-group">
              <label htmlFor="email">EMAIL O ID DE PADRE</label>
              <div className="field-shell">
                <MaterialIcon className="field-icon" name="mail" />
                <input
                  autoComplete="email"
                  id="email"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="ejemplo@correo.com"
                  required
                  type="email"
                  value={email}
                />
              </div>
            </div>

            <div className="field-group">
              <div className="field-label-row">
                <label htmlFor="password">CONTRASENA</label>
                <button className="link-like" type="button">
                  Olvidaste tu contrasena?
                </button>
              </div>
              <div className="field-shell">
                <MaterialIcon className="field-icon" name="lock" />
                <input
                  autoComplete="current-password"
                  id="password"
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="........"
                  required
                  type={showPassword ? "text" : "password"}
                  value={password}
                />
                <button
                  aria-label={showPassword ? "Ocultar contrasena" : "Mostrar contrasena"}
                  className="eye-btn"
                  onClick={() => setShowPassword((value) => !value)}
                  type="button"
                >
                  <MaterialIcon name={showPassword ? "visibility_off" : "visibility"} />
                </button>
              </div>
            </div>

            <label className="remember-row">
              <input
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
                type="checkbox"
              />
              <span>Mantener sesion iniciada</span>
            </label>

            {error && <p className="error-text">{error}</p>}

            <button className="primary-cta" disabled={!canSubmit} type="submit">
              {loading ? "Ingresando..." : "Iniciar Sesion"}
              <MaterialIcon name="arrow_forward" />
            </button>
          </form>

          <p className="login-footer">
            Nuevo en la familia? <button type="button">Contacta con tu asesor</button>
          </p>

          <div className="login-divider" />

          <button className="demo-chip" onClick={autofillDemo} type="button">
            Usar Credenciales DEMO
          </button>
        </main>
      </div>
    </div>
  );
};
