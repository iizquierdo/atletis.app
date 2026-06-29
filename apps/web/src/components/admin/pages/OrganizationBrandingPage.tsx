import React, { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { adminFetch } from '../api';
import { Alert, AlertContent, AlertDescription, AlertIcon } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { assetUrl } from '@/lib/api-base';
import { AlertCircle, ArrowLeft, CheckCircle2, X } from 'lucide-react';

interface OrgBranding {
  appName: string | null;
  slogan: string | null;
  logoUrl: string | null;
  isologoUrl: string | null;
  faviconUrl: string | null;
  backgroundImageUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
}

const defaultBranding = (): OrgBranding => ({
  appName: null,
  slogan: null,
  logoUrl: null,
  isologoUrl: null,
  faviconUrl: null,
  backgroundImageUrl: null,
  primaryColor: null,
  secondaryColor: null
});

const OrganizationBrandingPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [branding, setBranding] = useState<OrgBranding>(defaultBranding());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setStatus(null);
    try {
      const res = await adminFetch(`/api/admin/organizations/${id}/branding`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
      setBranding({ ...defaultBranding(), ...data });
    } catch (e: unknown) {
      setStatus({ type: 'error', message: e instanceof Error ? e.message : 'No se pudo cargar la configuración' });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const update = <K extends keyof OrgBranding>(key: K, value: OrgBranding[K]) => {
    setBranding((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    if (!id) return;
    setSaving(true);
    setStatus(null);
    try {
      const res = await adminFetch(`/api/admin/organizations/${id}/branding`, {
        method: 'PUT',
        body: JSON.stringify({
          appName: branding.appName || null,
          slogan: branding.slogan || null,
          logoUrl: branding.logoUrl || null,
          isologoUrl: branding.isologoUrl || null,
          faviconUrl: branding.faviconUrl || null,
          backgroundImageUrl: branding.backgroundImageUrl || null,
          primaryColor: branding.primaryColor || null,
          secondaryColor: branding.secondaryColor || null
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Guardar falló');
      setBranding({ ...defaultBranding(), ...data });
      setStatus({ type: 'success', message: 'Configuración guardada.' });
    } catch (e: unknown) {
      setStatus({ type: 'error', message: e instanceof Error ? e.message : 'Guardar falló' });
    } finally {
      setSaving(false);
    }
  };

  const uploadAsset = async (type: 'logoUrl' | 'isologoUrl' | 'faviconUrl' | 'backgroundImageUrl', file: File) => {
    if (!id) return;
    setUploading(type);
    setStatus(null);
    try {
      const fd = new FormData();
      fd.append('type', type);
      fd.append('file', file);
      const res = await adminFetch(`/api/admin/organizations/${id}/branding/upload`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Upload falló');
      update(type, data.url);
      const labels: Record<string, string> = { logoUrl: 'Logo', isologoUrl: 'Isologo', faviconUrl: 'Favicon', backgroundImageUrl: 'Imagen de fondo' };
      setStatus({ type: 'success', message: `${labels[type]} subido.` });
    } catch (e: unknown) {
      setStatus({ type: 'error', message: e instanceof Error ? e.message : 'Upload falló' });
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Link to="/admin/organizations">
          <Button type="button" variant="ghost" size="sm" mode="icon" className="size-8">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <div>
          <h2 className="text-xl font-semibold text-foreground">Branding de la aplicación</h2>
          <p className="text-sm text-muted-foreground">Personaliza el nombre, logos, colores y apariencia para este tenant.</p>
        </div>
      </div>

      {loading && (
        <div className="space-y-2">
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-3 w-64" />
        </div>
      )}

      {status && (
        <Alert variant={status.type === 'success' ? 'success' : 'destructive'} appearance="light" size="md">
          <AlertIcon>
            {status.type === 'success' ? <CheckCircle2 className="size-5" /> : <AlertCircle className="size-5" />}
          </AlertIcon>
          <AlertContent>
            <AlertDescription>{status.message}</AlertDescription>
          </AlertContent>
        </Alert>
      )}

      {/* Identidad */}
      <Card>
        <CardHeader className="min-h-0 py-4">
          <CardTitle className="normal-case text-sm font-semibold">Identidad</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="org-app-name">Nombre de la aplicación</Label>
              <Input
                id="org-app-name"
                value={branding.appName ?? ''}
                placeholder="Ej: Aqua Club"
                onChange={(e) => update('appName', e.target.value || null)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-slogan">Slogan</Label>
              <Input
                id="org-slogan"
                value={branding.slogan ?? ''}
                placeholder="Ej: Nadamos juntos hacia el éxito"
                onChange={(e) => update('slogan', e.target.value || null)}
                disabled={loading}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logos */}
      <Card>
        <CardHeader className="min-h-0 py-4">
          <CardTitle className="normal-case text-sm font-semibold">Logos e íconos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-3">
            {(
              [
                { key: 'logoUrl', label: 'Logo', accept: 'image/*', hint: 'PNG o SVG recomendado' },
                { key: 'isologoUrl', label: 'Isologo', accept: 'image/*', hint: 'Versión compacta (icono + texto)' },
                { key: 'faviconUrl', label: 'Favicon', accept: '.ico,image/png,image/svg+xml,image/x-icon', hint: 'Icono de pestaña del navegador' }
              ] as const
            ).map(({ key, label, accept, hint }) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={`org-${key}`}>{label}</Label>
                <Input
                  id={`org-${key}`}
                  type="file"
                  accept={accept}
                  disabled={uploading !== null || loading}
                  className="text-xs"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) void uploadAsset(key, f);
                  }}
                />
                {uploading === key && <p className="text-xs text-primary">Subiendo…</p>}
                {branding[key] ? (
                  <div className="flex items-center gap-2">
                    <img src={assetUrl(branding[key])} alt={label} className="h-12 max-w-[120px] rounded border object-contain p-1" />
                    <Button type="button" variant="ghost" size="sm" mode="icon" className="size-7 text-muted-foreground hover:text-destructive" onClick={() => update(key, null)} title={`Quitar ${label}`}>
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">{hint}</p>
                )}
              </div>
            ))}
          </div>

          {/* Imagen de fondo */}
          <div className="space-y-2">
            <Label htmlFor="org-bg">Imagen de fondo</Label>
            <Input
              id="org-bg"
              type="file"
              accept="image/*"
              disabled={uploading !== null || loading}
              className="text-xs"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void uploadAsset('backgroundImageUrl', f);
              }}
            />
            {uploading === 'backgroundImageUrl' && <p className="text-xs text-primary">Subiendo…</p>}
            {branding.backgroundImageUrl ? (
              <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3 sm:flex-row sm:items-center">
                <img src={assetUrl(branding.backgroundImageUrl)} alt="Fondo" className="h-24 max-w-full rounded border object-cover sm:max-w-[320px]" />
                <Button type="button" variant="outline" size="sm" onClick={() => update('backgroundImageUrl', null)} disabled={loading}>
                  Quitar imagen de fondo
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Se muestra como fondo en la pantalla de login o en la app. Recomendado: 1920×1080 px.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Colores */}
      <Card>
        <CardHeader className="min-h-0 py-4">
          <CardTitle className="normal-case text-sm font-semibold">Colores</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            {(
              [
                { key: 'primaryColor', label: 'Color primario', placeholder: '#3b82f6', desc: 'Color principal de botones y elementos de acción.' },
                { key: 'secondaryColor', label: 'Color secundario', placeholder: '#f4f4f5', desc: 'Color de acento y elementos secundarios.' }
              ] as const
            ).map(({ key, label, placeholder, desc }) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={`org-${key}`}>{label}</Label>
                <div className="flex items-center gap-2">
                  <input
                    id={`org-${key}-picker`}
                    type="color"
                    value={branding[key] ?? '#ffffff'}
                    onChange={(e) => update(key, e.target.value)}
                    disabled={loading}
                    className="h-9 w-12 cursor-pointer rounded border border-input bg-transparent p-0.5"
                  />
                  <Input
                    id={`org-${key}`}
                    value={branding[key] ?? ''}
                    placeholder={placeholder}
                    onChange={(e) => update(key, e.target.value || null)}
                    disabled={loading}
                    className="font-mono text-sm"
                  />
                  {branding[key] && (
                    <Button type="button" variant="ghost" size="sm" mode="icon" className="size-8 text-muted-foreground hover:text-destructive" onClick={() => update(key, null)} title="Restablecer">
                      <X className="size-3.5" />
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="button" variant="primary" size="md" onClick={() => void save()} disabled={saving || loading}>
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </div>
    </div>
  );
};

export default OrganizationBrandingPage;
