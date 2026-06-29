import React, { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import { BreadcrumbBar } from './components/BreadcrumbBar';
import { LayoutProvider } from '@/components/layouts/layout-1/components/context';
import { SinapsisShell } from '@/components/layouts/sinapsis-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AuthFlow, { AuthSessionPayload } from './components/AuthFlow';
import FileManager from './components/FileManager';
import { Wand2 } from 'lucide-react';

const UserAccount = lazy(() => import('./components/UserAccount'));
const SocialFeed = lazy(() => import('./components/SocialFeed'));
const ProjectManagement = lazy(() => import('./components/ProjectManagement'));
const TicketManagement = lazy(() => import('./components/TicketManagement'));
const UserManagement = lazy(() => import('./components/UserManagement'));
const RoleManagement = lazy(() => import('./components/RoleManagement'));
const SubscriptionManagement = lazy(() => import('./components/SubscriptionManagement'));
const InboxModule = lazy(() => import('./components/InboxModule'));
const ChatModule = lazy(() => import('./components/ChatModule'));
const CalendarModule = lazy(() => import('./components/CalendarModule'));
const FAQModule = lazy(() => import('./components/FAQModule'));
const InvoiceModule = lazy(() => import('./components/InvoiceModule'));
const SettingsModule = lazy(() => import('./components/SettingsModule'));
const InstallAppsPage = lazy(() => import('./components/InstallAppsPage'));
import { ViewType, Customer, AppUser } from '@sinapsis/shared-types';
import { CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, XAxis, YAxis } from 'recharts';
import { useTranslation } from 'react-i18next';
import { getClientModules } from './module-registry';
import type { ModuleClientDefinition, ModuleRenderContext } from '@sinapsis/module-sdk-client';
import AdminApp from './components/admin/AdminApp';
import { buildViewRoutes, pathForView, viewForPath, type ViewRoute } from './lib/view-routes';
import { API_BASE, assetUrl } from './lib/api-base';

type PublicCorePayload = {
  appName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  loginBackgroundUrl?: string | null;
  primaryColor: string;
  secondaryColor: string;
  sidebarBackgroundColor: string;
  sidebarLogoUrl: string | null;
  menuBarColor: string;
  dateFormat: string;
  timeFormat: string;
  timezone: string;
  baseCurrency: string | null;
  moneyFormat: string;
  currencyPosition: string;
  defaultLanguage: string;
};

type DashboardCard = {
  key: string;
  label: string;
  value: string | number;
  detail: string;
  icon: string;
  tone: 'blue' | 'emerald' | 'amber' | 'red' | 'cyan' | 'violet' | 'slate';
  format?: 'currency';
};

type DashboardSummary = {
  cards: DashboardCard[];
  finance: {
    monthlyIncome: number;
    monthlyExpenses: number;
    netMonth: number;
    incomeSeries: Array<{ label: string; value: number }>;
  };
  operations: {
    todayClasses: number;
    activeStudents: number;
    activeClasses: number;
    pendingAttendance: number;
    attendanceRate: number | null;
    occupancyRate: number | null;
  };
  work: {
    overdueTasks: number;
    unreadMessages: number;
    openOpportunities: number;
    communityPostsWeek: number;
  };
  actions: string[];
};

const MOCK_REVENUE = [
  { name: 'Mon', value: 4000 },
  { name: 'Tue', value: 3000 },
  { name: 'Wed', value: 2000 },
  { name: 'Thu', value: 2780 },
  { name: 'Fri', value: 1890 },
  { name: 'Sat', value: 2390 },
  { name: 'Sun', value: 3490 },
];

const AUTH_STORAGE_KEY = 'sinapsis.auth.session';
const ALL_CLIENT_MODULES: ModuleClientDefinition[] = getClientModules();
const VIEW_ROUTES: ViewRoute[] = buildViewRoutes(ALL_CLIENT_MODULES);
const TENANT_BLOCKED_SETTINGS_VIEWS: ViewType[] = [
  'ModuleSettings',
  'SMTPSettings',
  'LanguageSettings',
  'StorageSettings',
  'MenuSettings'
];

const DEFAULT_APP_DISPLAY_NAME = 'Sinapsis CRM/ERP';
const DEFAULT_FAVICON_PATH = '/media/app/favicon.ico';

const faviconMimeForUrl = (href: string): string | undefined => {
  const lower = href.split('?')[0].toLowerCase();
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.ico')) return 'image/x-icon';
  return undefined;
};

const ViewSuspenseFallback = () => (
  <div className="text-muted-foreground flex min-h-[40vh] items-center justify-center text-sm">Loading…</div>
);

interface NavBridgeRenderProps {
  currentView: ViewType;
  setView: (view: ViewType, params?: Record<string, string>) => void;
  recordId?: string;
}

/**
 * Backs the legacy `currentView` / `setView(view)` navigation contract with the
 * router: `currentView` is derived from the URL and `setView` navigates to the
 * matching path. Detail params (e.g. `:id`) are surfaced as `recordId`. This lets
 * the sidebar / header / breadcrumb / footer keep their existing props unchanged.
 */
const NavBridge: React.FC<{
  routes: ViewRoute[];
  blockedViews: ViewType[];
  onNavigate?: () => void;
  children: (props: NavBridgeRenderProps) => React.ReactNode;
}> = ({ routes, blockedViews, onNavigate, children }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const matched = viewForPath(routes, location.pathname);
  const currentView = (matched?.view ?? 'Dashboard') as ViewType;
  const recordId = matched?.params?.id;

  const setView = useCallback(
    (view: ViewType, params?: Record<string, string>) => {
      if (blockedViews.includes(view)) {
        navigate('/', { replace: true });
        return;
      }
      navigate(pathForView(routes, view, params) ?? '/');
    },
    [routes, blockedViews, navigate]
  );

  // Bounce unknown or tenant-blocked URLs back to the dashboard.
  useEffect(() => {
    if (location.pathname === '/') return;
    const m = viewForPath(routes, location.pathname);
    if (!m || blockedViews.includes(m.view)) {
      navigate('/', { replace: true });
    }
  }, [location.pathname, routes, blockedViews, navigate]);

  // Reset the per-view subtitle (and close the mobile sidebar) on every
  // navigation; detail views re-set their subtitle after loading.
  useEffect(() => {
    onNavigate?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  return <>{children({ currentView, setView, recordId })}</>;
};

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const { t, i18n } = useTranslation();
  const [subTitle, setSubTitle] = useState<string>('');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('org');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<AppUser | undefined>(undefined);
  const [activeModuleCodes, setActiveModuleCodes] = useState<string[]>([]);
  const [publicCore, setPublicCore] = useState<PublicCorePayload | null>(null);
  const publicCoreRef = useRef<PublicCorePayload | null>(null);
  publicCoreRef.current = publicCore;

  const isAdministrativeUser = useMemo(() => {
    const legacyRole = String(currentUser?.role || '').trim().toLowerCase();
    const roleName = String(currentUser?.roleRef?.name || '').trim().toLowerCase();
    return (
      legacyRole === 'administrator' ||
      legacyRole === 'admin' ||
      legacyRole === 'administrador' ||
      legacyRole === 'admin sede' ||
      legacyRole === 'super admin' ||
      roleName === 'administrator' ||
      roleName === 'admin' ||
      roleName === 'administrador' ||
      roleName === 'admin sede' ||
      roleName === 'super admin'
    );
  }, [currentUser]);

  const readableModuleCodes = useMemo(() => {
    const permissions = currentUser?.roleRef?.permissions || [];

    if (isAdministrativeUser) {
      return Array.from(
        new Set([
          ...activeModuleCodes,
          ...ALL_CLIENT_MODULES.map((module) => String(module.code || '').toUpperCase()).filter(Boolean)
        ])
      );
    }

    const byPermission = new Set(
      permissions
        .filter((perm) => Boolean(perm?.canRead))
        .map((perm) => String(perm?.module?.code || perm?.moduleCode || '').toUpperCase())
        .filter(Boolean)
    );

    if (byPermission.size === 0) return [];
    return activeModuleCodes.filter((code) => byPermission.has(String(code || '').toUpperCase()));
  }, [activeModuleCodes, currentUser, isAdministrativeUser]);

  const activeClientModules = useMemo(
    () => ALL_CLIENT_MODULES.filter((module) => readableModuleCodes.includes(String(module.code || '').toUpperCase())),
    [readableModuleCodes]
  );

  const dynamicModuleViews = activeClientModules.reduce((acc, module) => {
    for (const [view, render] of Object.entries(module.views)) {
      if (!render) continue;
      acc[view as ViewType] = render;
    }
    return acc;
  }, {} as Partial<Record<ViewType, (ctx: ModuleRenderContext) => React.ReactElement>>);

  const dynamicModuleViewNames = Object.keys(dynamicModuleViews) as ViewType[];
  const dynamicBreadcrumbs = activeClientModules.reduce((acc, module) => ({ ...acc, ...(module.breadcrumbs || {}) }), {} as Record<string, { main: string; sub: string; listTarget?: string; resetEvent?: string }>);

  const resolveUserLanguage = (language?: string | null) => {
    const code = String(language || '').trim().toLowerCase();
    if (code.startsWith('es') || code === 'español' || code === 'espanol') return 'es';
    if (code.startsWith('en') || code === 'english') return 'en';
    return 'en';
  };

  const applyUserLanguage = (language?: string | null) => {
    i18n.changeLanguage(resolveUserLanguage(language));
  };

  // Language precedence: user's personal choice → tenant (organization) saved
  // default → global app default. The tenant default is the language saved on
  // the user's Organization.
  const resolveTenantLanguage = (user?: AppUser | null) =>
    user?.language || user?.organizationDefaultLanguage || publicCoreRef.current?.defaultLanguage || null;

  const resolveBrowserLanguage = () => {
    const code = String((typeof navigator !== 'undefined' ? navigator.language : 'en') || 'en').toLowerCase();
    return code.startsWith('es') ? 'es' : 'en';
  };

  useEffect(() => {
    const loadCore = async () => {
      try {
        const res = await fetch('/api/public/core');
        if (!res.ok) return;
        const data = (await res.json()) as PublicCorePayload;
        setPublicCore(data);
      } catch {
        setPublicCore(null);
      }
    };
    void loadCore();
  }, []);

  useEffect(() => {
    if (!publicCore) return;
    const root = document.documentElement;
    if (publicCore.primaryColor) {
      root.style.setProperty('--primary', publicCore.primaryColor);
      root.style.setProperty('--brand', publicCore.primaryColor);
    }
    if (publicCore.secondaryColor) {
      root.style.setProperty('--secondary', publicCore.secondaryColor);
    }
  }, [publicCore]);

  useEffect(() => {
    if (!publicCore || isAuthenticated) return;
    applyUserLanguage(publicCore.defaultLanguage);
  }, [publicCore, isAuthenticated]);

  useEffect(() => {
    if (!publicCore || !isAuthenticated || !currentUser) return;
    if (currentUser.language) return;
    applyUserLanguage(currentUser.organizationDefaultLanguage || publicCore.defaultLanguage);
  }, [publicCore, isAuthenticated, currentUser?.id, currentUser?.language, currentUser?.organizationDefaultLanguage]);

  const headerShellStyle = useMemo(() => {
    if (!publicCore?.menuBarColor?.trim()) return undefined;
    return { backgroundColor: publicCore.menuBarColor } as React.CSSProperties;
  }, [publicCore?.menuBarColor]);

  const displayAppName = useMemo(
    () => publicCore?.appName?.trim() || DEFAULT_APP_DISPLAY_NAME,
    [publicCore?.appName]
  );
  const faviconHref = useMemo(
    () => assetUrl(publicCore?.faviconUrl) || DEFAULT_FAVICON_PATH,
    [publicCore?.faviconUrl]
  );
  const faviconType = useMemo(() => faviconMimeForUrl(faviconHref), [faviconHref]);

  useEffect(() => {
    document.title = displayAppName;
    document.querySelectorAll('link[rel="icon"],link[rel="shortcut icon"]').forEach((el) => {
      if (el.id !== 'sinapsis-favicon') el.remove();
    });
    let link = document.getElementById('sinapsis-favicon') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.id = 'sinapsis-favicon';
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = faviconHref;
    if (faviconType) link.setAttribute('type', faviconType);
    else link.removeAttribute('type');
  }, [displayAppName, faviconHref, faviconType]);

  useEffect(() => {
    const restoreSession = async () => {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) {
        setAuthReady(true);
        return;
      }

      try {
        const parsed = JSON.parse(raw);
        const token = String(parsed?.token || '');
        if (!token) {
          localStorage.removeItem(AUTH_STORAGE_KEY);
          setAuthReady(true);
          return;
        }

        const res = await fetch('/api/auth/session', {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!res.ok) {
          localStorage.removeItem(AUTH_STORAGE_KEY);
          setAuthReady(true);
          return;
        }

        const data = await res.json();
        const user = data?.user;

        if (!user) {
          localStorage.removeItem(AUTH_STORAGE_KEY);
          setAuthReady(true);
          return;
        }

        setCurrentUser({
          ...user,
          name: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
          lastLogin: new Date().toISOString(),
          joinedDate: user.createdAt || new Date().toISOString(),
          twoStep: false
        });
        setIsAuthenticated(true);
        applyUserLanguage(resolveTenantLanguage(user));
      } catch (error) {
        console.error('Error restoring auth session:', error);
        localStorage.removeItem(AUTH_STORAGE_KEY);
      } finally {
        setAuthReady(true);
      }
    };

    restoreSession();
  }, []);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      let token = '';
      try {
        token = raw ? String(JSON.parse(raw || '{}')?.token || '') : '';
      } catch {
        token = '';
      }

      const rawUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : typeof Request !== 'undefined' && input instanceof Request
              ? input.url
              : '';

      const apiBaseOrigin = (() => {
        if (!API_BASE || API_BASE.startsWith('/')) return '';
        try {
          return new URL(API_BASE).origin;
        } catch {
          return '';
        }
      })();

      const pathForApiGate = (() => {
        const base = (rawUrl || '').split('#')[0];
        if (base.startsWith('/')) return base;
        if (base.startsWith('http://') || base.startsWith('https://')) {
          try {
            const u = new URL(base);
            if (u.origin === window.location.origin || (apiBaseOrigin && u.origin === apiBaseOrigin)) {
              return `${u.pathname}${u.search}`;
            }
          } catch {
            /* ignore */
          }
        }
        return '';
      })();

      const isApiRequest = pathForApiGate.startsWith('/api/');
      const isAdminApiRequest = pathForApiGate.startsWith('/api/admin/');
      if (!isApiRequest || isAdminApiRequest) {
        return originalFetch(input, init);
      }

      const headers = new Headers(init?.headers || (typeof input === 'object' && 'headers' in input ? input.headers : undefined));
      if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      if (currentUser?.id && !headers.has('X-User-Id')) {
        headers.set('X-User-Id', currentUser.id);
      }

      return originalFetch(input, {
        ...(init || {}),
        headers
      });
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [currentUser?.id]);

  const handleLoginSuccess = (payload: AuthSessionPayload) => {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token: payload.token }));

    const user = payload.user || {};
    setCurrentUser({
      ...user,
      name: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
      lastLogin: new Date().toISOString(),
      joinedDate: user.createdAt || new Date().toISOString(),
      twoStep: false
    });
    setIsAuthenticated(true);
    applyUserLanguage(resolveTenantLanguage(user));
  };

  const refreshActiveModules = () => {
    fetch('/api/modules')
      .then((res) => (res.ok ? res.json() : []))
      .then((mods: { code?: string; status?: string }[]) => {
        const codes = mods
          .filter((mod) => String(mod.status || '') === 'Active')
          .map((mod) => String(mod.code || '').toUpperCase())
          .filter(Boolean);
        setActiveModuleCodes(codes);
      })
      .catch(() => setActiveModuleCodes([]));
  };

  useEffect(() => {
    if (!isAuthenticated) {
      setActiveModuleCodes([]);
      return;
    }

    refreshActiveModules();
    window.addEventListener('modulesUpdated', refreshActiveModules);
    return () => window.removeEventListener('modulesUpdated', refreshActiveModules);
  }, [isAuthenticated]);

  const handleCurrentUserUpdate = (nextUser: AppUser) => {
    setCurrentUser((prev) => {
      if (!prev) return nextUser;
      return {
        ...prev,
        ...nextUser,
        name: nextUser.name || [nextUser.firstName, nextUser.lastName].filter(Boolean).join(' ').trim() || prev.name
      };
    });
  };

  useEffect(() => {
    console.log('[DEBUG] App Context - selectedCompanyId:', selectedCompanyId);
  }, [selectedCompanyId]);

  const [customers] = useState<Customer[]>([
    { id: '1', name: 'Acme Corp', email: 'contact@acme.com', status: 'Active', value: 12500, lastContact: '2h ago' },
    { id: '2', name: 'Global Tech', email: 'hr@global.tech', status: 'Lead', value: 3200, lastContact: '1d ago' },
    { id: '3', name: 'Nexus Ltd', email: 'support@nexus.io', status: 'Active', value: 45000, lastContact: '5m ago' },
  ]);

  useEffect(() => {
    if (!isAuthenticated || !currentUser) {
      setDashboardSummary(null);
      return;
    }

    let cancelled = false;
    const loadDashboard = async () => {
      setDashboardLoading(true);
      setDashboardError(null);
      try {
        const raw = localStorage.getItem(AUTH_STORAGE_KEY);
        const token = raw ? JSON.parse(raw)?.token : '';
        const params = new URLSearchParams();
        if (selectedCompanyId && selectedCompanyId !== 'org') params.set('companyId', selectedCompanyId);
        const res = await fetch(`/api/dashboard/summary${params.toString() ? `?${params.toString()}` : ''}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'No se pudo cargar el dashboard');
        if (!cancelled) setDashboardSummary(data as DashboardSummary);
      } catch (error: unknown) {
        if (!cancelled) {
          setDashboardSummary(null);
          setDashboardError(error instanceof Error ? error.message : 'No se pudo cargar el dashboard');
        }
      } finally {
        if (!cancelled) setDashboardLoading(false);
      }
    };

    void loadDashboard();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, currentUser?.id, selectedCompanyId]);

  const handleLogout = async () => {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      const token = raw ? JSON.parse(raw)?.token : '';
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        });
      }
    } catch (error) {
      console.error('Error in logout:', error);
    } finally {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      setIsAuthenticated(false);
      setCurrentUser(undefined);
      setSubTitle('');
      setSelectedCompanyId('org');
      i18n.changeLanguage(resolveBrowserLanguage());
    }
  };

  if (!authReady) {
    return (
      <div className="text-muted-foreground flex min-h-screen items-center justify-center bg-background">
        Loading session...
      </div>
    );
  }

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat(i18n.language || 'es', {
      style: 'currency',
      currency: publicCore?.baseCurrency || 'ARS',
      maximumFractionDigits: 0
    }).format(Number(value || 0));

  const toneClasses: Record<DashboardCard['tone'], { icon: string; badge: string }> = {
    blue: { icon: 'bg-blue-500/10 text-blue-600', badge: 'bg-blue-500/10 text-blue-700' },
    emerald: { icon: 'bg-emerald-500/10 text-emerald-600', badge: 'bg-emerald-500/10 text-emerald-700' },
    amber: { icon: 'bg-amber-500/10 text-amber-600', badge: 'bg-amber-500/10 text-amber-700' },
    red: { icon: 'bg-red-500/10 text-red-600', badge: 'bg-red-500/10 text-red-700' },
    cyan: { icon: 'bg-cyan-500/10 text-cyan-600', badge: 'bg-cyan-500/10 text-cyan-700' },
    violet: { icon: 'bg-violet-500/10 text-violet-600', badge: 'bg-violet-500/10 text-violet-700' },
    slate: { icon: 'bg-slate-500/10 text-slate-600', badge: 'bg-slate-500/10 text-slate-700' }
  };

  const renderDashboard = () => {
    const series = dashboardSummary?.finance.incomeSeries?.length
      ? dashboardSummary.finance.incomeSeries
      : MOCK_REVENUE.map((row) => ({ label: row.name, value: 0 }));
    const cards: DashboardCard[] = dashboardSummary?.cards || [
      { key: 'loading-classes', label: 'Clases hoy', value: dashboardLoading ? '...' : 0, detail: 'Cargando agenda', icon: 'fa-calendar-day', tone: 'blue' },
      { key: 'loading-students', label: 'Alumnos activos', value: dashboardLoading ? '...' : 0, detail: 'Cargando alumnos', icon: 'fa-person-swimming', tone: 'cyan' },
      { key: 'loading-finance', label: 'Ingresos del mes', value: dashboardLoading ? '...' : 0, detail: 'Cargando finanzas', icon: 'fa-file-invoice-dollar', tone: 'emerald' }
    ];

    return (
      <div className="animate-in fade-in space-y-6 duration-500">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Resumen operativo</h2>
            <p className="text-sm text-muted-foreground">
              {selectedCompanyId === 'org' ? 'Todas las sedes' : 'Sede seleccionada'} - datos consolidados de modulos activos
            </p>
          </div>
          {dashboardLoading && <span className="text-xs font-medium text-muted-foreground">Actualizando...</span>}
        </div>

        {dashboardError && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="py-4 text-sm font-medium text-red-700">{dashboardError}</CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((stat) => {
            const tone = toneClasses[stat.tone] || toneClasses.slate;
            const value = stat.format === 'currency' && typeof stat.value === 'number'
              ? formatCurrency(stat.value)
              : stat.value;
            return (
              <Card key={stat.key} className="shadow-xs transition-shadow hover:shadow-md">
                <CardContent className="pt-6">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className={`rounded-lg p-2 ${tone.icon}`}>
                      <i className={`fa-solid ${stat.icon}`}></i>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-xs font-bold ${tone.badge}`}>
                      {stat.detail}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-sm font-medium">{stat.label}</p>
                  <h3 className="text-foreground text-2xl font-bold">{value}</h3>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card className="shadow-xs xl:col-span-2">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="normal-case">Ingresos emitidos - ultimos 7 dias</CardTitle>
              <span className="text-sm font-semibold text-muted-foreground">
                Neto mes {formatCurrency(dashboardSummary?.finance.netMonth || 0)}
              </span>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series}>
                    <defs>
                      <linearGradient id="dashboardIncome" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.16} />
                        <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} tickFormatter={(v) => formatCurrency(Number(v)).replace(/\s/g, '')} />
                    <Tooltip
                      formatter={(value) => [formatCurrency(Number(value)), 'Ingresos']}
                      contentStyle={{
                        backgroundColor: 'var(--card)',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                      }}
                    />
                    <Area type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={3} fillOpacity={1} fill="url(#dashboardIncome)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border-primary/20 bg-primary text-primary-foreground shadow-lg">
            <CardContent className="flex h-full flex-col justify-between gap-6 pt-6">
              <div>
                <div className="mb-4 flex items-center gap-2">
                  <Wand2 className="size-4" />
                  <span className="text-xs font-bold uppercase tracking-wider">Foco de hoy</span>
                </div>
                <h4 className="mb-4 text-xl font-bold">Acciones que mueven la operacion</h4>
                <div className="space-y-3 text-sm leading-relaxed opacity-95">
                  {(dashboardSummary?.actions?.length ? dashboardSummary.actions : ['No hay alertas criticas. Revisa cupos, mensajes y vencimientos al cierre del dia.']).map((line, idx) => (
                    <p key={idx} className="flex gap-2">
                      <span className="opacity-60">-</span> {line}
                    </p>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            { label: 'Operacion', rows: [
              ['Clases activas', dashboardSummary?.operations.activeClasses ?? 0],
              ['Asistencia pendiente', dashboardSummary?.operations.pendingAttendance ?? 0],
              ['Ocupacion', dashboardSummary?.operations.occupancyRate == null ? 'Sin cupos' : `${dashboardSummary.operations.occupancyRate}%`]
            ] },
            { label: 'Finanzas', rows: [
              ['Ingresos mes', formatCurrency(dashboardSummary?.finance.monthlyIncome || 0)],
              ['Gastos mes', formatCurrency(dashboardSummary?.finance.monthlyExpenses || 0)],
              ['Neto mes', formatCurrency(dashboardSummary?.finance.netMonth || 0)]
            ] },
            { label: 'Seguimiento', rows: [
              ['Tareas vencidas', dashboardSummary?.work.overdueTasks ?? 0],
              ['Mensajes sin leer', dashboardSummary?.work.unreadMessages ?? 0],
              ['Posts comunidad 7d', dashboardSummary?.work.communityPostsWeek ?? 0]
            ] }
          ].map((section) => (
            <Card key={section.label}>
              <CardHeader className="min-h-0 py-4">
                <CardTitle className="normal-case text-sm font-semibold">{section.label}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {section.rows.map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between border-b border-border/60 pb-2 last:border-0 last:pb-0">
                    <span className="text-sm text-muted-foreground">{label}</span>
                    <span className="text-sm font-semibold text-foreground">{value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  };

  const renderAuthenticatedBody = (
    currentView: ViewType,
    setView: (view: ViewType, params?: Record<string, string>) => void,
    recordId?: string
  ) => (
    <>
      {currentView === 'Dashboard' && renderDashboard()}
            {currentView === 'Projects' && <ProjectManagement />}
            {currentView === 'Social' && <SocialFeed />}
            {currentView === 'Profile' && <UserAccount user={currentUser} onUserUpdate={handleCurrentUserUpdate} />}
            {currentView === 'Tickets' && <TicketManagement />}
            {currentView === 'Users' && <UserManagement companyFilter={selectedCompanyId === 'org' ? undefined : selectedCompanyId} />}
            {currentView === 'Roles' && <RoleManagement />}
            {currentView === 'Subscriptions' && <SubscriptionManagement />}
            {currentView === 'FileManager' && <FileManager />}
            {currentView === 'Inbox' && <InboxModule />}
            {currentView === 'Chat' && <ChatModule />}
            {currentView === 'Calendar' && <CalendarModule />}
            {currentView === 'FAQ' && <FAQModule />}
            {currentView === 'Invoices' && <InvoiceModule view="list" setView={setView} />}
            {currentView === 'CreateInvoice' && <InvoiceModule view="create" setView={setView} />}
            {currentView === 'InvoiceDetail' && <InvoiceModule view="detail" setView={setView} />}
            {dynamicModuleViews[currentView]?.({
              setView,
              currentUser,
              companyId: selectedCompanyId === 'org' ? undefined : selectedCompanyId,
              onSubTitleChange: setSubTitle,
              recordId
            })}
            {currentView === 'OrganizationSettings' && <SettingsModule view="Organization" companyFilter={selectedCompanyId === 'org' ? undefined : selectedCompanyId} />}
            {currentView === 'MyPlanSettings' && <SettingsModule view="MyPlan" companyFilter={selectedCompanyId === 'org' ? undefined : selectedCompanyId} />}
            {currentView === 'CompanySettings' && <SettingsModule view="Companies" companyFilter={selectedCompanyId === 'org' ? undefined : selectedCompanyId} onSubTitleChange={setSubTitle} />}
            {currentView === 'SMTPSettings' && <SettingsModule view="SMTP" companyFilter={selectedCompanyId === 'org' ? undefined : selectedCompanyId} />}
            {currentView === 'LanguageSettings' && <SettingsModule view="Languages" companyFilter={selectedCompanyId === 'org' ? undefined : selectedCompanyId} />}
            {currentView === 'BackupSettings' && <SettingsModule view="Backup" companyFilter={selectedCompanyId === 'org' ? undefined : selectedCompanyId} />}
            {currentView === 'PaymentSettings' && <SettingsModule view="Payments" companyFilter={selectedCompanyId === 'org' ? undefined : selectedCompanyId} />}
            {currentView === 'UserSettings' && <SettingsModule view="Users" companyFilter={selectedCompanyId === 'org' ? undefined : selectedCompanyId} onSubTitleChange={setSubTitle} />}
            {currentView === 'RoleSettings' && <SettingsModule view="RoleSettings" companyFilter={selectedCompanyId === 'org' ? undefined : selectedCompanyId} />}
            {currentView === 'ModuleSettings' && <SettingsModule view="ModuleSettings" companyFilter={selectedCompanyId === 'org' ? undefined : selectedCompanyId} />}
            {currentView === 'CategorySettings' && <SettingsModule view="Categories" companyFilter={selectedCompanyId === 'org' ? undefined : selectedCompanyId} onSubTitleChange={setSubTitle} />}
            {currentView === 'ReferenceSettings' && <SettingsModule view="References" companyFilter={selectedCompanyId === 'org' ? undefined : selectedCompanyId} />}
            {currentView === 'StorageSettings' && <SettingsModule view="Storage" companyFilter={selectedCompanyId === 'org' ? undefined : selectedCompanyId} />}
            {currentView === 'MenuSettings' && (
              <SettingsModule
                view="Menus"
                companyFilter={selectedCompanyId === 'org' ? undefined : selectedCompanyId}
                clientModules={ALL_CLIENT_MODULES}
                activeModuleCodes={readableModuleCodes}
              />
            )}
            {currentView === 'AppBrandingSettings' && <SettingsModule view="AppBranding" />}

      {![
        'Dashboard', 'Projects', 'Social', 'Profile', 'Tickets', 'Users',
        'Roles', 'Subscriptions', 'FileManager', 'Inbox', 'Chat', 'Calendar',
        'FAQ', 'Invoices', 'CreateInvoice', 'InvoiceDetail', ...dynamicModuleViewNames,
        'OrganizationSettings', 'MyPlanSettings', 'CompanySettings', 'SMTPSettings', 'LanguageSettings', 'BackupSettings', 'PaymentSettings', 'UserSettings', 'RoleSettings', 'ModuleSettings', 'CategorySettings', 'ReferenceSettings', 'StorageSettings', 'MenuSettings', 'AppBrandingSettings'
      ].includes(currentView) && (
        <div className="text-muted-foreground flex h-[60vh] flex-col items-center justify-center">
          <i className="fa-solid fa-rocket mb-4 text-6xl opacity-20"></i>
          <h2 className="text-foreground text-xl font-bold">{currentView} Module</h2>
          <p>This module is under development.</p>
        </div>
      )}
    </>
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-background">
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          <Route path="/admin/*" element={<AdminApp />} />
          <Route
            path="/install/:organizationId"
            element={
              <Suspense fallback={<ViewSuspenseFallback />}>
                <InstallAppsPage />
              </Suspense>
            }
          />
          <Route
            path="*"
            element={
              isAuthenticated ? (
                <NavBridge
                  routes={VIEW_ROUTES}
                  blockedViews={TENANT_BLOCKED_SETTINGS_VIEWS}
                  onNavigate={() => {
                    setSubTitle('');
                    setIsSidebarOpen(false);
                  }}
                >
                  {({ currentView, setView, recordId }) => (
                    <LayoutProvider>
                      <SinapsisShell
                        headerStyle={headerShellStyle}
                        headerLeading={<i className="fa-solid fa-bars shrink-0 text-lg text-muted-foreground" aria-hidden />}
                        footerAppNavigation={{
                          setView,
                          currentView,
                          activeModuleCodes: readableModuleCodes,
                          clientModules: ALL_CLIENT_MODULES,
                          blockedViewKeys: TENANT_BLOCKED_SETTINGS_VIEWS
                        }}
                        footerAppName={displayAppName}
                        sidebar={
                          <Sidebar
                            currentView={currentView}
                            setView={setView}
                            selectedCompanyId={selectedCompanyId}
                            onCompanyChange={setSelectedCompanyId}
                            allowedCompanyIds={currentUser?.accessCompanyIds || []}
                            userCompanyId={currentUser?.companyId}
                            organizationName={currentUser?.organizationName}
                            mobileOpen={isSidebarOpen}
                            onMobileClose={() => setIsSidebarOpen(false)}
                            activeModuleCodes={readableModuleCodes}
                            clientModules={ALL_CLIENT_MODULES}
                            sidebarBackgroundColor={publicCore?.sidebarBackgroundColor}
                            sidebarLogoUrl={assetUrl(publicCore?.sidebarLogoUrl)}
                          />
                        }
                        header={
                          <TopBar
                            onLogout={handleLogout}
                            user={currentUser}
                            onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
                            setView={setView}
                            currentView={currentView}
                            activeModuleCodes={readableModuleCodes}
                            clientModules={ALL_CLIENT_MODULES}
                          />
                        }
                        breadcrumb={
                          <BreadcrumbBar
                            currentView={currentView}
                            subTitle={subTitle}
                            setView={setView}
                            moduleBreadcrumbs={dynamicBreadcrumbs}
                          />
                        }
                      >
                        <Suspense fallback={<ViewSuspenseFallback />}>
                          {renderAuthenticatedBody(currentView, setView, recordId)}
                        </Suspense>
                      </SinapsisShell>
                    </LayoutProvider>
                  )}
                </NavBridge>
              ) : (
                <AuthFlow
                  onLoginSuccess={handleLoginSuccess}
                  appName={displayAppName}
                  logoUrl={assetUrl(publicCore?.logoUrl) || null}
                  loginBackgroundUrl={assetUrl(publicCore?.loginBackgroundUrl) || null}
                />
              )
            }
          />
        </Routes>
      </BrowserRouter>
    </div>
  );
};

export default App;










