import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BookOpen, Chrome, ExternalLink, GraduationCap, Monitor, Share, Smartphone } from 'lucide-react';
import { assetUrl } from '@/lib/api-base';

type Platform = 'android' | 'ios' | 'browser';

type OrgBranding = {
  appName?: string | null;
  logoUrl?: string | null;
  isologoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  slogan?: string | null;
};

const trimTrailingSlash = (value: string) => String(value || '').replace(/\/+$/, '');

const fallbackParentUrl = trimTrailingSlash(import.meta.env.VITE_PWA_PARENT_URL || 'http://localhost:13510');
const fallbackProfessorUrl = trimTrailingSlash(import.meta.env.VITE_PWA_PROFESSOR_URL || 'http://localhost:13511');

const detectPlatform = (): Platform => {
  if (typeof navigator === 'undefined') return 'browser';
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1);
  if (isIOS) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'browser';
};

const buildAppCards = (urls: { parentUrl: string; professorUrl: string }) => [
  {
    key: 'parents',
    title: 'App Familias',
    description: 'Acceso para madres, padres y tutores.',
    icon: BookOpen,
    baseUrl: urls.parentUrl,
    imageUrl: '/media/install/families.png',
  },
  {
    key: 'professors',
    title: 'App Profesores',
    description: 'Acceso para docentes y equipo tecnico.',
    icon: GraduationCap,
    baseUrl: urls.professorUrl,
    imageUrl: '/media/install/professors.png',
  },
] as const;

const InstallAppsPage: React.FC = () => {
  const { organizationId } = useParams<{ organizationId: string }>();
  const orgId = String(organizationId || '').trim();
  const platform = useMemo(() => detectPlatform(), []);
  const [appUrls, setAppUrls] = useState({
    parentUrl: fallbackParentUrl,
    professorUrl: fallbackProfessorUrl,
  });
  const [branding, setBranding] = useState<OrgBranding | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/public/install-config')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setAppUrls({
          parentUrl: trimTrailingSlash(data.parentUrl || fallbackParentUrl),
          professorUrl: trimTrailingSlash(data.professorUrl || fallbackProfessorUrl),
        });
      })
      .catch(() => {
        if (!cancelled) setAppUrls({ parentUrl: fallbackParentUrl, professorUrl: fallbackProfessorUrl });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    fetch(`/api/public/organizations/${encodeURIComponent(orgId)}/branding`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setBranding(data);
      })
      .catch(() => {
        if (!cancelled) setBranding(null);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const platformLabel = platform === 'android' ? 'Android' : platform === 'ios' ? 'iOS' : 'Navegador';
  const PlatformIcon = platform === 'browser' ? Monitor : Smartphone;

  const buildInstallUrl = (baseUrl: string) => `${baseUrl}/install/${encodeURIComponent(orgId)}`;
  const appCards = useMemo(() => buildAppCards(appUrls), [appUrls]);
  const primaryColor = branding?.primaryColor || '#ef4444';
  const secondaryColor = branding?.secondaryColor || '#0f766e';
  const logoUrl = assetUrl(branding?.logoUrl || branding?.isologoUrl);
  const appName = branding?.appName?.trim() || 'Aplicaciones';

  const primaryButtonStyle = { backgroundColor: primaryColor };

  return (
    <div
      className="min-h-screen px-4 py-8 text-slate-900"
      style={{
        background:
          `radial-gradient(circle at 12% 0%, ${primaryColor}1f 0, transparent 32%),` +
          `radial-gradient(circle at 92% 12%, ${secondaryColor}1f 0, transparent 30%),` +
          'linear-gradient(180deg, #ffffff 0%, #f8fafc 52%, #eef2f7 100%)',
      }}
    >
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl flex-col justify-center">
        <div className="mb-8">
          {logoUrl && (
            <img
              src={logoUrl}
              alt={appName}
              className="mb-5 h-14 max-w-[220px] object-contain"
            />
          )}
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-slate-500 shadow-sm">
            <PlatformIcon className="h-4 w-4" style={{ color: primaryColor }} />
            Detectado: {platformLabel}
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
            Instala {appName}
          </h1>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-500">
            {branding?.slogan ||
              'Elegi la aplicacion que corresponda. El enlace configura automaticamente la organizacion antes de ingresar.'}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {appCards.map((app) => {
            const Icon = app.icon;
            const installUrl = buildInstallUrl(app.baseUrl);

            return (
              <section key={app.key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="relative aspect-[16/10] overflow-hidden bg-slate-100">
                  <img src={app.imageUrl} alt="" className="h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/45 via-transparent to-transparent" />
                </div>

                <div className="p-5">
                  <div className="mb-5 flex items-start gap-4">
                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
                      style={{ backgroundColor: `${primaryColor}14`, color: primaryColor }}
                    >
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-lg font-bold text-slate-950">{app.title}</h2>
                      <p className="mt-1 text-sm text-slate-500">{app.description}</p>
                    </div>
                  </div>

                  {platform === 'android' && (
                    <a
                      href={installUrl}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:opacity-90"
                      style={primaryButtonStyle}
                    >
                      <Smartphone className="h-4 w-4" />
                      Instalar
                    </a>
                  )}

                  {platform === 'ios' && (
                    <div className="space-y-4">
                      <a
                        href={installUrl}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:opacity-90"
                        style={primaryButtonStyle}
                      >
                        Abrir aplicacion
                        <ExternalLink className="h-4 w-4" />
                      </a>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                          Instalar en iPhone/iPad
                        </p>
                        <ol className="mt-3 space-y-2 text-sm text-slate-600">
                          <li className="flex gap-2"><span className="font-bold text-slate-900">1.</span> Abri el enlace con Safari.</li>
                          <li className="flex gap-2"><span className="font-bold text-slate-900">2.</span> Toca el boton Compartir <Share className="mt-0.5 h-4 w-4 shrink-0" />.</li>
                          <li className="flex gap-2"><span className="font-bold text-slate-900">3.</span> Elegi Agregar a pantalla de inicio.</li>
                          <li className="flex gap-2"><span className="font-bold text-slate-900">4.</span> Confirma con Agregar.</li>
                        </ol>
                      </div>
                    </div>
                  )}

                  {platform === 'browser' && (
                    <div className="space-y-3">
                      <a
                        href={installUrl}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:opacity-90"
                        style={primaryButtonStyle}
                      >
                        Instalar aplicacion
                        <ExternalLink className="h-4 w-4" />
                      </a>
                      <a
                        href={installUrl}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold transition hover:bg-slate-50"
                        style={{ color: secondaryColor }}
                      >
                        <Chrome className="h-4 w-4" />
                        Continuar en navegador
                      </a>
                      <p className="text-xs leading-5 text-slate-400">
                        En Chrome o Edge tambien podes instalarla desde el icono de instalacion de la barra de direcciones.
                      </p>
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
};

export default InstallAppsPage;
