import express from 'express';
import crypto from 'crypto';
import path from 'path';
import multer from 'multer';
import type { Pool } from 'pg';
import {
  fetchMergedItemsByCategoryCodes,
  resolveTenantAuthContext,
  resolveRequesterScope,
  reserveNextReference,
  ensureCoreReferenceTemplate,
  propagateReferenceTemplateToAllCompanies,
  getRequesterUserId,
  putObject,
  type RequesterScope
} from '@sinapsis/module-sdk-server';

const upload = multer({ storage: multer.memoryStorage() });

interface ClassesModuleContext {
  app: express.Express;
  pool: Pool;
}

const MODULE_CODE = 'CLASSES';
const META_CODES = ['CLASS_STATUS', 'DISCIPLINE_RESOURCE_TYPE', 'DISCIPLINE_RESOURCE_VISIBILITY'];

/** Resource visibility levels a requester may see (mirrors discipline resources). */
const allowedVisibilities = (scope: RequesterScope | null): string[] => {
  if (!scope) return ['PUBLIC'];
  if (scope.isSuperAdmin || scope.isAdminSede) return ['ADMIN_ONLY', 'STAFF_ONLY', 'MEMBERS_ONLY', 'PUBLIC'];
  if (scope.isProfesor) return ['STAFF_ONLY', 'MEMBERS_ONLY', 'PUBLIC'];
  if (scope.isTutor) return ['MEMBERS_ONLY', 'PUBLIC'];
  return ['PUBLIC'];
};

export default function registerClassesModule({ app, pool }: ClassesModuleContext) {
  const router = express.Router();

  const requesterId = (req: express.Request): string =>
    String((req as any).authUserId || getRequesterUserId(req) || '').trim();

  const scopeOf = (req: express.Request) => resolveRequesterScope(pool, requesterId(req));

  const ensureActive = async () => {
    const mod = await pool.query('SELECT status FROM "SystemModule" WHERE code = $1 LIMIT 1', [MODULE_CODE]);
    return String(mod.rows[0]?.status || '') === 'Active';
  };

  const tableExists = async (name: string) => {
    const r = await pool.query('SELECT to_regclass($1) AS t', [`public."${name}"`]);
    return Boolean(r.rows[0]?.t);
  };

  let levelColumnsEnsured = false;
  const ensureLevelColumns = async () => {
    if (levelColumnsEnsured) return;
    await pool.query('ALTER TABLE "ClassLevel" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT');
    await pool.query(`ALTER TABLE "ClassLevel" ADD COLUMN IF NOT EXISTS "objectives" JSONB NOT NULL DEFAULT '[]'::jsonb`);
    levelColumnsEnsured = true;
  };

  let classImageColumnsEnsured = false;
  const ensureClassImageColumns = async () => {
    if (classImageColumnsEnsured) return;
    await pool.query('ALTER TABLE "Class" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT');
    await pool.query('ALTER TABLE "Class" ADD COLUMN IF NOT EXISTS "coverUrl" TEXT');
    classImageColumnsEnsured = true;
  };

  let communityClassIdEnsured = false;
  const ensureCommunityClassId = async () => {
    if (communityClassIdEnsured) return;
    const hasCommunity = await tableExists('Community');
    if (hasCommunity) {
      await pool.query('ALTER TABLE "Community" ADD COLUMN IF NOT EXISTS "classId" TEXT');
    }
    communityClassIdEnsured = true;
  };

  let classResourceTableEnsured = false;
  const ensureClassResourceTable = async () => {
    if (classResourceTableEnsured) return;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "ClassResource" (
        "id" TEXT NOT NULL,
        "classId" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "description" TEXT,
        "type" TEXT NOT NULL DEFAULT 'GENERAL_FILE',
        "resourceUrl" TEXT,
        "storageKey" TEXT,
        "thumbnailUrl" TEXT,
        "visibility" TEXT NOT NULL DEFAULT 'STAFF_ONLY',
        "publishedAt" TIMESTAMP(3),
        "active" BOOLEAN NOT NULL DEFAULT true,
        "createdById" TEXT NOT NULL,
        "updatedById" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "ClassResource_pkey" PRIMARY KEY ("id")
      );
      CREATE INDEX IF NOT EXISTS "ClassResource_classId_idx" ON "ClassResource"("classId", "active");
      CREATE INDEX IF NOT EXISTS "ClassResource_visibility_idx" ON "ClassResource"("visibility");
    `);
    classResourceTableEnsured = true;
  };

  /** SQL WHERE fragment (+params) limiting classes (alias cl) to those the requester may see. */
  const scopedClassClause = (scope: RequesterScope | null, params: any[]): string => {
    if (!scope) return 'false';
    if (scope.isSuperAdmin) {
      if (!scope.organizationId) return 'true'; // platform-level admin with no company: unrestricted
      params.push(scope.organizationId);
      return `cl."companyId" IN (SELECT id FROM "Company" WHERE "organizationId" = $${params.length})`;
    }
    if (scope.isAdminSede) {
      if (!scope.companyScope.length) return 'false';
      params.push(scope.companyScope);
      return `cl."companyId" = ANY($${params.length})`;
    }
    if (scope.isProfesor) {
      params.push(scope.userId);
      return `EXISTS (SELECT 1 FROM "ClassTeacher" ct WHERE ct."classId" = cl.id AND ct."teacherId" = $${params.length} AND ct.active)`;
    }
    if (scope.isTutor) {
      params.push(scope.userId);
      const tutorParam = `$${params.length}`;
      return `(
        EXISTS (SELECT 1 FROM "ClassTeacher" ct WHERE ct."classId" = cl.id AND ct."teacherId" = ${tutorParam} AND ct.active)
        OR EXISTS (
          SELECT 1 FROM "ClassStudent" cs
          JOIN "StudentTutor" st ON st."studentId" = cs."studentId" AND st."tutorId" = ${tutorParam} AND st.active
          WHERE cs."classId" = cl.id AND cs.status = 'ACTIVE'
        )
      )`;
    }
    // Fallback: any authenticated non-admin user sees classes they're explicitly assigned to as teacher.
    params.push(scope.userId);
    return `EXISTS (SELECT 1 FROM "ClassTeacher" ct WHERE ct."classId" = cl.id AND ct."teacherId" = $${params.length} AND ct.active)`;
  };

  const canAccessClass = async (scope: RequesterScope | null, classId: string): Promise<boolean> => {
    if (!scope) return false;
    const params: any[] = [classId];
    const clause = scopedClassClause(scope, params);
    if (clause === 'false') return false;
    if (clause === 'true') {
      const r = await pool.query('SELECT 1 FROM "Class" cl WHERE cl.id = $1 LIMIT 1', [classId]);
      return Boolean(r.rows[0]);
    }
    const r = await pool.query(`SELECT 1 FROM "Class" cl WHERE cl.id = $1 AND ${clause} LIMIT 1`, params);
    return Boolean(r.rows[0]);
  };

  const canUseDiscipline = async (scope: RequesterScope | null, disciplineId: string): Promise<boolean> => {
    if (!scope) return false;
    if (!(await tableExists('Discipline'))) return true;
    if (scope.isSuperAdmin && !scope.organizationId) {
      const r = await pool.query('SELECT 1 FROM "Discipline" WHERE id = $1 LIMIT 1', [disciplineId]);
      return Boolean(r.rows[0]);
    }
    if (!scope.organizationId) return false;
    const r = await pool.query(
      `SELECT 1
       FROM "Discipline" d
       WHERE d.id = $1 AND (
         EXISTS (
           SELECT 1
           FROM "User" du
           JOIN "Company" dc ON dc.id = du."companyId"
           WHERE du.id IN (d."createdById", d."updatedById") AND dc."organizationId" = $2
         )
         OR EXISTS (
           SELECT 1
           FROM "Class" cl
           JOIN "Company" cc ON cc.id = cl."companyId"
           WHERE cl."disciplineId" = d.id AND cc."organizationId" = $2
         )
       )
       LIMIT 1`,
      [disciplineId, scope.organizationId]
    );
    return Boolean(r.rows[0]);
  };

  const normalizeLevelObjectives = (raw: unknown) => {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item: any) => ({
        id: String(item?.id || crypto.randomUUID()).trim(),
        title: String(item?.title || '').trim().slice(0, 300),
        completed: Boolean(item?.completed)
      }))
      .filter((item) => item.title);
  };

  /** Returns the next class code; lazily ensures the Reference template exists. */
  const nextClassCode = async (companyId: string): Promise<string | null> => {
    try {
      return await reserveNextReference(pool, { companyId, module: 'CLASSES', code: 'CLASSES' });
    } catch {
      try {
        await ensureCoreReferenceTemplate(pool, { module: 'CLASSES', code: 'CLASSES', prefix: 'CLS-', digits: 4, reference: 0 });
        await propagateReferenceTemplateToAllCompanies(pool, 'CLASSES', 'CLASSES');
        return await reserveNextReference(pool, { companyId, module: 'CLASSES', code: 'CLASSES' });
      } catch {
        return null;
      }
    }
  };

  const loadClass = async (id: string) => {
    await ensureClassImageColumns();
    await ensureLevelColumns();
    const hasDisciplines = await tableExists('Discipline');
    const hasDisciplineLevels = await tableExists('DisciplineLevel');
    const hasStudents = await tableExists('Student');

    const r = await pool.query(
      `SELECT cl.*, c.name AS "companyName",
              ${hasDisciplines ? `(SELECT d.name FROM "Discipline" d WHERE d.id = cl."disciplineId")` : 'NULL'} AS "disciplineName",
              creator.name AS "createdByName", updater.name AS "updatedByName"
       FROM "Class" cl
       JOIN "Company" c ON c.id = cl."companyId"
       JOIN "User" creator ON creator.id = cl."createdById"
       JOIN "User" updater ON updater.id = cl."updatedById"
       WHERE cl.id = $1 LIMIT 1`,
      [id]
    );
    const klass = r.rows[0];
    if (!klass) return null;

    const ownLevels = await pool.query('SELECT * FROM "ClassLevel" WHERE "classId" = $1 ORDER BY "levelOrder" ASC, name ASC', [id]);
    const inheritedLevels = hasDisciplineLevels
      ? (await pool.query('SELECT id, name, description, "levelOrder", color FROM "DisciplineLevel" WHERE "disciplineId" = $1 AND active = true ORDER BY "levelOrder" ASC', [klass.disciplineId])).rows
      : [];
    const teachers = await pool.query(
      `SELECT ct.*, u.name AS "teacherName", u.email AS "teacherEmail",
              COALESCE(u."imageUrl", u.avatar) AS "teacherAvatar", u.phone AS "teacherPhone"
       FROM "ClassTeacher" ct JOIN "User" u ON u.id = ct."teacherId"
       WHERE ct."classId" = $1 ORDER BY u.name ASC`,
      [id]
    );
    const schedules = await pool.query('SELECT * FROM "ClassSchedule" WHERE "classId" = $1 ORDER BY "dayOfWeek" ASC, "startTime" ASC', [id]);
    const students = hasStudents
      ? (await pool.query(
          `SELECT cs.*, s."firstName", s."lastName", s.code AS "studentCode", s.status AS "studentStatus", s."imageUrl"
           FROM "ClassStudent" cs JOIN "Student" s ON s.id = cs."studentId"
           WHERE cs."classId" = $1 ORDER BY s."lastName" ASC, s."firstName" ASC`,
          [id]
        )).rows
      : (await pool.query('SELECT * FROM "ClassStudent" WHERE "classId" = $1', [id])).rows;

    klass.ownLevels = ownLevels.rows;
    klass.inheritedLevels = inheritedLevels.map((l: any) => ({ ...l, inherited: true }));
    klass.teachers = teachers.rows;
    klass.schedules = schedules.rows;
    klass.students = students;
    return klass;
  };

  /** Replaces schedules / teachers / own levels when the matching array is provided in the body. */
  const syncRelations = async (classId: string, body: any) => {
    if (Array.isArray(body?.schedules)) {
      await pool.query('DELETE FROM "ClassSchedule" WHERE "classId" = $1', [classId]);
      for (const s of body.schedules) {
        const dayOfWeek = Number(s?.dayOfWeek);
        const startTime = String(s?.startTime || '').trim();
        const endTime = String(s?.endTime || '').trim();
        if (!Number.isFinite(dayOfWeek) || !startTime || !endTime) continue;
        await pool.query(
          `INSERT INTO "ClassSchedule" (id, "classId", "dayOfWeek", "startTime", "endTime", location, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
          [crypto.randomUUID(), classId, dayOfWeek, startTime, endTime, String(s?.location || '').trim() || null]
        );
      }
    }
    if (Array.isArray(body?.teacherIds)) {
      await pool.query('DELETE FROM "ClassTeacher" WHERE "classId" = $1', [classId]);
      for (const tid of body.teacherIds) {
        const teacherId = String(tid || '').trim();
        if (!teacherId) continue;
        await pool.query(
          'INSERT INTO "ClassTeacher" (id, "classId", "teacherId", active, "assignedAt") VALUES ($1, $2, $3, true, NOW()) ON CONFLICT ("classId", "teacherId") DO UPDATE SET active = true',
          [crypto.randomUUID(), classId, teacherId]
        );
      }
    }
    if (Array.isArray(body?.levels)) {
      const keepIds: string[] = [];
      for (const l of body.levels) {
        const name = String(l?.name || '').trim();
        if (!name) continue;
        const levelId = String(l?.id || '').trim();
        const levelOrder = Number.isFinite(Number(l?.levelOrder)) ? Number(l.levelOrder) : 0;
        const description = String(l?.description || '').trim() || null;
        const color = String(l?.color || '').trim() || null;
        if (levelId) {
          await pool.query(
            'UPDATE "ClassLevel" SET name=$1, description=$2, "levelOrder"=$3, color=$4, "updatedAt"=NOW() WHERE id=$5 AND "classId"=$6',
            [name, description, levelOrder, color, levelId, classId]
          );
          keepIds.push(levelId);
        } else {
          const newId = crypto.randomUUID();
          await pool.query(
            'INSERT INTO "ClassLevel" (id, "classId", name, description, "levelOrder", color, active, "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,true,NOW(),NOW()) ON CONFLICT ("classId", name) DO UPDATE SET description=EXCLUDED.description, "levelOrder"=EXCLUDED."levelOrder", color=EXCLUDED.color, "updatedAt"=NOW()',
            [newId, classId, name, description, levelOrder, color]
          );
          keepIds.push(newId);
        }
      }
      // Drop own levels removed in the editor.
      if (keepIds.length) {
        await pool.query(`DELETE FROM "ClassLevel" WHERE "classId" = $1 AND id <> ALL($2)`, [classId, keepIds]);
      } else {
        await pool.query('DELETE FROM "ClassLevel" WHERE "classId" = $1', [classId]);
      }
    }
  };

  // ---- Docs -----------------------------------------------------------------
  router.get('/openapi.json', (req, res) => {
    const serverUrl = `${req.protocol}://${req.get('host')}`;
    res.json({
      openapi: '3.0.3',
      info: { title: 'Sinapsis Classes API', version: '1.0.0', description: 'Classes, levels, teachers, schedules and enrolled students.' },
      servers: [{ url: serverUrl }],
      paths: {
        '/api/classes/meta': { get: { summary: 'Catalog metadata' } },
        '/api/classes': { get: { summary: 'List classes' }, post: { summary: 'Create class' } },
        '/api/classes/{id}': { get: { summary: 'Get class' }, put: { summary: 'Update class' } },
        '/api/classes/{id}/levels': { get: {}, post: {} },
        '/api/classes/{id}/students': { get: {}, post: {} }
      }
    });
  });

  router.get('/docs', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html><html><head><meta charset="utf-8"/><title>Sinapsis Classes API</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"/></head><body><div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>window.ui=SwaggerUIBundle({url:'/api/classes/openapi.json',dom_id:'#swagger-ui',deepLinking:true});</script></body></html>`);
  });

  // ---- Meta -----------------------------------------------------------------
  router.get('/meta', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Classes module is not active.' });
      const uid = requesterId(req);
      const ctx = uid ? await resolveTenantAuthContext(pool, uid) : null;
      const scope = uid ? await resolveRequesterScope(pool, uid) : null;
      const organizationId = ctx?.organizationId || '';

      const catMap = await fetchMergedItemsByCategoryCodes(pool, { codes: META_CODES, organizationId, companyIdContext: null, activeOnly: true });

      // Staff available as teachers within the current tenant/company scope.
      const staffParams: any[] = [];
      const staffWhere: string[] = [];
      if (scope?.isSuperAdmin && scope.organizationId) {
        staffParams.push(scope.organizationId);
        staffWhere.push(`c."organizationId" = $${staffParams.length}`);
      } else if (scope?.isAdminSede) {
        if (!scope.companyScope.length) {
          staffWhere.push('false');
        } else {
          staffParams.push(scope.companyScope);
          staffWhere.push(`u."companyId" = ANY($${staffParams.length})`);
        }
      } else if (scope?.primaryCompanyId) {
        staffParams.push(scope.primaryCompanyId);
        staffWhere.push(`u."companyId" = $${staffParams.length}`);
      } else if (!scope) {
        staffWhere.push('false');
      }
      const staff = await pool.query(
        `SELECT u.id, u.name, u.email, COALESCE(r.name, u.role) AS "roleName", u."companyId", c.name AS "companyName"
         FROM "User" u
         LEFT JOIN "Role" r ON r.id = u."roleId"
         LEFT JOIN "Company" c ON c.id = u."companyId"
         ${staffWhere.length ? `WHERE ${staffWhere.join(' AND ')}` : ''}
         ORDER BY u.name ASC`,
        staffParams
      );

      // Disciplines (+levels) only if that module is installed.
      let disciplines: any[] = [];
      if (await tableExists('Discipline')) {
        const disciplineParams: any[] = [];
        const disciplineWhere: string[] = ['d.active = true'];
        if (scope?.organizationId) {
          disciplineParams.push(scope.organizationId);
          const orgParam = `$${disciplineParams.length}`;
          disciplineWhere.push(`(
            EXISTS (
              SELECT 1
              FROM "User" du
              JOIN "Company" dc ON dc.id = du."companyId"
              WHERE du.id IN (d."createdById", d."updatedById") AND dc."organizationId" = ${orgParam}
            )
            OR EXISTS (
              SELECT 1
              FROM "Class" cl
              JOIN "Company" cc ON cc.id = cl."companyId"
              WHERE cl."disciplineId" = d.id AND cc."organizationId" = ${orgParam}
            )
          )`);
        } else if (!scope) {
          disciplineWhere.push('false');
        }
        const d = await pool.query(
          `SELECT d.id, d.name
           FROM "Discipline" d
           WHERE ${disciplineWhere.join(' AND ')}
           ORDER BY d.name ASC`,
          disciplineParams
        );
        const levels = (await tableExists('DisciplineLevel'))
          ? (await pool.query('SELECT id, "disciplineId", name, "levelOrder" FROM "DisciplineLevel" WHERE active = true ORDER BY "levelOrder" ASC')).rows
          : [];
        disciplines = d.rows.map((disc: any) => ({ ...disc, levels: levels.filter((l: any) => l.disciplineId === disc.id) }));
      }

      res.json({
        categories: {
          statuses: catMap.get('CLASS_STATUS') || [],
          resourceTypes: catMap.get('DISCIPLINE_RESOURCE_TYPE') || [],
          visibilities: catMap.get('DISCIPLINE_RESOURCE_VISIBILITY') || []
        },
        staff: staff.rows,
        disciplines
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to load classes metadata', details: error.message });
    }
  });

  // ---- Classes collection ---------------------------------------------------
  router.get('/', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Classes module is not active.' });
      await ensureClassImageColumns();
      const scope = await scopeOf(req);
      const hasDisciplines = await tableExists('Discipline');

      const params: any[] = [];
      const where: string[] = [scopedClassClause(scope, params)];

      const search = String(req.query.search || '').trim();
      const status = String(req.query.status || '').trim();
      const disciplineId = String(req.query.disciplineId || '').trim();
      const companyId = String(req.query.companyId || '').trim();
      if (search) {
        params.push(`%${search}%`);
        where.push(`(LOWER(cl.name) LIKE LOWER($${params.length}) OR LOWER(COALESCE(cl.code,'')) LIKE LOWER($${params.length}))`);
      }
      if (status) { params.push(status); where.push(`cl.status = $${params.length}`); }
      if (disciplineId) { params.push(disciplineId); where.push(`cl."disciplineId" = $${params.length}`); }
      if (companyId && scope?.isSuperAdmin) { params.push(companyId); where.push(`cl."companyId" = $${params.length}`); }

      const result = await pool.query(
        `SELECT cl.id, cl.code, cl.name, cl."disciplineId", cl."companyId", cl.capacity, cl.status,
                cl."imageUrl", cl."coverUrl",
                c.name AS "companyName",
                ${hasDisciplines ? `(SELECT d.name FROM "Discipline" d WHERE d.id = cl."disciplineId")` : 'NULL'} AS "disciplineName",
                (SELECT COALESCE(json_agg(json_build_object('id', u.id, 'name', u.name, 'avatar', COALESCE(u."imageUrl", u.avatar)) ORDER BY u.name ASC), '[]'::json) FROM "ClassTeacher" ct JOIN "User" u ON u.id = ct."teacherId" WHERE ct."classId" = cl.id AND ct.active) AS "teachers",
                (SELECT COUNT(*)::int FROM "ClassSchedule" cs WHERE cs."classId" = cl.id) AS "scheduleCount",
                (SELECT COUNT(*)::int FROM "ClassStudent" cst WHERE cst."classId" = cl.id AND cst.status = 'ACTIVE') AS "studentCount",
                (SELECT COALESCE(json_agg(json_build_object('dayOfWeek', s."dayOfWeek", 'startTime', s."startTime", 'endTime', s."endTime") ORDER BY s."dayOfWeek" ASC, s."startTime" ASC), '[]'::json) FROM "ClassSchedule" s WHERE s."classId" = cl.id) AS "schedules"
         FROM "Class" cl JOIN "Company" c ON c.id = cl."companyId"
         WHERE ${where.join(' AND ')}
         ORDER BY cl.name ASC`,
        params
      );
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch classes', details: error.message });
    }
  });

  router.post('/', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Classes module is not active.' });
      const scope = await scopeOf(req);
      if (!scope?.isStaff) return res.status(403).json({ error: 'Only staff can create classes.' });

      const name = String(req.body?.name || '').trim();
      const disciplineId = String(req.body?.disciplineId || '').trim();
      const companyId = String(req.body?.companyId || '').trim() || scope.primaryCompanyId || '';
      if (!name) return res.status(400).json({ error: 'name is required.' });
      if (!disciplineId) return res.status(400).json({ error: 'disciplineId is required.' });
      if (!companyId) return res.status(400).json({ error: 'companyId (sede) is required.' });
      if (scope.isSuperAdmin && scope.organizationId) {
        const company = await pool.query('SELECT 1 FROM "Company" WHERE id = $1 AND "organizationId" = $2 LIMIT 1', [companyId, scope.organizationId]);
        if (!company.rows[0]) return res.status(403).json({ error: 'Company out of scope.' });
      }
      if (scope.isAdminSede && !scope.companyScope.includes(companyId)) return res.status(403).json({ error: 'Company out of scope.' });

      if (!(await canUseDiscipline(scope, disciplineId))) return res.status(400).json({ error: 'Discipline not found.' });

      const id = crypto.randomUUID();
      const code = await nextClassCode(companyId);
      const capacity = Number.isFinite(Number(req.body?.capacity)) && Number(req.body?.capacity) > 0 ? Math.floor(Number(req.body.capacity)) : null;
      await pool.query(
        `INSERT INTO "Class" (id, code, name, description, "disciplineId", "companyId", capacity, status, "createdById", "updatedById", "createdAt", "updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,NOW(),NOW())`,
        [
          id, code, name,
          String(req.body?.description || '').trim() || null,
          disciplineId, companyId, capacity,
          String(req.body?.status || 'ACTIVE').trim() || 'ACTIVE',
          scope.userId
        ]
      );
      await syncRelations(id, req.body);
      res.status(201).json(await loadClass(id));
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to create class', details: error.message });
    }
  });

  // ---- Own levels (literal sub-resources) -----------------------------------
  router.post('/:id/levels', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Classes module is not active.' });
      const scope = await scopeOf(req);
      if (!scope?.isStaff) return res.status(403).json({ error: 'Only staff can edit class levels.' });
      if (!(await canAccessClass(scope, req.params.id))) return res.status(404).json({ error: 'Class not found' });
      await ensureLevelColumns();
      const name = String(req.body?.name || '').trim();
      if (!name) return res.status(400).json({ error: 'name is required.' });

      let levelOrder = Number(req.body?.levelOrder);
      if (!Number.isFinite(levelOrder)) {
        const max = await pool.query('SELECT COALESCE(MAX("levelOrder"), -1) AS m FROM "ClassLevel" WHERE "classId" = $1', [req.params.id]);
        levelOrder = Number(max.rows[0]?.m ?? -1) + 1;
      }
      const id = crypto.randomUUID();
      const objectives = normalizeLevelObjectives(req.body?.objectives);
      await pool.query(
        `INSERT INTO "ClassLevel" (id, "classId", name, description, "levelOrder", color, active, "imageUrl", objectives, "createdAt", "updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())`,
        [
          id,
          req.params.id,
          name,
          String(req.body?.description || '').trim() || null,
          levelOrder,
          String(req.body?.color || '').trim() || null,
          req.body?.active === false ? false : true,
          String(req.body?.imageUrl || '').trim() || null,
          JSON.stringify(objectives)
        ]
      );
      const created = await pool.query('SELECT * FROM "ClassLevel" WHERE id = $1', [id]);
      res.status(201).json(created.rows[0]);
    } catch (error: any) {
      if (String(error?.code) === '23505') return res.status(409).json({ error: 'Level name already in use for this class.' });
      res.status(500).json({ error: 'Failed to create class level', details: error.message });
    }
  });

  router.put('/:id/levels/:levelId', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Classes module is not active.' });
      const scope = await scopeOf(req);
      if (!scope?.isStaff) return res.status(403).json({ error: 'Only staff can edit class levels.' });
      await ensureLevelColumns();
      const existing = await pool.query('SELECT * FROM "ClassLevel" WHERE id = $1 AND "classId" = $2 LIMIT 1', [req.params.levelId, req.params.id]);
      const level = existing.rows[0];
      if (!level) return res.status(404).json({ error: 'Level not found' });
      if (!(await canAccessClass(scope, req.params.id))) return res.status(404).json({ error: 'Class not found' });

      await pool.query(
        `UPDATE "ClassLevel" SET name=$1, description=$2, "levelOrder"=$3, color=$4, active=$5, "imageUrl"=$6, objectives=$7, "updatedAt"=NOW() WHERE id=$8`,
        [
          String(req.body?.name ?? level.name).trim() || level.name,
          req.body?.description !== undefined ? (String(req.body.description).trim() || null) : level.description,
          Number.isFinite(Number(req.body?.levelOrder)) ? Number(req.body.levelOrder) : level.levelOrder,
          req.body?.color !== undefined ? (String(req.body.color).trim() || null) : level.color,
          req.body?.active !== undefined ? Boolean(req.body.active) : level.active,
          req.body?.imageUrl !== undefined ? (String(req.body.imageUrl).trim() || null) : level.imageUrl,
          req.body?.objectives !== undefined ? JSON.stringify(normalizeLevelObjectives(req.body.objectives)) : JSON.stringify(level.objectives || []),
          req.params.levelId
        ]
      );
      const updated = await pool.query('SELECT * FROM "ClassLevel" WHERE id = $1', [req.params.levelId]);
      res.json(updated.rows[0]);
    } catch (error: any) {
      if (String(error?.code) === '23505') return res.status(409).json({ error: 'Level name already in use for this class.' });
      res.status(500).json({ error: 'Failed to update class level', details: error.message });
    }
  });

  router.delete('/:id/levels/:levelId', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Classes module is not active.' });
      const scope = await scopeOf(req);
      if (!scope?.isStaff) return res.status(403).json({ error: 'Only staff can edit class levels.' });
      const r = await pool.query('DELETE FROM "ClassLevel" WHERE id = $1 AND "classId" = $2', [req.params.levelId, req.params.id]);
      if (!r.rowCount) return res.status(404).json({ error: 'Level not found' });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to delete class level', details: error.message });
    }
  });

  // ---- Level image upload ---------------------------------------------------
  router.post('/:id/levels/:levelId/image', upload.single('file'), async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Classes module is not active.' });
      const scope = await scopeOf(req);
      if (!scope?.isStaff) return res.status(403).json({ error: 'Only staff can edit class levels.' });
      await ensureLevelColumns();
      const level = await pool.query('SELECT * FROM "ClassLevel" WHERE id = $1 AND "classId" = $2 LIMIT 1', [req.params.levelId, req.params.id]);
      if (!level.rows[0]) return res.status(404).json({ error: 'Level not found' });
      const file = req.file;
      if (!file) return res.status(400).json({ error: 'No file uploaded.' });

      const org = await pool.query(`SELECT o.name, o.id FROM "Organization" o JOIN "Company" c ON c."organizationId" = o.id JOIN "Class" cl ON cl."companyId" = c.id WHERE cl.id = $1 LIMIT 1`, [req.params.id]);
      const orgRow = org.rows[0];
      const folder = orgRow ? `${orgRow.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${String(orgRow.id).split('-')[0]}` : 'classes';
      const ext = file.originalname.includes('.') ? file.originalname.split('.').pop() : 'jpg';
      const { url } = await putObject({ pool, key: `${folder}/level_${req.params.levelId}_${Date.now()}.${ext}`, buffer: file.buffer, contentType: file.mimetype });

      await pool.query('UPDATE "ClassLevel" SET "imageUrl"=$1, "updatedAt"=NOW() WHERE id=$2', [url, req.params.levelId]);
      res.json({ success: true, imageUrl: url });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to upload level image', details: error.message });
    }
  });

  // ---- Attendance -----------------------------------------------------------
  let attendanceTableEnsured = false;
  const ensureAttendanceTable = async () => {
    if (attendanceTableEnsured) return;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "ClassAttendance" (
        "id" TEXT NOT NULL,
        "classId" TEXT NOT NULL,
        "studentId" TEXT NOT NULL,
        "date" DATE NOT NULL,
        "present" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "ClassAttendance_pkey" PRIMARY KEY ("id")
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "ClassAttendance_class_student_date_key"
        ON "ClassAttendance"("classId", "studentId", "date");
    `);
    attendanceTableEnsured = true;
  };

  router.get('/:id/attendance', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Classes module is not active.' });
      const scope = await scopeOf(req);
      if (!(await canAccessClass(scope, req.params.id))) return res.status(404).json({ error: 'Class not found' });
      await ensureAttendanceTable();
      const from = String(req.query.from || '').trim();
      const to = String(req.query.to || '').trim();
      const params: any[] = [req.params.id];
      let dateFilter = '';
      if (from) { params.push(from); dateFilter += ` AND a."date" >= $${params.length}`; }
      if (to) { params.push(to); dateFilter += ` AND a."date" <= $${params.length}`; }
      const result = await pool.query(
        `SELECT a."studentId", to_char(a."date", 'YYYY-MM-DD') AS "date", a."present"
         FROM "ClassAttendance" a WHERE a."classId" = $1${dateFilter} ORDER BY a."date" ASC`,
        params
      );
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch attendance', details: error.message });
    }
  });

  router.post('/:id/attendance', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Classes module is not active.' });
      const scope = await scopeOf(req);
      if (!scope?.isStaff) return res.status(403).json({ error: 'Only staff can record attendance.' });
      if (!(await canAccessClass(scope, req.params.id))) return res.status(404).json({ error: 'Class not found' });
      await ensureAttendanceTable();
      const studentId = String(req.body?.studentId || '').trim();
      const date = String(req.body?.date || '').trim();
      const present = req.body?.present !== false;
      if (!studentId || !date) return res.status(400).json({ error: 'studentId and date are required.' });
      await pool.query(
        `INSERT INTO "ClassAttendance" (id, "classId", "studentId", "date", "present", "createdAt", "updatedAt")
         VALUES ($1,$2,$3,$4,$5,NOW(),NOW())
         ON CONFLICT ("classId", "studentId", "date") DO UPDATE SET "present"=$5, "updatedAt"=NOW()`,
        [crypto.randomUUID(), req.params.id, studentId, date, present]
      );
      res.json({ studentId, date, present });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to record attendance', details: error.message });
    }
  });

  // ---- Image upload (logo / cover) ------------------------------------------
  router.post('/:id/image', upload.single('file'), async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Classes module is not active.' });
      const scope = await scopeOf(req);
      if (!scope?.isStaff) return res.status(403).json({ error: 'Only staff can upload images.' });
      if (!(await canAccessClass(scope, req.params.id))) return res.status(404).json({ error: 'Class not found' });
      const file = req.file;
      if (!file) return res.status(400).json({ error: 'file is required.' });
      await ensureClassImageColumns();

      const kind = String(req.body?.kind || 'logo').trim() === 'cover' ? 'cover' : 'logo';
      const column = kind === 'cover' ? 'coverUrl' : 'imageUrl';

      const orgResult = await pool.query('SELECT * FROM "Organization" LIMIT 1');
      const org = orgResult.rows[0] || { name: 'org', id: '1' };
      const ext = path.extname(file.originalname || '').toLowerCase();
      const filename = `${kind}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}${ext}`;
      const orgFolderName = org.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '_' + String(org.id).split('-')[0];
      const objectKey = `${orgFolderName}/classes/${req.params.id}/${filename}`;
      const { url: fileUrl } = await putObject({ pool, key: objectKey, buffer: file.buffer, contentType: file.mimetype });

      await pool.query(`UPDATE "Class" SET "${column}" = $1, "updatedAt" = NOW() WHERE id = $2`, [fileUrl, req.params.id]);
      res.json(await loadClass(req.params.id));
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to upload image', details: error.message });
    }
  });

  // ---- Class communities -------------------------------------------------------
  router.get('/:id/communities', async (req, res) => {
    try {
      const scope = await scopeOf(req);
      if (!(await canAccessClass(scope, req.params.id))) return res.status(404).json({ error: 'Class not found' });
      const hasCommunity = await tableExists('Community');
      if (!hasCommunity) return res.json([]);
      await ensureCommunityClassId();
      const { rows } = await pool.query(
        `SELECT c.id, c.name, c.description, c."imageUrl", c.active,
                (SELECT COUNT(*) FROM "CommunityMember" cm WHERE cm."communityId" = c.id AND cm.active)::int AS "memberCount"
         FROM "Community" c
         WHERE c."classId" = $1
         ORDER BY c."createdAt" ASC`,
        [req.params.id]
      );
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch communities', details: error.message });
    }
  });

  router.post('/:id/communities', async (req, res) => {
    try {
      const scope = await scopeOf(req);
      if (!scope?.isStaff) return res.status(403).json({ error: 'Only staff can create communities.' });
      if (!(await canAccessClass(scope, req.params.id))) return res.status(404).json({ error: 'Class not found' });
      const hasCommunity = await tableExists('Community');
      if (!hasCommunity) return res.status(409).json({ error: 'Communities module not available.' });
      await ensureCommunityClassId();

      const klass = await pool.query(
        'SELECT id, name, "companyId" FROM "Class" WHERE id = $1 LIMIT 1',
        [req.params.id]
      );
      if (!klass.rows[0]) return res.status(404).json({ error: 'Class not found' });
      const { name: className, companyId } = klass.rows[0];

      // Find a unique name: "Clase", "Clase (2)", "Clase (3)", …
      const existingNames = await pool.query(
        `SELECT name FROM "Community" WHERE "companyId" = $1 AND name LIKE $2`,
        [companyId, `${className}%`]
      );
      const taken = new Set(existingNames.rows.map((r: any) => r.name as string));
      let communityName = className;
      let counter = 2;
      while (taken.has(communityName)) { communityName = `${className} (${counter++})`; }

      const communityId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO "Community" (id, name, "companyId", "classId", "createdById", active, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())`,
        [communityId, communityName, companyId, req.params.id, scope.userId]
      );

      // Auto-enroll all active class students as community members
      const [hasStudent, hasMember] = await Promise.all([tableExists('Student'), tableExists('CommunityMember')]);
      if (hasStudent && hasMember) {
        const students = await pool.query(
          `SELECT cs."studentId" FROM "ClassStudent" cs WHERE cs."classId" = $1 AND cs.status = 'ACTIVE'`,
          [req.params.id]
        );
        for (const row of students.rows) {
          await pool.query(
            `INSERT INTO "CommunityMember" (id, "communityId", "studentId", active, "joinedAt")
             VALUES ($1, $2, $3, true, NOW())
             ON CONFLICT ("communityId", "studentId") DO UPDATE SET active = true`,
            [crypto.randomUUID(), communityId, row.studentId]
          );
        }
      }

      // Auto-add all active class teachers as community professors
      const teachers = await pool.query(
        `SELECT ct."teacherId" FROM "ClassTeacher" ct WHERE ct."classId" = $1 AND ct.active = true`,
        [req.params.id]
      );
      for (const row of teachers.rows) {
        await pool.query(
          `INSERT INTO "CommunityProfessor" (id, "communityId", "userId", active, "addedAt")
           VALUES ($1, $2, $3, true, NOW())
           ON CONFLICT ("communityId", "userId") DO UPDATE SET active = true`,
          [crypto.randomUUID(), communityId, row.teacherId]
        );
      }

      const { rows } = await pool.query(
        `SELECT c.id, c.name, c.description, c."imageUrl", c.active,
                (SELECT COUNT(*) FROM "CommunityMember" cm WHERE cm."communityId" = c.id AND cm.active)::int AS "memberCount"
         FROM "Community" c WHERE c.id = $1`,
        [communityId]
      );
      res.status(201).json(rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to create community', details: error.message });
    }
  });

  // ---- Enrolled students ----------------------------------------------------
  router.get('/:id/students', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Classes module is not active.' });
      const scope = await scopeOf(req);
      if (!(await canAccessClass(scope, req.params.id))) return res.status(404).json({ error: 'Class not found' });
      const hasStudents = await tableExists('Student');
      const result = hasStudents
        ? await pool.query(
            `SELECT cs.*, s."firstName", s."lastName", s.code AS "studentCode", s.status AS "studentStatus", s."imageUrl"
             FROM "ClassStudent" cs JOIN "Student" s ON s.id = cs."studentId"
             WHERE cs."classId" = $1 ORDER BY s."lastName" ASC, s."firstName" ASC`,
            [req.params.id]
          )
        : await pool.query('SELECT * FROM "ClassStudent" WHERE "classId" = $1', [req.params.id]);
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch class students', details: error.message });
    }
  });

  // Active students of the class's tenant that are not enrolled in this class yet.
  router.get('/:id/available-students', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Classes module is not active.' });
      const scope = await scopeOf(req);
      if (!(await canAccessClass(scope, req.params.id))) return res.status(404).json({ error: 'Class not found' });
      if (!(await tableExists('Student'))) return res.json([]);

      const klass = await pool.query(
        `SELECT cl."companyId", c."organizationId"
         FROM "Class" cl
         JOIN "Company" c ON c.id = cl."companyId"
         WHERE cl.id = $1 LIMIT 1`,
        [req.params.id]
      );
      const organizationId = klass.rows[0]?.organizationId;
      if (!organizationId) return res.status(404).json({ error: 'Class not found' });

      const search = String(req.query.search || '').trim();
      const params: any[] = [organizationId, req.params.id];
      let searchClause = '';
      if (search) {
        params.push(`%${search}%`);
        searchClause = `AND (LOWER(s."firstName" || ' ' || s."lastName") LIKE LOWER($${params.length}) OR LOWER(s.code) LIKE LOWER($${params.length}))`;
      }
      const result = await pool.query(
        `SELECT s.id, s.code, s."firstName", s."lastName", s.status, s."companyId", c.name AS "companyName"
         FROM "Student" s
         JOIN "Company" c ON c.id = s."companyId"
         WHERE c."organizationId" = $1 AND s.status = 'ACTIVE'
           AND NOT EXISTS (SELECT 1 FROM "ClassStudent" cs WHERE cs."classId" = $2 AND cs."studentId" = s.id)
           ${searchClause}
         ORDER BY c.name ASC, s."lastName" ASC, s."firstName" ASC`,
        params
      );
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch available students', details: error.message });
    }
  });

  router.post('/:id/students', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Classes module is not active.' });
      const scope = await scopeOf(req);
      if (!scope?.isStaff) return res.status(403).json({ error: 'Only staff can enroll students.' });
      if (!(await canAccessClass(scope, req.params.id))) return res.status(404).json({ error: 'Class not found' });

      const studentId = String(req.body?.studentId || '').trim();
      if (!studentId) return res.status(400).json({ error: 'studentId is required.' });

      const klass = await pool.query(
        `SELECT cl."companyId", cl.capacity, c."organizationId"
         FROM "Class" cl
         JOIN "Company" c ON c.id = cl."companyId"
         WHERE cl.id = $1 LIMIT 1`,
        [req.params.id]
      );
      const klassRow = klass.rows[0];
      if (!klassRow) return res.status(404).json({ error: 'Class not found' });

      // Student must belong to the class's tenant (decoupled validation).
      if (await tableExists('Student')) {
        const s = await pool.query(
          `SELECT s."companyId", c."organizationId"
           FROM "Student" s
           JOIN "Company" c ON c.id = s."companyId"
           WHERE s.id = $1 LIMIT 1`,
          [studentId]
        );
        if (!s.rows[0]) return res.status(400).json({ error: 'Student not found.' });
        if (s.rows[0].organizationId !== klassRow.organizationId) return res.status(400).json({ error: 'Student belongs to another tenant.' });
      }

      if (klassRow.capacity != null) {
        const count = await pool.query(`SELECT COUNT(*)::int AS n FROM "ClassStudent" WHERE "classId" = $1 AND status = 'ACTIVE'`, [req.params.id]);
        if (Number(count.rows[0]?.n || 0) >= Number(klassRow.capacity)) {
          return res.status(409).json({ error: 'Class is at full capacity.' });
        }
      }

      const id = crypto.randomUUID();
      await pool.query(
        `INSERT INTO "ClassStudent" (id, "classId", "studentId", "levelId", status, "enrolledAt")
         VALUES ($1,$2,$3,$4,$5,NOW())
         ON CONFLICT ("classId", "studentId") DO UPDATE SET "levelId" = EXCLUDED."levelId", status = EXCLUDED.status`,
        [id, req.params.id, studentId, String(req.body?.levelId || '').trim() || null, String(req.body?.status || 'ACTIVE').trim() || 'ACTIVE']
      );
      res.status(201).json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to enroll student', details: error.message });
    }
  });

  router.put('/:id/students/:studentId', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Classes module is not active.' });
      const scope = await scopeOf(req);
      if (!scope?.isStaff) return res.status(403).json({ error: 'Only staff can edit enrollment.' });
      if (!(await canAccessClass(scope, req.params.id))) return res.status(404).json({ error: 'Class not found' });

      const existing = await pool.query('SELECT * FROM "ClassStudent" WHERE "classId" = $1 AND "studentId" = $2 LIMIT 1', [req.params.id, req.params.studentId]);
      const row = existing.rows[0];
      if (!row) return res.status(404).json({ error: 'Enrollment not found' });

      await pool.query(
        'UPDATE "ClassStudent" SET "levelId"=$1, status=$2 WHERE "classId"=$3 AND "studentId"=$4',
        [
          req.body?.levelId !== undefined ? (String(req.body.levelId).trim() || null) : row.levelId,
          String(req.body?.status ?? row.status).trim() || row.status,
          req.params.id, req.params.studentId
        ]
      );
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update enrollment', details: error.message });
    }
  });

  router.delete('/:id/students/:studentId', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Classes module is not active.' });
      const scope = await scopeOf(req);
      if (!scope?.isStaff) return res.status(403).json({ error: 'Only staff can remove students.' });
      if (!(await canAccessClass(scope, req.params.id))) return res.status(404).json({ error: 'Class not found' });
      await pool.query('DELETE FROM "ClassStudent" WHERE "classId" = $1 AND "studentId" = $2', [req.params.id, req.params.studentId]);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to remove student', details: error.message });
    }
  });

  // ---- Class resources ------------------------------------------------------
  const insertClassResource = async (classId: string, body: any, userId: string, storageKey?: string | null, resourceUrl?: string | null) => {
    await ensureClassResourceTable();
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO "ClassResource"
        (id, "classId", title, description, type, "resourceUrl", "storageKey", "thumbnailUrl", visibility, "publishedAt", active, "createdById", "updatedById", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12, NOW(), NOW())`,
      [
        id,
        classId,
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
    const created = await pool.query('SELECT * FROM "ClassResource" WHERE id = $1', [id]);
    return created.rows[0];
  };

  router.get('/:id/resources', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Classes module is not active.' });
      const scope = await scopeOf(req);
      if (!(await canAccessClass(scope, req.params.id))) return res.status(404).json({ error: 'Class not found' });
      await ensureClassResourceTable();
      const visibilities = allowedVisibilities(scope);
      const result = await pool.query(
        `
          SELECT r.*, creator.name AS "createdByName"
          FROM "ClassResource" r
          JOIN "User" creator ON creator.id = r."createdById"
          WHERE r."classId" = $1 AND r.active = true AND r.visibility = ANY($2)
          ORDER BY r."createdAt" DESC
        `,
        [req.params.id, visibilities]
      );
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch class resources', details: error.message });
    }
  });

  router.post('/:id/resources', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Classes module is not active.' });
      const scope = await scopeOf(req);
      if (!scope?.isStaff) return res.status(403).json({ error: 'Only staff can create resources.' });
      if (!(await canAccessClass(scope, req.params.id))) return res.status(404).json({ error: 'Class not found' });
      const userId = requesterId(req) || String(req.body?.createdById || '').trim();
      if (!userId) return res.status(400).json({ error: 'requester user is required.' });
      const title = String(req.body?.title || '').trim();
      if (!title) return res.status(400).json({ error: 'title is required.' });
      res.status(201).json(await insertClassResource(req.params.id, req.body, userId));
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to create class resource', details: error.message });
    }
  });

  router.post('/:id/resources/upload', upload.single('file'), async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Classes module is not active.' });
      const scope = await scopeOf(req);
      if (!scope?.isStaff) return res.status(403).json({ error: 'Only staff can upload resources.' });
      if (!(await canAccessClass(scope, req.params.id))) return res.status(404).json({ error: 'Class not found' });
      const userId = requesterId(req) || String(req.body?.createdById || '').trim();
      const file = req.file;
      if (!userId) return res.status(400).json({ error: 'requester user is required.' });
      if (!file) return res.status(400).json({ error: 'file is required.' });

      const orgResult = await pool.query('SELECT * FROM "Organization" LIMIT 1');
      const org = orgResult.rows[0] || { name: 'org', id: '1' };

      const ext = path.extname(file.originalname || '').toLowerCase();
      const filename = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}${ext}`;
      const orgFolderName = org.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '_' + String(org.id).split('-')[0];
      const objectKey = `${orgFolderName}/classes/${req.params.id}/resources/${filename}`;
      const { url: fileUrl } = await putObject({ pool, key: objectKey, buffer: file.buffer, contentType: file.mimetype });

      const resource = await insertClassResource(
        req.params.id,
        { ...req.body, title: String(req.body?.title || '').trim() || file.originalname },
        userId,
        fileUrl,
        fileUrl
      );
      res.status(201).json(resource);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to upload class resource', details: error.message });
    }
  });

  router.put('/:id/resources/:resourceId', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Classes module is not active.' });
      const scope = await scopeOf(req);
      if (!scope?.isStaff) return res.status(403).json({ error: 'Only staff can edit resources.' });
      if (!(await canAccessClass(scope, req.params.id))) return res.status(404).json({ error: 'Class not found' });
      await ensureClassResourceTable();
      const { id: classId, resourceId } = req.params;
      const existing = await pool.query('SELECT * FROM "ClassResource" WHERE id = $1 AND "classId" = $2 LIMIT 1', [resourceId, classId]);
      const r = existing.rows[0];
      if (!r) return res.status(404).json({ error: 'Resource not found' });
      const userId = requesterId(req) || r.updatedById;

      await pool.query(
        `UPDATE "ClassResource"
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
      const updated = await pool.query('SELECT * FROM "ClassResource" WHERE id = $1', [resourceId]);
      res.json(updated.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update class resource', details: error.message });
    }
  });

  router.delete('/:id/resources/:resourceId', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Classes module is not active.' });
      const scope = await scopeOf(req);
      if (!scope?.isStaff) return res.status(403).json({ error: 'Only staff can delete resources.' });
      if (!(await canAccessClass(scope, req.params.id))) return res.status(404).json({ error: 'Class not found' });
      await ensureClassResourceTable();
      const { id: classId, resourceId } = req.params;
      const userId = requesterId(req);
      const r = await pool.query(
        'UPDATE "ClassResource" SET active = false, "updatedById" = COALESCE($1, "updatedById"), "updatedAt" = NOW() WHERE id = $2 AND "classId" = $3',
        [userId || null, resourceId, classId]
      );
      if (!r.rowCount) return res.status(404).json({ error: 'Resource not found' });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to delete class resource', details: error.message });
    }
  });

  // ---- Single class (after literal sub-resources) ---------------------------
  router.get('/:id', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Classes module is not active.' });
      const scope = await scopeOf(req);
      if (!(await canAccessClass(scope, req.params.id))) return res.status(404).json({ error: 'Class not found' });
      const klass = await loadClass(req.params.id);
      if (!klass) return res.status(404).json({ error: 'Class not found' });
      res.json(klass);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch class', details: error.message });
    }
  });

  router.put('/:id', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Classes module is not active.' });
      const scope = await scopeOf(req);
      if (!scope?.isStaff) return res.status(403).json({ error: 'Only staff can edit classes.' });
      const existing = await loadClass(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Class not found' });
      if (scope.isAdminSede && !scope.companyScope.includes(existing.companyId)) return res.status(403).json({ error: 'Class out of scope.' });

      let disciplineId = existing.disciplineId;
      if (req.body?.disciplineId !== undefined && String(req.body.disciplineId).trim() && String(req.body.disciplineId).trim() !== existing.disciplineId) {
        disciplineId = String(req.body.disciplineId).trim();
        if (!(await canUseDiscipline(scope, disciplineId))) return res.status(400).json({ error: 'Discipline not found.' });
      }
      let companyId = existing.companyId;
      if (req.body?.companyId !== undefined && String(req.body.companyId).trim() && String(req.body.companyId).trim() !== existing.companyId) {
        companyId = String(req.body.companyId).trim();
        if (scope.isSuperAdmin && scope.organizationId) {
          const company = await pool.query('SELECT 1 FROM "Company" WHERE id = $1 AND "organizationId" = $2 LIMIT 1', [companyId, scope.organizationId]);
          if (!company.rows[0]) return res.status(403).json({ error: 'Company out of scope.' });
        }
        if (scope.isAdminSede && !scope.companyScope.includes(companyId)) return res.status(403).json({ error: 'Company out of scope.' });
      }
      const capacity =
        req.body?.capacity !== undefined
          ? (Number.isFinite(Number(req.body.capacity)) && Number(req.body.capacity) > 0 ? Math.floor(Number(req.body.capacity)) : null)
          : existing.capacity;

      await pool.query(
        `UPDATE "Class" SET name=$1, description=$2, "disciplineId"=$3, "companyId"=$4, capacity=$5, status=$6, "updatedById"=$7, "updatedAt"=NOW() WHERE id=$8`,
        [
          String(req.body?.name ?? existing.name).trim() || existing.name,
          req.body?.description !== undefined ? (String(req.body.description).trim() || null) : existing.description,
          disciplineId, companyId, capacity,
          String(req.body?.status ?? existing.status).trim() || existing.status,
          scope.userId, req.params.id
        ]
      );
      await syncRelations(req.params.id, req.body);
      res.json(await loadClass(req.params.id));
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update class', details: error.message });
    }
  });

  router.patch('/:id/status', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Classes module is not active.' });
      const scope = await scopeOf(req);
      if (!scope?.isStaff) return res.status(403).json({ error: 'Only staff can change status.' });
      const status = String(req.body?.status || '').trim();
      if (!status) return res.status(400).json({ error: 'status is required.' });
      const existing = await pool.query('SELECT "companyId" FROM "Class" WHERE id = $1 LIMIT 1', [req.params.id]);
      if (!existing.rows[0]) return res.status(404).json({ error: 'Class not found' });
      if (scope.isAdminSede && !scope.companyScope.includes(existing.rows[0].companyId)) return res.status(403).json({ error: 'Class out of scope.' });
      await pool.query('UPDATE "Class" SET status=$1, "updatedById"=$2, "updatedAt"=NOW() WHERE id=$3', [status, scope.userId, req.params.id]);
      res.json(await loadClass(req.params.id));
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update class status', details: error.message });
    }
  });

  app.use('/api/classes', router);
  return { basePath: '/api/classes', openapiPath: '/api/classes/openapi.json', docsPath: '/api/classes/docs' };
}
