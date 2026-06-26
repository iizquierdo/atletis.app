import React, { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { BookOpen, Chrome, ExternalLink, GraduationCap, Monitor, Share, Smartphone } from 'lucide-react';

type Platform = 'android' | 'ios' | 'browser';

const trimTrailingSlash = (value: string) => String(value || '').replace(/\/+$/, '');

const configuredParentUrl = trimTrailingSlash(import.meta.env.VITE_PWA_PARENT_URL || 'http://localhost:13510');
const configuredProfessorUrl = trimTrailingSlash(import.meta.env.VITE_PWA_PROFESSOR_URL || 'http://localhost:13511');

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

const appCards = [
  {
    key: 'parents',
    title: 'App Familias',
    description: 'Acceso para madres, padres y tutores.',
    icon: BookOpen,
    baseUrl: configuredParentUrl,
  },
  {
    key: 'professors',
    title: 'App Profesores',
    description: 'Acceso para docentes y equipo técnico.',
    icon: GraduationCap,
    baseUrl: configuredProfessorUrl,
  },
] as const;

const InstallAppsPage: React.FC = () => {
  const { organizationId } = useParams<{ organizationId: string }>();
  const orgId = String(organizationId || '').trim();
  const platform = useMemo(() => detectPlatform(), []);

  const platformLabel = platform === 'android' ? 'Android' : platform === 'ios' ? 'iOS' : 'Navegador';
  const PlatformIcon = platform === 'browser' ? Monitor : Smartphone;

  const buildInstallUrl = (baseUrl: string) => `${baseUrl}/install/${encodeURIComponent(orgId)}`;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl flex-col justify-center">
        <div className="mb-8">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-slate-500 shadow-sm">
            <PlatformIcon className="h-4 w-4 text-red-500" />
            Detectado: {platformLabel}
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">Instalar aplicaciones</h1>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-500">
            Elegí la aplicación que corresponda. El enlace configura automáticamente la organización antes de ingresar.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {appCards.map((app) => {
            const Icon = app.icon;
            const installUrl = buildInstallUrl(app.baseUrl);

            return (
              <section key={app.key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-5 flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-500">
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
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-red-600"
                  >
                    <Smartphone className="h-4 w-4" />
                    Instalar
                  </a>
                )}

                {platform === 'ios' && (
                  <div className="space-y-4">
                    <a
                      href={installUrl}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-red-600"
                    >
                      Abrir aplicación
                      <ExternalLink className="h-4 w-4" />
                    </a>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Instalar en iPhone/iPad</p>
                      <ol className="mt-3 space-y-2 text-sm text-slate-600">
                        <li className="flex gap-2"><span className="font-bold text-slate-900">1.</span> Abrí el enlace con Safari.</li>
                        <li className="flex gap-2"><span className="font-bold text-slate-900">2.</span> Tocá el botón Compartir <Share className="mt-0.5 h-4 w-4 shrink-0" />.</li>
                        <li className="flex gap-2"><span className="font-bold text-slate-900">3.</span> Elegí “Agregar a pantalla de inicio”.</li>
                        <li className="flex gap-2"><span className="font-bold text-slate-900">4.</span> Confirmá con “Agregar”.</li>
                      </ol>
                    </div>
                  </div>
                )}

                {platform === 'browser' && (
                  <div className="space-y-3">
                    <a
                      href={installUrl}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-red-600"
                    >
                      Instalar aplicación
                      <ExternalLink className="h-4 w-4" />
                    </a>
                    <a
                      href={installUrl}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                    >
                      <Chrome className="h-4 w-4" />
                      Continuar en navegador
                    </a>
                    <p className="text-xs leading-5 text-slate-400">
                      En Chrome o Edge también podés instalarla desde el icono de instalación de la barra de direcciones.
                    </p>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
};

export default InstallAppsPage;
