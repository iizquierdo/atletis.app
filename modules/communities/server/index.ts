import express from 'express';
import crypto from 'crypto';
import type { Pool } from 'pg';
import {
  fetchMergedItemsByCategoryCodes,
  resolveTenantAuthContext,
  resolveRequesterScope,
  getRequesterUserId,
  type RequesterScope
} from '@sinapsis/module-sdk-server';

interface CommunitiesModuleContext {
  app: express.Express;
  pool: Pool;
}

const MODULE_CODE = 'COMMUNITIES';

export default function registerCommunitiesModule({ app, pool }: CommunitiesModuleContext) {
  const router = express.Router();

  const requesterId = (req: express.Request): string => String((req as any).authUserId || getRequesterUserId(req) || '').trim();
  const scopeOf = (req: express.Request) => resolveRequesterScope(pool, requesterId(req));

  const ensureActive = async () => {
    const mod = await pool.query('SELECT status FROM "SystemModule" WHERE code = $1 LIMIT 1', [MODULE_CODE]);
    return String(mod.rows[0]?.status || '') === 'Active';
  };

  const tableExists = async (name: string) => {
    const r = await pool.query('SELECT to_regclass($1) AS t', [`public."${name}"`]);
    return Boolean(r.rows[0]?.t);
  };

  /** Company filter for non-super requesters. */
  const scopedCommunityClause = (scope: RequesterScope | null, params: any[]): string => {
    if (!scope) return 'false';
    if (scope.isSuperAdmin) return 'true';
    if (!scope.companyScope.length) return 'false';
    params.push(scope.companyScope);
    return `cm."companyId" = ANY($${params.length})`;
  };

  const canAccess = async (scope: RequesterScope | null, communityId: string): Promise<boolean> => {
    if (!scope) return false;
    if (scope.isSuperAdmin) {
      const r = await pool.query('SELECT 1 FROM "Community" WHERE id = $1 LIMIT 1', [communityId]);
      return Boolean(r.rows[0]);
    }
    if (!scope.companyScope.length) return false;
    const r = await pool.query('SELECT 1 FROM "Community" WHERE id = $1 AND "companyId" = ANY($2) LIMIT 1', [communityId, scope.companyScope]);
    return Boolean(r.rows[0]);
  };

  const loadCommunity = async (id: string) => {
    const r = await pool.query(
      `SELECT cm.*, c.name AS "companyName", creator.name AS "createdByName",
              (SELECT COUNT(*)::int FROM "CommunityMember" m WHERE m."communityId" = cm.id AND m.active) AS "memberCount",
              (SELECT COUNT(*)::int FROM "CommunityPost" p WHERE p."communityId" = cm.id) AS "postCount"
       FROM "Community" cm
       JOIN "Company" c ON c.id = cm."companyId"
       JOIN "User" creator ON creator.id = cm."createdById"
       WHERE cm.id = $1 LIMIT 1`,
      [id]
    );
    return r.rows[0] || null;
  };

  // ---- Docs -----------------------------------------------------------------
  router.get('/openapi.json', (req, res) => {
    const serverUrl = `${req.protocol}://${req.get('host')}`;
    res.json({
      openapi: '3.0.3',
      info: { title: 'Sinapsis Communities API', version: '1.0.0', description: 'Communities, members and posts.' },
      servers: [{ url: serverUrl }],
      paths: {
        '/api/communities': { get: {}, post: {} },
        '/api/communities/{id}': { get: {}, put: {} },
        '/api/communities/{id}/members': { put: {} },
        '/api/communities/{id}/posts': { get: {}, post: {} }
      }
    });
  });

  router.get('/docs', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html><html><head><meta charset="utf-8"/><title>Sinapsis Communities API</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"/></head><body><div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>window.ui=SwaggerUIBundle({url:'/api/communities/openapi.json',dom_id:'#swagger-ui',deepLinking:true});</script></body></html>`);
  });

  router.get('/meta', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Communities module is not active.' });
      const uid = requesterId(req);
      const ctx = uid ? await resolveTenantAuthContext(pool, uid) : null;
      const organizationId = ctx?.organizationId || '';
      const catMap = await fetchMergedItemsByCategoryCodes(pool, { codes: ['COMMUNITY_POST_STATUS'], organizationId, companyIdContext: null, activeOnly: true });
      let disciplines: any[] = [];
      if (await tableExists('Discipline')) {
        disciplines = (await pool.query('SELECT id, name FROM "Discipline" WHERE active = true ORDER BY name ASC')).rows;
      }
      res.json({ categories: { postStatuses: catMap.get('COMMUNITY_POST_STATUS') || [] }, disciplines });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to load communities metadata', details: error.message });
    }
  });

  // ---- Collection -----------------------------------------------------------
  router.get('/', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Communities module is not active.' });
      const scope = await scopeOf(req);
      const params: any[] = [];
      const where: string[] = [scopedCommunityClause(scope, params)];
      const search = String(req.query.search || '').trim();
      const companyId = String(req.query.companyId || '').trim();
      if (search) { params.push(`%${search}%`); where.push(`LOWER(cm.name) LIKE LOWER($${params.length})`); }
      if (companyId && scope?.isSuperAdmin) { params.push(companyId); where.push(`cm."companyId" = $${params.length}`); }

      const result = await pool.query(
        `SELECT cm.id, cm.name, cm.active, cm."companyId", c.name AS "companyName",
                (SELECT COUNT(*)::int FROM "CommunityMember" m WHERE m."communityId" = cm.id AND m.active) AS "memberCount",
                (SELECT COUNT(*)::int FROM "CommunityPost" p WHERE p."communityId" = cm.id) AS "postCount"
         FROM "Community" cm JOIN "Company" c ON c.id = cm."companyId"
         WHERE ${where.join(' AND ')} ORDER BY cm.name ASC`,
        params
      );
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch communities', details: error.message });
    }
  });

  router.post('/', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Communities module is not active.' });
      const scope = await scopeOf(req);
      const name = String(req.body?.name || '').trim();
      const companyId = String(req.body?.companyId || '').trim() || scope?.primaryCompanyId || '';
      if (!name) return res.status(400).json({ error: 'name is required.' });
      if (!companyId) return res.status(400).json({ error: 'companyId (sede) is required.' });
      if (scope?.isAdminSede && !scope.companyScope.includes(companyId)) return res.status(403).json({ error: 'Company out of scope.' });

      const id = crypto.randomUUID();
      await pool.query(
        `INSERT INTO "Community" (id, name, description, "imageUrl", active, "companyId", "disciplineId", "createdById", "createdAt", "updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())`,
        [
          id, name,
          String(req.body?.description || '').trim() || null,
          String(req.body?.imageUrl || '').trim() || null,
          req.body?.active === false ? false : true,
          companyId,
          String(req.body?.disciplineId || '').trim() || null,
          scope!.userId
        ]
      );
      res.status(201).json(await loadCommunity(id));
    } catch (error: any) {
      if (String(error?.code) === '23505') return res.status(409).json({ error: 'A community with that name already exists in this sede.' });
      res.status(500).json({ error: 'Failed to create community', details: error.message });
    }
  });

  // ---- Members --------------------------------------------------------------
  router.get('/:id/members', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Communities module is not active.' });
      if (!(await canAccess(await scopeOf(req), req.params.id))) return res.status(403).json({ error: 'Community out of scope.' });
      const hasStudents = await tableExists('Student');
      const result = hasStudents
        ? await pool.query(
            `SELECT m.id, m."studentId", m.active, s."firstName", s."lastName", s.code
             FROM "CommunityMember" m LEFT JOIN "Student" s ON s.id = m."studentId"
             WHERE m."communityId" = $1 AND m.active ORDER BY s."lastName" ASC`,
            [req.params.id]
          )
        : await pool.query('SELECT id, "studentId", active FROM "CommunityMember" WHERE "communityId" = $1 AND active', [req.params.id]);
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch members', details: error.message });
    }
  });

  router.put('/:id/members', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Communities module is not active.' });
      if (!(await canAccess(await scopeOf(req), req.params.id))) return res.status(403).json({ error: 'Community out of scope.' });
      const studentIds: string[] = Array.isArray(req.body?.studentIds) ? req.body.studentIds.map((x: any) => String(x || '').trim()).filter(Boolean) : [];
      await pool.query('DELETE FROM "CommunityMember" WHERE "communityId" = $1', [req.params.id]);
      for (const sid of studentIds) {
        await pool.query('INSERT INTO "CommunityMember" (id, "communityId", "studentId", active, "joinedAt") VALUES ($1,$2,$3,true,NOW()) ON CONFLICT ("communityId","studentId") DO UPDATE SET active = true', [crypto.randomUUID(), req.params.id, sid]);
      }
      res.json({ success: true, count: studentIds.length });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update members', details: error.message });
    }
  });

  router.delete('/:id/members/:studentId', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Communities module is not active.' });
      if (!(await canAccess(await scopeOf(req), req.params.id))) return res.status(403).json({ error: 'Community out of scope.' });
      await pool.query('DELETE FROM "CommunityMember" WHERE "communityId" = $1 AND "studentId" = $2', [req.params.id, req.params.studentId]);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to remove member', details: error.message });
    }
  });

  // ---- Posts ----------------------------------------------------------------
  router.get('/:id/posts', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Communities module is not active.' });
      if (!(await canAccess(await scopeOf(req), req.params.id))) return res.status(403).json({ error: 'Community out of scope.' });
      const result = await pool.query(
        `SELECT p.*, a.name AS "authorName" FROM "CommunityPost" p JOIN "User" a ON a.id = p."authorId"
         WHERE p."communityId" = $1 ORDER BY p."createdAt" DESC`,
        [req.params.id]
      );
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch posts', details: error.message });
    }
  });

  router.post('/:id/posts', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Communities module is not active.' });
      const scope = await scopeOf(req);
      if (!(await canAccess(scope, req.params.id))) return res.status(403).json({ error: 'Community out of scope.' });
      const title = String(req.body?.title || '').trim();
      if (!title) return res.status(400).json({ error: 'title is required.' });
      const id = crypto.randomUUID();
      const status = String(req.body?.status || 'DRAFT').trim();
      await pool.query(
        `INSERT INTO "CommunityPost" (id, "communityId", title, content, "coverUrl", status, "publishedAt", "membersOnly", "authorId", "createdAt", "updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())`,
        [
          id, req.params.id, title,
          String(req.body?.content || '').trim() || null,
          String(req.body?.coverUrl || '').trim() || null,
          status,
          status === 'PUBLISHED' ? new Date() : (req.body?.publishedAt ? new Date(req.body.publishedAt) : null),
          Boolean(req.body?.membersOnly),
          scope!.userId
        ]
      );
      const created = await pool.query('SELECT p.*, a.name AS "authorName" FROM "CommunityPost" p JOIN "User" a ON a.id = p."authorId" WHERE p.id = $1', [id]);
      res.status(201).json(created.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to create post', details: error.message });
    }
  });

  router.put('/:id/posts/:postId', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Communities module is not active.' });
      if (!(await canAccess(await scopeOf(req), req.params.id))) return res.status(403).json({ error: 'Community out of scope.' });
      const existing = await pool.query('SELECT * FROM "CommunityPost" WHERE id = $1 AND "communityId" = $2 LIMIT 1', [req.params.postId, req.params.id]);
      const p = existing.rows[0];
      if (!p) return res.status(404).json({ error: 'Post not found' });
      const status = req.body?.status !== undefined ? String(req.body.status).trim() : p.status;
      await pool.query(
        `UPDATE "CommunityPost" SET title=$1, content=$2, "coverUrl"=$3, status=$4, "publishedAt"=$5, "membersOnly"=$6, "updatedAt"=NOW() WHERE id=$7`,
        [
          String(req.body?.title ?? p.title).trim() || p.title,
          req.body?.content !== undefined ? (String(req.body.content).trim() || null) : p.content,
          req.body?.coverUrl !== undefined ? (String(req.body.coverUrl).trim() || null) : p.coverUrl,
          status,
          status === 'PUBLISHED' && !p.publishedAt ? new Date() : p.publishedAt,
          req.body?.membersOnly !== undefined ? Boolean(req.body.membersOnly) : p.membersOnly,
          req.params.postId
        ]
      );
      const updated = await pool.query('SELECT p.*, a.name AS "authorName" FROM "CommunityPost" p JOIN "User" a ON a.id = p."authorId" WHERE p.id = $1', [req.params.postId]);
      res.json(updated.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update post', details: error.message });
    }
  });

  router.patch('/:id/posts/:postId/status', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Communities module is not active.' });
      if (!(await canAccess(await scopeOf(req), req.params.id))) return res.status(403).json({ error: 'Community out of scope.' });
      const status = String(req.body?.status || '').trim();
      if (!status) return res.status(400).json({ error: 'status is required.' });
      const r = await pool.query('UPDATE "CommunityPost" SET status=$1, "publishedAt"=CASE WHEN $1=\'PUBLISHED\' AND "publishedAt" IS NULL THEN NOW() ELSE "publishedAt" END, "updatedAt"=NOW() WHERE id=$2 AND "communityId"=$3', [status, req.params.postId, req.params.id]);
      if (!r.rowCount) return res.status(404).json({ error: 'Post not found' });
      const updated = await pool.query('SELECT * FROM "CommunityPost" WHERE id = $1', [req.params.postId]);
      res.json(updated.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update post status', details: error.message });
    }
  });

  // ---- Single community -----------------------------------------------------
  router.get('/:id', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Communities module is not active.' });
      if (!(await canAccess(await scopeOf(req), req.params.id))) return res.status(403).json({ error: 'Community out of scope.' });
      const community = await loadCommunity(req.params.id);
      if (!community) return res.status(404).json({ error: 'Community not found' });
      res.json(community);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch community', details: error.message });
    }
  });

  router.put('/:id', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Communities module is not active.' });
      const scope = await scopeOf(req);
      if (!(await canAccess(scope, req.params.id))) return res.status(403).json({ error: 'Community out of scope.' });
      const existing = await loadCommunity(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Community not found' });
      await pool.query(
        `UPDATE "Community" SET name=$1, description=$2, "imageUrl"=$3, "disciplineId"=$4, active=$5, "updatedAt"=NOW() WHERE id=$6`,
        [
          String(req.body?.name ?? existing.name).trim() || existing.name,
          req.body?.description !== undefined ? (String(req.body.description).trim() || null) : existing.description,
          req.body?.imageUrl !== undefined ? (String(req.body.imageUrl).trim() || null) : existing.imageUrl,
          req.body?.disciplineId !== undefined ? (String(req.body.disciplineId).trim() || null) : existing.disciplineId,
          req.body?.active !== undefined ? Boolean(req.body.active) : existing.active,
          req.params.id
        ]
      );
      res.json(await loadCommunity(req.params.id));
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update community', details: error.message });
    }
  });

  router.patch('/:id/status', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Communities module is not active.' });
      if (!(await canAccess(await scopeOf(req), req.params.id))) return res.status(403).json({ error: 'Community out of scope.' });
      const active = Boolean(req.body?.active);
      const r = await pool.query('UPDATE "Community" SET active=$1, "updatedAt"=NOW() WHERE id=$2', [active, req.params.id]);
      if (!r.rowCount) return res.status(404).json({ error: 'Community not found' });
      res.json(await loadCommunity(req.params.id));
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update community status', details: error.message });
    }
  });

  app.use('/api/communities', router);
  return { basePath: '/api/communities', openapiPath: '/api/communities/openapi.json', docsPath: '/api/communities/docs' };
}
