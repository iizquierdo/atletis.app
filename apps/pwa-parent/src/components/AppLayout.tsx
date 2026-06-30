import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { MaterialIcon } from "./MaterialIcon";
import { useAuth } from "../context/AuthContext";
import { fetchPublicBranding } from "../lib/data";
import { applyDocumentTitle, applyFavicon, readBrandingFromStorage, saveBrandingToStorage } from "../lib/branding";
import { applyThemeFromSettings } from "../lib/theme";

interface NavigationItem {
  label: string;
  icon: string;
  path?: string;
}

const navigationItems: NavigationItem[] = [
  { label: "Resumen", icon: "dashboard", path: "/resumen" },
  { label: "Niveles", icon: "analytics", path: "/niveles" },
  { label: "Multimedia", icon: "subscriptions", path: "/multimedia" },
  { label: "Social", icon: "stars", path: "/social" },
  { label: "Cuaderno", icon: "menu_book", path: "/cuaderno" }
];

export const AppLayout = () => {
  const { pathname } = useLocation();
  const { logout } = useAuth();
  const [branding, setBranding] = useState(() => readBrandingFromStorage());
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);
  const logoSrc = branding.isologoUrl ?? branding.logoUrl ?? null;
  const hasCustomLogo = Boolean(logoSrc && !logoLoadFailed);

  useEffect(() => {
    let cancelled = false;

    const loadBranding = async () => {
      try {
        const data = await fetchPublicBranding();
        if (cancelled || !data) return;
        applyThemeFromSettings(data);
        saveBrandingToStorage(data);
        setBranding({
          appName: data.appName || readBrandingFromStorage().appName,
          logoUrl: data.logoUrl ?? null,
          isologoUrl: data.isologoUrl ?? null,
          faviconUrl: data.faviconUrl ?? null,
          loginBackgroundUrl: data.loginBackgroundUrl ?? null
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
    applyFavicon(branding.faviconUrl);
  }, [branding.appName, branding.faviconUrl]);

  return (
    <div className="relative min-h-screen bg-slate-50">
      {/* Aurora background */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 -right-20 h-72 w-72 rounded-full bg-violet-200/20 blur-3xl" />
        <div className="absolute top-1/3 -left-20 h-64 w-64 rounded-full bg-blue-200/15 blur-3xl" />
        <div className="absolute bottom-20 right-1/4 h-56 w-56 rounded-full bg-sky-200/15 blur-3xl" />
      </div>

      {/* Top bar */}
      <header className="fixed top-0 left-0 right-0 z-30 border-b border-slate-100 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-[480px] items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            {hasCustomLogo ? (
              <img
                alt={branding.appName}
                className="h-8 w-8 object-contain"
                onError={() => setLogoLoadFailed(true)}
                src={logoSrc ?? undefined}
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--primary)]">
                <MaterialIcon name="fitness_center" filled className="text-base text-white" />
              </div>
            )}
            <span className="text-sm font-bold text-slate-900">{branding.appName}</span>
          </div>

          <div className="flex items-center gap-0.5">
            <Link
              aria-label="Abrir chat"
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100"
              to="/chat"
            >
              <MaterialIcon
                name="forum"
                filled={pathname.startsWith("/chat") || pathname.startsWith("/cuaderno")}
              />
            </Link>
            <button
              aria-label="Notificaciones"
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100"
              type="button"
            >
              <MaterialIcon name="notifications" />
            </button>
            <button
              aria-label="Cerrar sesión"
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100"
              onClick={logout}
              type="button"
            >
              <MaterialIcon name="logout" />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-[480px] pt-16 pb-24">
        <Outlet />
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-100 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[480px] items-center justify-around px-2 py-1.5">
          {navigationItems.map((item) => {
            const active = item.path ? pathname.startsWith(item.path) : false;

            if (!item.path) {
              return (
                <div
                  key={item.label}
                  className="flex flex-col items-center gap-0.5 px-3 py-2 opacity-30"
                >
                  <MaterialIcon name={item.icon} className="text-slate-400 text-[22px]" />
                  <span className="text-[10px] font-medium text-slate-400">{item.label}</span>
                </div>
              );
            }

            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center gap-0.5 rounded-2xl px-3 py-2 transition-colors ${
                  active
                    ? "bg-[var(--primary-softer)] text-[var(--primary)]"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                <MaterialIcon
                  name={item.icon}
                  filled={active}
                  className={`text-[22px] ${active ? "text-[var(--primary)]" : ""}`}
                />
                <span
                  className={`text-[10px] font-semibold ${
                    active ? "text-[var(--primary)]" : "text-slate-400"
                  }`}
                >
                  {item.label}
                </span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
