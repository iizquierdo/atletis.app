import React, { useEffect, useState } from 'react';
import { adminFetch } from '../api';
import { Alert, AlertContent, AlertDescription, AlertIcon } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, inputVariants } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

// UI providers. `Railway` is a preset of the S3 backend (S3-compatible storage
// behind a custom endpoint) — it is persisted as provider `S3` with a
// `flavor: 'railway'` marker so the dropdown can reselect it on reload.
type UiProvider = 'Local' | 'Railway' | 'S3' | 'GoogleCloud' | 'Azure';

interface StorageFormState {
  provider: UiProvider;
  settings: Record<string, string | boolean>;
}

const isS3Like = (provider: UiProvider) => provider === 'S3' || provider === 'Railway';

/** Maps the UI form to the backend `{ provider, settings }` payload. */
const toBackendValue = (form: StorageFormState): { provider: string; settings: Record<string, string | boolean> } => {
  if (form.provider === 'Railway') {
    return {
      provider: 'S3',
      settings: {
        ...form.settings,
        flavor: 'railway',
        forcePathStyle: form.settings.forcePathStyle === undefined ? true : form.settings.forcePathStyle
      }
    };
  }
  if (form.provider === 'S3') {
    const { flavor: _flavor, ...rest } = form.settings;
    return { provider: 'S3', settings: rest };
  }
  return { provider: form.provider, settings: form.settings };
};

const INITIAL_STATE: StorageFormState = {
  provider: 'Local',
  settings: {}
};

const selectClass = cn(inputVariants({ variant: 'md' }), 'cursor-pointer');

const StoragePage: React.FC = () => {
  const [form, setForm] = useState<StorageFormState>(INITIAL_STATE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setStatus(null);
      try {
        const res = await adminFetch('/api/admin/settings/storage');
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Failed to load storage settings');

        const value = data?.value || {};
        const providerRaw = String(value?.provider || value?.storageProvider || 'Local');
        const settingsRaw = value?.settings || value?.storageSettings || {};
        const settings = typeof settingsRaw === 'object' && settingsRaw !== null ? settingsRaw : {};

        let provider: UiProvider = 'Local';
        if (providerRaw === 'S3') provider = settings.flavor === 'railway' ? 'Railway' : 'S3';
        else if (providerRaw === 'GoogleCloud' || providerRaw === 'Azure') provider = providerRaw;

        setForm({ provider, settings });
      } catch (error: unknown) {
        setStatus({
          type: 'error',
          message: error instanceof Error ? error.message : 'Failed to load storage settings'
        });
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const updateSetting = (key: string, value: string | boolean) => {
    setForm((prev) => ({
      ...prev,
      settings: { ...prev.settings, [key]: value }
    }));
  };

  const testConnection = async () => {
    setTesting(true);
    setStatus(null);
    try {
      const value = toBackendValue(form);
      const res = await adminFetch('/api/admin/settings/storage/test', {
        method: 'POST',
        body: JSON.stringify({ value })
      });
      const data = await res.json();
      if (!res.ok || data?.ok === false) {
        throw new Error(data?.message || data?.error || 'Connection test failed');
      }
      setStatus({
        type: 'success',
        message: `${data?.message || 'Connection successful.'} Save Storage to apply this configuration to uploads.`
      });
    } catch (error: unknown) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Connection test failed'
      });
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const value = toBackendValue(form);
      const res = await adminFetch('/api/admin/settings/storage', {
        method: 'PUT',
        body: JSON.stringify({ value })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to save storage settings');
      setStatus({ type: 'success', message: 'Storage settings saved successfully. New uploads will use this provider.' });
    } catch (error: unknown) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to save storage settings'
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Storage Configuration</h2>
        <p className="text-sm text-slate-500">Define where platform files will be stored.</p>
      </div>

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

      {loading ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10">
            <Skeleton className="h-4 w-48" />
            <p className="text-sm text-muted-foreground">Loading storage settings...</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="min-h-0 py-4">
            <CardTitle className="normal-case text-base font-semibold">Storage provider</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="storage-provider">Provider</Label>
              <select
                id="storage-provider"
                value={form.provider}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    provider: e.target.value as UiProvider
                  }))
                }
                className={selectClass}
              >
                <option value="Local">Local</option>
                <option value="Railway">Railway (S3)</option>
                <option value="S3">Amazon S3 / S3-compatible</option>
                <option value="GoogleCloud">Google Cloud Storage</option>
                <option value="Azure">Azure Blob Storage</option>
              </select>
            </div>

            {form.provider === 'Local' && (
              <Alert variant="secondary" appearance="outline" size="md">
                <AlertContent>
                  <AlertDescription>Files are stored locally under the server storage folder.</AlertDescription>
                </AlertContent>
              </Alert>
            )}

            {isS3Like(form.provider) && (
              <div className="space-y-4">
                <Alert variant="info" appearance="light" size="md">
                  <AlertContent>
                    <AlertDescription>
                      {form.provider === 'Railway' ? (
                        <>
                          Connect a Railway bucket. From your Railway project, open the bucket plugin and copy
                          its connection values: set <strong>Endpoint</strong> to the bucket's public URL, fill{' '}
                          <strong>Access Key</strong>, <strong>Secret Key</strong> and <strong>Bucket</strong>, and
                          keep <strong>Force path-style</strong> enabled. Use <em>Test connection</em> before saving.
                        </>
                      ) : (
                        <>
                          Works with AWS S3 and any S3-compatible storage (MinIO, Cloudflare R2, ...). Leave{' '}
                          <strong>Endpoint</strong> empty for AWS; set it for S3-compatible services.
                        </>
                      )}
                    </AlertDescription>
                  </AlertContent>
                </Alert>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="s3-endpoint">Endpoint</Label>
                    <Input
                      id="s3-endpoint"
                      type="text"
                      value={String(form.settings.endpoint || '')}
                      onChange={(e) => updateSetting('endpoint', e.target.value)}
                      placeholder="https://bucket-production-xxxx.up.railway.app"
                    />
                    <p className="text-xs text-slate-500">
                      Leave empty for AWS S3. Required for Railway / MinIO / R2.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="s3-access">Access Key</Label>
                    <Input
                      id="s3-access"
                      type="text"
                      value={String(form.settings.accessKey || '')}
                      onChange={(e) => updateSetting('accessKey', e.target.value)}
                      placeholder="AKIA... / minio access key"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="s3-secret">Secret Key</Label>
                    <Input
                      id="s3-secret"
                      type="password"
                      value={String(form.settings.secretKey || '')}
                      onChange={(e) => updateSetting('secretKey', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="s3-bucket">Bucket</Label>
                    <Input
                      id="s3-bucket"
                      type="text"
                      value={String(form.settings.bucket || '')}
                      onChange={(e) => updateSetting('bucket', e.target.value)}
                      placeholder="my-storage-bucket"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="s3-region">Region</Label>
                    <Input
                      id="s3-region"
                      type="text"
                      value={String(form.settings.region || '')}
                      onChange={(e) => updateSetting('region', e.target.value)}
                      placeholder="us-east-1"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="s3-public-url">Public URL (optional)</Label>
                    <Input
                      id="s3-public-url"
                      type="text"
                      value={String(form.settings.publicUrl || '')}
                      onChange={(e) => updateSetting('publicUrl', e.target.value)}
                      placeholder="https://cdn.example.com (leave empty to serve via the app)"
                    />
                    <p className="text-xs text-slate-500">
                      When empty, files are served back through the app at <code>/storage/&lt;key&gt;</code> (no public bucket needed).
                    </p>
                  </div>
                  <div className="flex items-center gap-2 md:col-span-2">
                    <input
                      id="s3-path-style"
                      type="checkbox"
                      className="size-4 cursor-pointer rounded border-slate-300"
                      checked={form.settings.forcePathStyle !== false}
                      onChange={(e) => updateSetting('forcePathStyle', e.target.checked)}
                    />
                    <Label htmlFor="s3-path-style" className="cursor-pointer">
                      Force path-style addressing (required for Railway / MinIO)
                    </Label>
                  </div>
                </div>
              </div>
            )}

            {form.provider === 'GoogleCloud' && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="gcp-project">Project ID</Label>
                  <Input
                    id="gcp-project"
                    type="text"
                    value={String(form.settings.projectId || '')}
                    onChange={(e) => updateSetting('projectId', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gcp-bucket">Bucket</Label>
                  <Input
                    id="gcp-bucket"
                    type="text"
                    value={String(form.settings.bucket || '')}
                    onChange={(e) => updateSetting('bucket', e.target.value)}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="gcp-keyfile">Key File (JSON)</Label>
                  <Textarea
                    id="gcp-keyfile"
                    value={String(form.settings.keyFile || '')}
                    onChange={(e) => updateSetting('keyFile', e.target.value)}
                    rows={4}
                    className="font-mono text-xs"
                    placeholder='{ "type": "service_account", ... }'
                  />
                </div>
              </div>
            )}

            {form.provider === 'Azure' && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="azure-conn">Connection String</Label>
                  <Input
                    id="azure-conn"
                    type="text"
                    value={String(form.settings.connectionString || '')}
                    onChange={(e) => updateSetting('connectionString', e.target.value)}
                    placeholder="DefaultEndpointsProtocol=https;AccountName=..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="azure-container">Container</Label>
                  <Input
                    id="azure-container"
                    type="text"
                    value={String(form.settings.container || '')}
                    onChange={(e) => updateSetting('container', e.target.value)}
                    placeholder="my-container"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              {form.provider !== 'Local' && (
                <Button type="button" variant="outline" onClick={() => void testConnection()} disabled={testing || saving}>
                  {testing ? 'Testing...' : 'Test connection'}
                </Button>
              )}
              <Button type="button" onClick={() => void save()} disabled={saving || testing}>
                {saving ? 'Saving...' : 'Save Storage'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default StoragePage;
