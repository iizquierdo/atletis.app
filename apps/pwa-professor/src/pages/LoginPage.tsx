import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { MaterialIcon } from "../components/MaterialIcon";
import { useAuth } from "../context/AuthContext";
import { extractErrorMessage } from "../lib/api";
import { fetchPublicBranding } from "../lib/data";
import {
  applyDocumentTitle,
  applyFavicon,
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
  const [bgLoadFailed, setBgLoadFailed] = useState(false);

  const logoSrc = branding.isologoUrl ?? branding.logoUrl ?? null;
  const hasCustomLogo = Boolean(logoSrc && !logoLoadFailed);
  const hasBgImage = Boolean(branding.loginBackgroundUrl && !bgLoadFailed);

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
          logoUrl: data.logoUrl ?? null,
          isologoUrl: data.isologoUrl ?? null,
          faviconUrl: data.faviconUrl ?? null,
          loginBackgroundUrl: data.loginBackgroundUrl ?? null
        });
        setLogoLoadFailed(false);
        setBgLoadFailed(false);
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
    applyFavicon(branding.faviconUrl);
  }, [branding.appName, branding.faviconUrl]);

  const canSubmit = useMemo(
    () => !loading && email.trim().length > 0 && password.trim().length > 0,
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

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      {/* Background: image or primary-color gradient */}
      {hasBgImage ? (
        <>
          <img
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover"
            onError={() => setBgLoadFailed(true)}
            src={branding.loginBackgroundUrl ?? undefined}
          />
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
        </>
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 90% 55% at 15% 10%, rgba(255,255,255,0.18) 0%, transparent 55%)," +
              "radial-gradient(ellipse 70% 45% at 85% 95%, rgba(0,0,0,0.28) 0%, transparent 55%)," +
              "var(--primary)",
          }}
        />
      )}

      {/* Content */}
      <div className="relative z-10 w-full max-w-sm">
        {/* Brand */}
        <div className="mb-8 flex flex-col items-center gap-3">
          {hasCustomLogo ? (
            <img
              alt={branding.appName}
              className="h-20 w-20 rounded-2xl object-contain drop-shadow-2xl"
              onError={() => setLogoLoadFailed(true)}
              src={logoSrc ?? undefined}
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
              <MaterialIcon name="pool" filled className="text-4xl text-white" />
            </div>
          )}
          <div className="text-center">
            <h1 className="text-xl font-bold text-white drop-shadow">{branding.appName}</h1>
            <p className="mt-1 text-sm font-medium text-white/80">Portal de Profesores</p>
          </div>
        </div>

        {/* Card — glassmorphism */}
        <div className="rounded-3xl bg-white/90 backdrop-blur-xl p-6 shadow-2xl ring-1 ring-white/40">
          <h2 className="text-xl font-bold text-slate-900">Bienvenido, Profesor</h2>
          <p className="mt-1 text-sm text-slate-500">
            Ingresá tus credenciales para gestionar tus clases y alumnos.
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            {/* Email */}
            <div>
              <label
                className="text-[10px] font-semibold uppercase tracking-wider text-slate-400"
                htmlFor="email"
              >
                Email
              </label>
              <div className="mt-1 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 transition-colors focus-within:border-[var(--primary)] focus-within:bg-white">
                <MaterialIcon name="mail" className="text-base text-slate-400" />
                <input
                  autoComplete="email"
                  className="flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                  id="email"
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="profesor@centro.com"
                  required
                  type="email"
                  value={email}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between">
                <label
                  className="text-[10px] font-semibold uppercase tracking-wider text-slate-400"
                  htmlFor="password"
                >
                  Contraseña
                </label>
                <button className="text-xs font-medium text-[var(--primary)]" type="button">
                  ¿Olvidaste?
                </button>
              </div>
              <div className="mt-1 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 transition-colors focus-within:border-[var(--primary)] focus-within:bg-white">
                <MaterialIcon name="lock" className="text-base text-slate-400" />
                <input
                  autoComplete="current-password"
                  className="flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                  id="password"
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  type={showPassword ? "text" : "password"}
                  value={password}
                />
                <button
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  className="text-slate-400 transition-colors hover:text-slate-600"
                  onClick={() => setShowPassword((v) => !v)}
                  type="button"
                >
                  <MaterialIcon name={showPassword ? "visibility_off" : "visibility"} className="text-base" />
                </button>
              </div>
            </div>

            {/* Remember */}
            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                checked={remember}
                className="accent-[var(--primary)] h-4 w-4 rounded"
                onChange={(e) => setRemember(e.target.checked)}
                type="checkbox"
              />
              <span className="text-sm text-slate-600">Mantener sesión iniciada</span>
            </label>

            {error && (
              <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
            )}

            <button
              className="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--primary)] py-4 text-sm font-semibold text-white shadow-lg transition-opacity disabled:opacity-50"
              disabled={!canSubmit}
              type="submit"
            >
              {loading ? "Ingresando..." : "Iniciar Sesión"}
              <MaterialIcon name="arrow_forward" className="text-base" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
