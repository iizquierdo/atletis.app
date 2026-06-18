import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { MaterialIcon } from "./MaterialIcon";
import { useAuth } from "../context/AuthContext";
import { resolveMediaUrl } from "../lib/media";
import { fetchPublicBranding } from "../lib/data";
import { applyDocumentTitle, readBrandingFromStorage, saveBrandingToStorage } from "../lib/branding";
import { applyThemeFromSettings } from "../lib/theme";

interface NavigationItem {
  label: string;
  icon: string;
  path: string;
}

const navigationItems: NavigationItem[] = [
  { label: "Resumen", icon: "dashboard", path: "/resumen" },
  { label: "Clases", icon: "school", path: "/clases" },
  { label: "Social", icon: "stars", path: "/social" },
  { label: "Cuaderno", icon: "menu_book", path: "/cuaderno" },
  { label: "Chat", icon: "forum", path: "/chat" }
];

export const AppLayout = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const [branding, setBranding] = useState(() => readBrandingFromStorage());
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isoSrc = branding.isologoUrl ?? branding.logoUrl ?? null;
  const hasIsologo = Boolean(isoSrc && !logoLoadFailed);

  const initials = user
    ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase()
    : "?";
  const avatarUrl = user?.avatarUrl ? resolveMediaUrl(user.avatarUrl) : null;

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [avatarUrl]);

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
          loginBackgroundUrl: data.loginBackgroundUrl ?? null
        });
        setLogoLoadFailed(false);
      } catch {
        if (cancelled) return;
      }
    };

    void loadBranding();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    applyDocumentTitle(branding.appName);
  }, [branding.appName]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const handleLogout = () => {
    setMenuOpen(false);
    logout();
  };

  const handleProfile = () => {
    setMenuOpen(false);
    navigate("/perfil");
  };

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

          {/* Left: isologo + app name */}
          <div className="flex items-center gap-2.5">
            {hasIsologo ? (
              <img
                alt={branding.appName}
                className="h-8 w-auto object-contain"
                onError={() => setLogoLoadFailed(true)}
                src={isoSrc ?? undefined}
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--primary)]">
                <MaterialIcon name="pool" filled className="text-base text-white" />
              </div>
            )}
            <span className="text-sm font-bold text-slate-900">{branding.appName}</span>
          </div>

          {/* Right: notifications + avatar menu */}
          <div className="flex items-center gap-0.5">
            <button
              aria-label="Notificaciones"
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100"
              type="button"
            >
              <MaterialIcon name="notifications" />
            </button>

            {/* Avatar with dropdown */}
            <div className="relative" ref={menuRef}>
              <button
                aria-label="Menú de usuario"
                className="relative ml-1 flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[var(--primary)] text-xs font-bold text-white shadow-sm transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-1"
                onClick={() => setMenuOpen((v) => !v)}
                type="button"
              >
                <span className={avatarUrl && !avatarLoadFailed ? "sr-only" : undefined}>
                  {initials}
                </span>
                {avatarUrl && !avatarLoadFailed ? (
                  <img
                    src={avatarUrl}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                    onError={() => setAvatarLoadFailed(true)}
                  />
                ) : null}
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-11 z-50 min-w-[180px] overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-100">
                  {/* User info header */}
                  {user && (
                    <div className="border-b border-slate-100 px-4 py-3">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {user.firstName} {user.lastName}
                      </p>
                      <p className="text-xs text-slate-400 truncate">{user.email}</p>
                    </div>
                  )}

                  {/* Menu items */}
                  <div className="py-1">
                    <button
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-700 transition-colors hover:bg-slate-50"
                      onClick={handleProfile}
                      type="button"
                    >
                      <MaterialIcon name="manage_accounts" className="text-base text-slate-400" />
                      Mi perfil
                    </button>
                    <button
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-600 transition-colors hover:bg-red-50"
                      onClick={handleLogout}
                      type="button"
                    >
                      <MaterialIcon name="logout" className="text-base text-red-400" />
                      Cerrar sesión
                    </button>
                  </div>
                </div>
              )}
            </div>
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
            const active = pathname.startsWith(item.path);
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
