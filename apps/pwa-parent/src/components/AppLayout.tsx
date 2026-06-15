import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { MaterialIcon } from "./MaterialIcon";
import { useAuth } from "../context/AuthContext";
import { fetchPublicBranding } from "../lib/data";
import { applyDocumentTitle, readBrandingFromStorage, saveBrandingToStorage } from "../lib/branding";
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
          appName: data.appName || readBrandingFromStorage().appName,
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

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="brand-block">
          <div className={`brand-logo ${hasCustomLogo ? "brand-logo-plain" : ""}`}>
            {hasCustomLogo ? (
              <img
                alt={branding.appName}
                className="brand-logo-image"
                onError={() => setLogoLoadFailed(true)}
                src={branding.logoUrl ?? undefined}
              />
            ) : (
              <MaterialIcon name="fitness_center" filled className="brand-logo-icon" />
            )}
          </div>
          <span className="brand-name">{branding.appName}</span>
        </div>

        <div className="top-actions">
          <Link aria-label="Abrir chat" className="icon-btn" to="/chat">
            <MaterialIcon
              name="forum"
              className="icon-btn-symbol"
              filled={pathname.startsWith("/chat") || pathname.startsWith("/cuaderno")}
            />
          </Link>
          <button aria-label="Notificaciones" className="icon-btn" type="button">
            <MaterialIcon name="notifications" className="icon-btn-symbol" />
          </button>
          <button aria-label="Cerrar sesion" className="icon-btn" onClick={logout} type="button">
            <MaterialIcon name="logout" className="icon-btn-symbol" />
          </button>
        </div>
      </header>

      <main className="app-content">
        <Outlet />
      </main>

      <nav className="bottom-nav">
        {navigationItems.map((item) => {
          const active = item.path ? pathname.startsWith(item.path) : false;

          if (!item.path) {
            return (
              <button className="bottom-nav-item disabled" key={item.label} type="button">
                <MaterialIcon name={item.icon} className="bottom-nav-icon" />
                <span>{item.label}</span>
              </button>
            );
          }

          return (
            <NavLink
              className={`bottom-nav-item ${active ? "active" : ""}`}
              key={item.path}
              to={item.path}
            >
              <MaterialIcon name={item.icon} className="bottom-nav-icon" filled={active} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
};
