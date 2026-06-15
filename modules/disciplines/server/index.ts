import express from 'express';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import type { Pool } from 'pg';
import {
  fetchMergedItemsByCategoryCodes,
  resolveRequesterScope,
  resolveTenantAuthContext,
  getRequesterUserId,
  type RequesterScope
} from '@sinapsis/module-sdk-server';

const storage = multer.memoryStorage();
const upload = multer({ storage });

interface DisciplinesModuleContext {
  app: express.Express;
  pool: Pool;
}

const MODULE_CODE = 'DISCIPLINES';
const VISIBILITY_CODE = 'DISCIPLINE_RESOURCE_VISIBILITY';
const TYPE_CODE = 'DISCIPLINE_RESOURCE_TYPE';

/** Resource visibility levels a requester may see (mirrors the source RBAC). */
const allowedVisibilities = (scope: RequesterScope | null): string[] => {
  if (!scope) return ['PUBLIC'];
  if (scope.isSuperAdmin || scope.isAdminSede) return ['ADMIN_ONLY', 'STAFF_ONLY', 'MEMBERS_ONLY', 'PUBLIC'];
  if (scope.isProfesor) return ['STAFF_ONLY', 'MEMBERS_ONLY', 'PUBLIC'];
  if (scope.isTutor) return ['MEMBERS_ONLY', 'PUBLIC'];
  return ['PUBLIC'];
};

export default function registerDisciplinesModule({ app, pool }: DisciplinesModuleContext) {
  const router = express.Router();

  const requesterId = (req: express.Request): string =>
    String((req as any).authUserId || getRequesterUserId(req) || '').trim();

  const ensureActive = async () => {
    const mod = await pool.query('SELECT status FROM "SystemModule" WHERE code = $1 LIMIT 1', [MODULE_CODE]);
    return String(mod.rows[0]?.status || '') === 'Active';
  };

  const disciplineExists = async (id: string) => {
    const r = await pool.query('SELECT id FROM "Discipline" WHERE id = $1 LIMIT 1', [id]);
    return Boolean(r.rows[0]?.id);
  };

  const getDisciplineById = async (id: string) => {
    const r = await pool.query(
      `
        SELECT d.*,
               creator.name AS "createdByName",
               updater.name AS "updatedByName",
               (SELECT COUNT(*)::int FROM "DisciplineLevel" l WHERE l."disciplineId" = d.id) AS "levelCount",
               (SELECT COUNT(*)::int FROM "DisciplineResource" r WHERE r."disciplineId" = d.id AND r.active = true) AS "resourceCount"
        FROM "Discipline" d
        JOIN "User" creator ON creator.id = d."createdById"
        JOIN "User" updater ON updater.id = d."updatedById"
        WHERE d.id = $1
        LIMIT 1
      `,
      [id]
    );
    return r.rows[0] || null;
  };

  // ---- Docs -----------------------------------------------------------------
  router.get('/openapi.json', async (req, res) => {
    const serverUrl = `${req.protocol}://${req.get('host')}`;
    res.json({
      openapi: '3.0.3',
      info: { title: 'Sinapsis Disciplines API', version: '1.0.0', description: 'Disciplines, levels and resources.' },
      tags: [{ name: 'Disciplines' }],
      servers: [{ url: serverUrl }],
      paths: {
        '/api/disciplines/meta': { get: { tags: ['Disciplines'], summary: 'Catalog metadata', responses: { '200': { description: 'ok' } } } },
        '/api/disciplines': {
          get: { tags: ['Disciplines'], summary: 'List disciplines', responses: { '200': { description: 'ok' } } },
          post: { tags: ['Disciplines'], summary: 'Create discipline', responses: { '201': { description: 'created' } } }
        },
        '/api/disciplines/{id}': {
          get: { tags: ['Disciplines'], summary: 'Get discipline', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'ok' } } },
          put: { tags: ['Disciplines'], summary: 'Update discipline', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'ok' } } }
        },
        '/api/disciplines/{id}/status': { patch: { tags: ['Disciplines'], summary: 'Toggle status', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'ok' } } } },
        '/api/disciplines/{id}/levels': { get: {}, post: {} },
        '/api/disciplines/{id}/levels/reorder': { post: {} },
        '/api/disciplines/{id}/resources': { get: {}, post: {} }
      }
    });
  });

  router.get('/docs', async (req, res) => {
    const html = `<!doctype html><html><head><meta charset="utf-8" /><title>Sinapsis Disciplines API</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" /></head>
<body><div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>window.ui = SwaggerUIBundle({ url: '/api/disciplines/openapi.json', dom_id: '#swagger-ui', deepLinking: true });</script>
</body></html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });

  // ---- Meta (dropdown catalogs) --------------------------------------------
  router.get('/meta', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Disciplines module is not active.' });
      const uid = requesterId(req);
      const ctx = uid ? await resolveTenantAuthContext(pool, uid) : null;
      const organizationId = ctx?.organizationId || '';
      const catMap = await fetchMergedItemsByCategoryCodes(pool, {
        codes: [TYPE_CODE, VISIBILITY_CODE],
        organizationId,
        companyIdContext: null,
        activeOnly: true
      });
      res.json({
        categories: {
          resourceTypes: catMap.get(TYPE_CODE) || [],
          visibilities: catMap.get(VISIBILITY_CODE) || []
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to load disciplines metadata', details: error.message });
    }
  });

  // ---- Disciplines collection ----------------------------------------------
  router.get('/', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Disciplines module is not active.' });
      const search = String(req.query.search || '').trim();
      const active = String(req.query.active || '').trim();

      const where: string[] = [];
      const params: any[] = [];
      if (search) {
        params.push(`%${search}%`);
        where.push(`(LOWER(d.name) LIKE LOWER($${params.length}) OR LOWER(COALESCE(d.description, '')) LIKE LOWER($${params.length}))`);
      }
      if (active === 'true' || active === 'false') {
        params.push(active === 'true');
        where.push(`d.active = $${params.length}`);
      }

      const result = await pool.query(
        `
          SELECT d.*,
                 (SELECT COUNT(*)::int FROM "DisciplineLevel" l WHERE l."disciplineId" = d.id) AS "levelCount",
                 (SELECT COUNT(*)::int FROM "DisciplineResource" r WHERE r."disciplineId" = d.id AND r.active = true) AS "resourceCount"
          FROM "Discipline" d
          ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
          ORDER BY d.name ASC
        `,
        params
      );
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch disciplines', details: error.message });
    }
  });

  router.post('/', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Disciplines module is not active.' });
      const name = String(req.body?.name || '').trim();
      const userId = requesterId(req) || String(req.body?.createdById || '').trim();
      if (!name) return res.status(400).json({ error: 'name is required.' });
      if (!userId) return res.status(400).json({ error: 'requester user is required.' });

      const dup = await pool.query('SELECT id FROM "Discipline" WHERE LOWER(name) = LOWER($1) LIMIT 1', [name]);
      if (dup.rows[0]) return res.status(409).json({ error: 'A discipline with that name already exists.' });

      const id = crypto.randomUUID();
      await pool.query(
        `INSERT INTO "Discipline" (id, name, description, "imageUrl", active, "createdById", "updatedById", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $6, NOW(), NOW())`,
        [
          id,
          name,
          String(req.body?.description || '').trim() || null,
          String(req.body?.imageUrl || '').trim() || null,
          req.body?.active === false ? false : true,
          userId
        ]
      );
      res.status(201).json(await getDisciplineById(id));
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to create discipline', details: error.message });
    }
  });

  // ---- Levels ---------------------------------------------------------------
  router.get('/:id/levels', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Disciplines module is not active.' });
      if (!(await disciplineExists(req.params.id))) return res.status(404).json({ error: 'Discipline not found' });
      const result = await pool.query(
        'SELECT * FROM "DisciplineLevel" WHERE "disciplineId" = $1 ORDER BY "levelOrder" ASC, name ASC',
        [req.params.id]
      );
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch levels', details: error.message });
    }
  });

  router.post('/:id/levels', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Disciplines module is not active.' });
      const disciplineId = req.params.id;
      if (!(await disciplineExists(disciplineId))) return res.status(404).json({ error: 'Discipline not found' });
      const name = String(req.body?.name || '').trim();
      if (!name) return res.status(400).json({ error: 'name is required.' });

      let levelOrder = Number(req.body?.levelOrder);
      if (!Number.isFinite(levelOrder)) {
        const max = await pool.query('SELECT COALESCE(MAX("levelOrder"), -1) AS m FROM "DisciplineLevel" WHERE "disciplineId" = $1', [disciplineId]);
        levelOrder = Number(max.rows[0]?.m ?? -1) + 1;
      }

      const id = crypto.randomUUID();
      await pool.query(
        `INSERT INTO "DisciplineLevel" (id, "disciplineId", name, description, "levelOrder", color, active, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
        [
          id,
          disciplineId,
          name,
          String(req.body?.description || '').trim() || null,
          levelOrder,
          String(req.body?.color || '').trim() || null,
          req.body?.active === false ? false : true
        ]
      );
      const created = await pool.query('SELECT * FROM "DisciplineLevel" WHERE id = $1', [id]);
      res.status(201).json(created.rows[0]);
    } catch (error: any) {
      if (String(error?.code) === '23505') return res.status(409).json({ error: 'Level name or order already in use for this discipline.' });
      res.status(500).json({ error: 'Failed to create level', details: error.message });
    }
  });

  router.put('/:id/levels/:levelId', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Disciplines module is not active.' });
      const { id: disciplineId, levelId } = req.params;
      const existing = await pool.query('SELECT * FROM "DisciplineLevel" WHERE id = $1 AND "disciplineId" = $2 LIMIT 1', [levelId, disciplineId]);
      const level = existing.rows[0];
      if (!level) return res.status(404).json({ error: 'Level not found' });

      await pool.query(
        `UPDATE "DisciplineLevel"
         SET name = $1, description = $2, "levelOrder" = $3, color = $4, active = $5, "updatedAt" = NOW()
         WHERE id = $6`,
        [
          String(req.body?.name ?? level.name).trim() || level.name,
          req.body?.description !== undefined ? (String(req.body.description).trim() || null) : level.description,
          Number.isFinite(Number(req.body?.levelOrder)) ? Number(req.body.levelOrder) : level.levelOrder,
          req.body?.color !== undefined ? (String(req.body.color).trim() || null) : level.color,
          req.body?.active !== undefined ? Boolean(req.body.active) : level.active,
          levelId
        ]
      );
      const updated = await pool.query('SELECT * FROM "DisciplineLevel" WHERE id = $1', [levelId]);
      res.json(updated.rows[0]);
    } catch (error: any) {
      if (String(error?.code) === '23505') return res.status(409).json({ error: 'Level name or order already in use for this discipline.' });
      res.status(500).json({ error: 'Failed to update level', details: error.message });
    }
  });

  router.patch('/:id/levels/:levelId/status', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Disciplines module is not active.' });
      const { id: disciplineId, levelId } = req.params;
      const active = Boolean(req.body?.active);
      const r = await pool.query('UPDATE "DisciplineLevel" SET active = $1, "updatedAt" = NOW() WHERE id = $2 AND "disciplineId" = $3', [active, levelId, disciplineId]);
      if (!r.rowCount) return res.status(404).json({ error: 'Level not found' });
      const updated = await pool.query('SELECT * FROM "DisciplineLevel" WHERE id = $1', [levelId]);
      res.json(updated.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update level status', details: error.message });
    }
  });

  // Reorder via a two-phase update to avoid (disciplineId, levelOrder) unique clashes.
  router.post('/:id/levels/reorder', async (req, res) => {
    const client = await pool.connect();
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Disciplines module is not active.' });
      const disciplineId = req.params.id;
      const orderedLevelIds: string[] = Array.isArray(req.body?.orderedLevelIds) ? req.body.orderedLevelIds.map((x: any) => String(x)) : [];
      if (!orderedLevelIds.length) return res.status(400).json({ error: 'orderedLevelIds is required.' });

      await client.query('BEGIN');
      // Phase 1: push to a high temporary band to free up target slots.
      for (let i = 0; i < orderedLevelIds.length; i += 1) {
        await client.query('UPDATE "DisciplineLevel" SET "levelOrder" = $1, "updatedAt" = NOW() WHERE id = $2 AND "disciplineId" = $3', [1000 + i, orderedLevelIds[i], disciplineId]);
      }
      // Phase 2: assign final 0..n order.
      for (let i = 0; i < orderedLevelIds.length; i += 1) {
        await client.query('UPDATE "DisciplineLevel" SET "levelOrder" = $1, "updatedAt" = NOW() WHERE id = $2 AND "disciplineId" = $3', [i, orderedLevelIds[i], disciplineId]);
      }
      await client.query('COMMIT');

      const result = await pool.query('SELECT * FROM "DisciplineLevel" WHERE "disciplineId" = $1 ORDER BY "levelOrder" ASC', [disciplineId]);
      res.json(result.rows);
    } catch (error: any) {
      await client.query('ROLLBACK').catch(() => {});
      res.status(500).json({ error: 'Failed to reorder levels', details: error.message });
    } finally {
      client.release();
    }
  });

  // ---- Resources ------------------------------------------------------------
  router.get('/:id/resources', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Disciplines module is not active.' });
      if (!(await disciplineExists(req.params.id))) return res.status(404).json({ error: 'Discipline not found' });

      const scope = await resolveRequesterScope(pool, requesterId(req));
      const visibilities = allowedVisibilities(scope);
      const result = await pool.query(
        `
          SELECT r.*, creator.name AS "createdByName"
          FROM "DisciplineResource" r
          JOIN "User" creator ON creator.id = r."createdById"
          WHERE r."disciplineId" = $1 AND r.active = true AND r.visibility = ANY($2)
          ORDER BY r."createdAt" DESC
        `,
        [req.params.id, visibilities]
      );
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch resources', details: error.message });
    }
  });

  const insertResource = async (disciplineId: string, body: any, userId: string, storageKey?: string | null, resourceUrl?: string | null) => {
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO "DisciplineResource"
        (id, "disciplineId", title, description, type, "resourceUrl", "storageKey", "thumbnailUrl", visibility, "publishedAt", active, "createdById", "updatedById", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12, NOW(), NOW())`,
      [
        id,
        disciplineId,
        String(body?.title || '').trim() || 'Recurso',
        String(body?.description || '').trim() || null,
        String(body?.type || 'GENERAL_FILE').trim() || 'GENERAL_FILE',
        resourceUrl ?? (String(body?.resourceUrl || '').trim() || null),
        storageKey ?? (String(body?.storageKey || '').trim() || null),
        String(body?.thumbnailUrl || '').trim() || null,
        String(body?.visibility || 'STAFF_ONLY').trim() || 'STAFF_ONLY',
        body?.publishedAt ? new Date(body.publishedAt) : null,
        body?.active === false ? false : true,
        userId
      ]
    );
    const created = await pool.query('SELECT * FROM "DisciplineResource" WHERE id = $1', [id]);
    return created.rows[0];
  };

  router.post('/:id/resources', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Disciplines module is not active.' });
      const disciplineId = req.params.id;
      if (!(await disciplineExists(disciplineId))) return res.status(404).json({ error: 'Discipline not found' });
      const userId = requesterId(req) || String(req.body?.createdById || '').trim();
      if (!userId) return res.status(400).json({ error: 'requester user is required.' });
      const title = String(req.body?.title || '').trim();
      if (!title) return res.status(400).json({ error: 'title is required.' });
      res.status(201).json(await insertResource(disciplineId, req.body, userId));
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to create resource', details: error.message });
    }
  });

  router.post('/:id/resources/upload', upload.single('file'), async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Disciplines module is not active.' });
      const disciplineId = req.params.id;
      if (!(await disciplineExists(disciplineId))) return res.status(404).json({ error: 'Discipline not found' });
      const userId = requesterId(req) || String(req.body?.createdById || '').trim();
      const file = req.file;
      if (!userId) return res.status(400).json({ error: 'requester user is required.' });
      if (!file) return res.status(400).json({ error: 'file is required.' });

      const orgResult = await pool.query('SELECT * FROM "Organization" LIMIT 1');
      const org = orgResult.rows[0] || { name: 'org', id: '1' };
      const provider = org?.storageProvider || 'Local';
      if (provider !== 'Local') return res.status(501).json({ error: `Storage provider ${provider} not implemented. Use Local.` });

      const ext = path.extname(file.originalname || '').toLowerCase();
      const filename = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}${ext}`;
      const storagePath = path.resolve(process.cwd(), 'storage');
      const orgFolderName = org.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '_' + String(org.id).split('-')[0];
      const relativePath = path.join(orgFolderName, 'disciplines', disciplineId, filename);
      const finalPath = path.join(storagePath, relativePath);
      if (!fs.existsSync(path.dirname(finalPath))) fs.mkdirSync(path.dirname(finalPath), { recursive: true });
      fs.writeFileSync(finalPath, file.buffer);
      const fileUrl = `/storage/${relativePath.replace(/\\/g, '/')}`;

      const resource = await insertResource(
        disciplineId,
        { ...req.body, title: String(req.body?.title || '').trim() || file.originalname },
        userId,
        fileUrl,
        fileUrl
      );
      res.status(201).json(resource);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to upload resource', details: error.message });
    }
  });

  router.put('/:id/resources/:resourceId', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Disciplines module is not active.' });
      const { id: disciplineId, resourceId } = req.params;
      const existing = await pool.query('SELECT * FROM "DisciplineResource" WHERE id = $1 AND "disciplineId" = $2 LIMIT 1', [resourceId, disciplineId]);
      const r = existing.rows[0];
      if (!r) return res.status(404).json({ error: 'Resource not found' });
      const userId = requesterId(req) || r.updatedById;

      await pool.query(
        `UPDATE "DisciplineResource"
         SET title = $1, description = $2, type = $3, "resourceUrl" = $4, "thumbnailUrl" = $5, visibility = $6, "publishedAt" = $7, active = $8, "updatedById" = $9, "updatedAt" = NOW()
         WHERE id = $10`,
        [
          String(req.body?.title ?? r.title).trim() || r.title,
          req.body?.description !== undefined ? (String(req.body.description).trim() || null) : r.description,
          String(req.body?.type ?? r.type).trim() || r.type,
          req.body?.resourceUrl !== undefined ? (String(req.body.resourceUrl).trim() || null) : r.resourceUrl,
          req.body?.thumbnailUrl !== undefined ? (String(req.body.thumbnailUrl).trim() || null) : r.thumbnailUrl,
          String(req.body?.visibility ?? r.visibility).trim() || r.visibility,
          req.body?.publishedAt !== undefined ? (req.body.publishedAt ? new Date(req.body.publishedAt) : null) : r.publishedAt,
          req.body?.active !== undefined ? Boolean(req.body.active) : r.active,
          userId,
          resourceId
        ]
      );
      const updated = await pool.query('SELECT * FROM "DisciplineResource" WHERE id = $1', [resourceId]);
      res.json(updated.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update resource', details: error.message });
    }
  });

  router.patch('/:id/resources/:resourceId/status', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Disciplines module is not active.' });
      const { id: disciplineId, resourceId } = req.params;
      const active = Boolean(req.body?.active);
      const userId = requesterId(req);
      const r = await pool.query('UPDATE "DisciplineResource" SET active = $1, "updatedById" = COALESCE($2, "updatedById"), "updatedAt" = NOW() WHERE id = $3 AND "disciplineId" = $4', [active, userId || null, resourceId, disciplineId]);
      if (!r.rowCount) return res.status(404).json({ error: 'Resource not found' });
      const updated = await pool.query('SELECT * FROM "DisciplineResource" WHERE id = $1', [resourceId]);
      res.json(updated.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update resource status', details: error.message });
    }
  });

  router.delete('/:id/resources/:resourceId', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Disciplines module is not active.' });
      const { id: disciplineId, resourceId } = req.params;
      const userId = requesterId(req);
      const r = await pool.query('UPDATE "DisciplineResource" SET active = false, "updatedById" = COALESCE($1, "updatedById"), "updatedAt" = NOW() WHERE id = $2 AND "disciplineId" = $3', [userId || null, resourceId, disciplineId]);
      if (!r.rowCount) return res.status(404).json({ error: 'Resource not found' });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to delete resource', details: error.message });
    }
  });

  // ---- Single discipline (kept after literal/sub-resource routes) -----------
  router.get('/:id', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Disciplines module is not active.' });
      const discipline = await getDisciplineById(req.params.id);
      if (!discipline) return res.status(404).json({ error: 'Discipline not found' });
      const levels = await pool.query('SELECT * FROM "DisciplineLevel" WHERE "disciplineId" = $1 ORDER BY "levelOrder" ASC, name ASC', [req.params.id]);
      discipline.levels = levels.rows;
      res.json(discipline);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch discipline', details: error.message });
    }
  });

  router.put('/:id', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Disciplines module is not active.' });
      const existing = await getDisciplineById(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Discipline not found' });
      const userId = requesterId(req) || existing.updatedById;
      const name = String(req.body?.name ?? existing.name).trim() || existing.name;

      if (name.toLowerCase() !== String(existing.name).toLowerCase()) {
        const dup = await pool.query('SELECT id FROM "Discipline" WHERE LOWER(name) = LOWER($1) AND id <> $2 LIMIT 1', [name, req.params.id]);
        if (dup.rows[0]) return res.status(409).json({ error: 'A discipline with that name already exists.' });
      }

      await pool.query(
        `UPDATE "Discipline" SET name = $1, description = $2, "imageUrl" = $3, active = $4, "updatedById" = $5, "updatedAt" = NOW() WHERE id = $6`,
        [
          name,
          req.body?.description !== undefined ? (String(req.body.description).trim() || null) : existing.description,
          req.body?.imageUrl !== undefined ? (String(req.body.imageUrl).trim() || null) : existing.imageUrl,
          req.body?.active !== undefined ? Boolean(req.body.active) : existing.active,
          userId,
          req.params.id
        ]
      );
      res.json(await getDisciplineById(req.params.id));
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update discipline', details: error.message });
    }
  });

  router.patch('/:id/status', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Disciplines module is not active.' });
      const active = Boolean(req.body?.active);
      const userId = requesterId(req);
      const r = await pool.query('UPDATE "Discipline" SET active = $1, "updatedById" = COALESCE($2, "updatedById"), "updatedAt" = NOW() WHERE id = $3', [active, userId || null, req.params.id]);
      if (!r.rowCount) return res.status(404).json({ error: 'Discipline not found' });
      res.json(await getDisciplineById(req.params.id));
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update discipline status', details: error.message });
    }
  });

  app.use('/api/disciplines', router);

  return { basePath: '/api/disciplines', openapiPath: '/api/disciplines/openapi.json', docsPath: '/api/disciplines/docs' };
}
