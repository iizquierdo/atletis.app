import path from 'path';
import fs from 'fs';
import type { Pool } from 'pg';

/**
 * Unified file storage for the platform. The active backend is configured from
 * the admin UI (`/admin/settings/storage`) and persisted in the `PlatformSetting`
 * row with key `storage`. Every upload site (core + modules) should route file
 * writes through {@link putObject} so switching the provider takes effect
 * everywhere without touching call sites.
 *
 * Supported providers:
 *  - `Local`: writes under the on-disk storage root, served by `/storage/*`.
 *  - `S3`: any S3-compatible bucket. Works with AWS S3 and S3-compatible
 *    services such as Railway's object storage / MinIO by supplying a custom
 *    `endpoint` and path-style addressing.
 */

export type StorageProvider = 'Local' | 'S3' | 'GoogleCloud' | 'Azure';

export interface StorageSettings {
  // S3 / S3-compatible (Railway, MinIO, AWS, ...)
  endpoint?: string;
  region?: string;
  accessKey?: string;
  secretKey?: string;
  bucket?: string;
  forcePathStyle?: boolean | string;
  /** Optional public base URL for objects (e.g. a CDN). When empty, files are
   *  served back through the API `/storage/*` proxy. */
  publicUrl?: string;
  [key: string]: unknown;
}

export interface StorageConfig {
  provider: StorageProvider;
  settings: StorageSettings;
}

const DEFAULT_CONFIG: StorageConfig = { provider: 'Local', settings: {} };
const VALID_PROVIDERS: StorageProvider[] = ['Local', 'S3', 'GoogleCloud', 'Azure'];

const asBool = (v: unknown): boolean =>
  v === true || String(v ?? '').trim().toLowerCase() === 'true';

const firstString = (...values: unknown[]): string => {
  for (const value of values) {
    const normalized = String(value ?? '').trim();
    if (normalized) return normalized;
  }
  return '';
};

export const normalizeKey = (key: string): string =>
  String(key || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/^storage\//, '');

/** Extract object key from any persisted file URL format. */
export const extractObjectKey = (storedUrl: string): string | null => {
  const url = String(storedUrl || '').trim();
  if (!url) return null;

  const storageMatch = url.match(/\/storage\/([^?#]+)/);
  if (storageMatch?.[1]) return normalizeKey(storageMatch[1]);

  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const parsed = new URL(url);
      const path = parsed.pathname.replace(/^\/+/, '');
      if (path) return normalizeKey(path);
    } catch {
      return null;
    }
  }

  if (url.startsWith('/')) return normalizeKey(url.slice(1));
  if (!url.includes('://')) return normalizeKey(url);
  return null;
};

/** Rebuild a stored URL using the active storage configuration. */
export const resolveStoredObjectUrl = (
  storedUrl: string | null | undefined,
  config: StorageConfig
): string | null => {
  const key = extractObjectKey(String(storedUrl || ''));
  if (!key) return null;
  return objectUrl(config, key);
};

/** On-disk root for the `Local` provider. Mirrors apps/api `STORAGE_ROOT`. */
const storageRoot = (): string =>
  process.env.STORAGE_ROOT
    ? path.resolve(process.env.STORAGE_ROOT)
    : path.resolve(process.cwd(), 'storage');

/**
 * Reads the active storage configuration from the `storage` platform setting.
 * Falls back to the local-disk provider when the setting (or table) is absent,
 * so uploads keep working on a fresh database.
 */
export const loadStorageConfig = async (pool: Pool): Promise<StorageConfig> => {
  try {
    const result = await pool.query('SELECT value FROM "PlatformSetting" WHERE "key" = $1 LIMIT 1', ['storage']);
    const value = result.rows[0]?.value;
    if (!value || typeof value !== 'object') return DEFAULT_CONFIG;
    const v = value as Record<string, unknown>;
    const providerRaw = String(v.provider || v.storageProvider || 'Local');
    const provider = (VALID_PROVIDERS as string[]).includes(providerRaw)
      ? (providerRaw as StorageProvider)
      : 'Local';
    const settingsRaw = (v.settings || v.storageSettings || {}) as unknown;
    const settings = settingsRaw && typeof settingsRaw === 'object' ? (settingsRaw as StorageSettings) : {};
    return { provider, settings };
  } catch {
    return DEFAULT_CONFIG;
  }
};

// --- S3 client (lazy, cached by credential signature) ---------------------

let cachedS3: { signature: string; client: unknown } | null = null;

const s3ForcePathStyle = (settings: StorageSettings): boolean => {
  if (settings.forcePathStyle !== undefined) return asBool(settings.forcePathStyle);
  // S3-compatible services behind a custom endpoint (Railway/MinIO) need
  // path-style addressing; AWS itself does not.
  return Boolean(String(settings.endpoint || '').trim());
};

const getS3Client = async (settings: StorageSettings) => {
  const { S3Client } = await import('@aws-sdk/client-s3');
  const endpoint = firstString(settings.endpoint) || undefined;
  const region = firstString(settings.region) || 'us-east-1';
  const accessKeyId = firstString(
    settings.accessKey,
    settings.accessKeyId,
    settings.awsAccessKeyId,
    settings.AWS_ACCESS_KEY_ID
  );
  const secretAccessKey = firstString(
    settings.secretKey,
    settings.secretAccessKey,
    settings.awsSecretAccessKey,
    settings.AWS_SECRET_ACCESS_KEY
  );
  const forcePathStyle = s3ForcePathStyle(settings);

  const signature = JSON.stringify({ endpoint, region, accessKeyId, forcePathStyle, hasSecret: Boolean(secretAccessKey) });
  if (cachedS3 && cachedS3.signature === signature) return cachedS3.client as InstanceType<typeof S3Client>;

  const client = new S3Client({
    region,
    endpoint,
    forcePathStyle,
    credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined
  });
  cachedS3 = { signature, client };
  return client;
};

const requireBucket = (settings: StorageSettings): string => {
  const bucket = firstString(settings.bucket, settings.bucketName, settings.AWS_BUCKET);
  if (!bucket) throw new Error('S3 storage is selected but no bucket is configured.');
  return bucket;
};

// --- Public API -----------------------------------------------------------

export interface PutObjectInput {
  pool: Pool;
  /** Relative object key, e.g. `org_x/files/clients/123/photo.png`. */
  key: string;
  buffer: Buffer;
  contentType?: string | null;
  /** Pre-loaded config to avoid re-querying when uploading many objects. */
  config?: StorageConfig;
}

export interface PutObjectResult {
  /** URL to persist and hand back to clients. Always `/storage/<key>` so the
   *  same value works regardless of the active provider (the `/storage/*`
   *  route proxies to S3 when needed), unless a `publicUrl` base is set. */
  url: string;
  key: string;
  provider: StorageProvider;
}

/** The canonical URL for an object key under the active provider. */
export const objectUrl = (config: StorageConfig, key: string): string => {
  const k = normalizeKey(key);
  if (config.provider === 'S3') {
    const base = String(config.settings.publicUrl || '').trim().replace(/\/+$/, '');
    if (base) return `${base}/${k}`;
  }
  return `/storage/${k}`;
};

/** Latest uploaded avatar object key for a user (`avatar_<userId>_*.ext`), if any. */
export const findLatestUserAvatarKey = async (
  pool: Pool,
  orgFolderName: string,
  userId: string,
  config?: StorageConfig
): Promise<string | null> => {
  const cfg = config || (await loadStorageConfig(pool));
  const prefix = `${normalizeKey(orgFolderName)}/avatar_${userId}_`;

  if (cfg.provider === 'S3') {
    try {
      const bucket = requireBucket(cfg.settings);
      const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
      const client = await getS3Client(cfg.settings);
      const out = await (client as { send: (cmd: unknown) => Promise<{ Contents?: Array<{ Key?: string }> }> }).send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix })
      );
      const keys = (out.Contents || []).map((o) => o.Key).filter(Boolean) as string[];
      if (!keys.length) return null;
      return keys.sort().at(-1) ?? null;
    } catch {
      return null;
    }
  }

  const dir = path.join(storageRoot(), normalizeKey(orgFolderName));
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => f.startsWith(`avatar_${userId}_`));
  if (!files.length) return null;
  const latest = files.sort().at(-1);
  return latest ? `${normalizeKey(orgFolderName)}/${latest}` : null;
};

/** Stores a file with the active provider and returns its servable URL. */
export const putObject = async ({ pool, key, buffer, contentType, config }: PutObjectInput): Promise<PutObjectResult> => {
  const cfg = config || (await loadStorageConfig(pool));
  const k = normalizeKey(key);

  if (cfg.provider === 'S3') {
    const bucket = requireBucket(cfg.settings);
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await getS3Client(cfg.settings);
    await (client as { send: (cmd: unknown) => Promise<unknown> }).send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: k,
        Body: buffer,
        ContentType: contentType || 'application/octet-stream'
      })
    );
    return { url: objectUrl(cfg, k), key: k, provider: 'S3' };
  }

  if (cfg.provider === 'GoogleCloud' || cfg.provider === 'Azure') {
    throw new Error(`Storage provider ${cfg.provider} is not implemented yet. Use Local or S3.`);
  }

  // Local
  const finalPath = path.join(storageRoot(), ...k.split('/'));
  const dir = path.dirname(finalPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(finalPath, buffer);
  return { url: `/storage/${k}`, key: k, provider: 'Local' };
};

export interface ObjectStream {
  body: NodeJS.ReadableStream;
  contentType?: string;
  contentLength?: number;
}

/**
 * Fetches an object body for the `/storage/*` proxy when the active provider is
 * S3. Returns `null` for Local (the static file server handles those) or when
 * the object does not exist.
 */
export const getObjectStream = async (pool: Pool, key: string, config?: StorageConfig): Promise<ObjectStream | null> => {
  const cfg = config || (await loadStorageConfig(pool));
  if (cfg.provider !== 'S3') return null;

  const bucket = requireBucket(cfg.settings);
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  const client = await getS3Client(cfg.settings);
  try {
    const out = (await (client as { send: (cmd: unknown) => Promise<any> }).send(
      new GetObjectCommand({ Bucket: bucket, Key: normalizeKey(key) })
    )) as { Body?: unknown; ContentType?: string; ContentLength?: number };
    if (!out?.Body) return null;
    return {
      body: out.Body as NodeJS.ReadableStream,
      contentType: out.ContentType,
      contentLength: out.ContentLength
    };
  } catch (error: unknown) {
    const name = (error as { name?: string })?.name || '';
    if (name === 'NoSuchKey' || name === 'NotFound') return null;
    throw error;
  }
};

/** Best-effort delete of a stored object. Local unlinks the file; S3 issues a delete. */
export const deleteObject = async (pool: Pool, key: string, config?: StorageConfig): Promise<void> => {
  const cfg = config || (await loadStorageConfig(pool));
  const k = normalizeKey(key);
  if (cfg.provider === 'S3') {
    const bucket = requireBucket(cfg.settings);
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await getS3Client(cfg.settings);
    await (client as { send: (cmd: unknown) => Promise<unknown> }).send(
      new DeleteObjectCommand({ Bucket: bucket, Key: k })
    );
    return;
  }
  const finalPath = path.join(storageRoot(), ...k.split('/'));
  if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
};

/** Lightweight connectivity check used by the admin "Test" action. */
export const testStorageConfig = async (config: StorageConfig): Promise<{ ok: boolean; message: string }> => {
  if (config.provider === 'Local') return { ok: true, message: 'Local storage is always available.' };
  if (config.provider === 'S3') {
    const testKey = `_storage-tests/${Date.now()}_${Math.random().toString(36).slice(2)}.txt`;
    try {
      const bucket = requireBucket(config.settings);
      const { DeleteObjectCommand, HeadBucketCommand, PutObjectCommand } = await import('@aws-sdk/client-s3');
      const client = await getS3Client(config.settings);
      await (client as { send: (cmd: unknown) => Promise<unknown> }).send(new HeadBucketCommand({ Bucket: bucket }));
      await (client as { send: (cmd: unknown) => Promise<unknown> }).send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: testKey,
          Body: Buffer.from('storage write test\n', 'utf8'),
          ContentType: 'text/plain; charset=utf-8'
        })
      );
      try {
        await (client as { send: (cmd: unknown) => Promise<unknown> }).send(
          new DeleteObjectCommand({ Bucket: bucket, Key: testKey })
        );
      } catch {
        // The write test succeeded; cleanup failure should not block saving.
      }
      return { ok: true, message: `Connected to bucket "${bucket}" and verified write access.` };
    } catch (error: unknown) {
      return { ok: false, message: (error as Error)?.message || 'Failed to reach the S3 bucket.' };
    }
  }
  return { ok: false, message: `Storage provider ${config.provider} is not implemented yet.` };
};
