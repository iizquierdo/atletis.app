import express from 'express';
import crypto from 'crypto';
import type { Pool } from 'pg';

// Inlined from @sinapsis/module-sdk-server to avoid dynamic import resolution issues
function getRequesterUserId(req: express.Request): string {
  const fromHeader = typeof req.header === 'function' ? req.header('X-User-Id') : undefined;
  const fromQuery = (req as any).query?.userId;
  const fromBody = (req as any).body?.userId || (req as any).body?.createdById;
  return String(fromHeader || fromQuery || fromBody || '').trim();
}

type RequesterScope = {
  userId: string; roleName: string; legacyRole: string;
  isSuperAdmin: boolean; isAdminSede: boolean; isProfesor: boolean; isTutor: boolean; isStaff: boolean;
  primaryCompanyId: string | null; accessCompanyIds: string[]; companyScope: string[];
};

async function resolveRequesterScope(pool: Pool, userId: string): Promise<RequesterScope | null> {
  const id = String(userId || '').trim();
  if (!id) return null;
  const r = await pool.query(
    `SELECT u.id, COALESCE(u.role,'') AS "legacyRole", COALESCE(r.name,'') AS "roleName",
            u."companyId", u."accessCompanyIds"
     FROM "User" u LEFT JOIN "Role" r ON r.id = u."roleId" WHERE u.id = $1 LIMIT 1`,
    [id]
  );
  const row = r.rows[0];
  if (!row) return null;
  const legacyRole  = String(row.legacyRole || '').trim();
  const roleName    = String(row.roleName || '').trim();
  const legacyLower = legacyRole.toLowerCase();
  const isSuperAdmin = legacyLower === 'administrator' || legacyLower === 'admin' || roleName === 'Super Admin';
  const isAdminSede  = roleName === 'Admin Sede';
  const isProfesor   = roleName === 'Profesor';
  const isTutor      = roleName === 'Tutor';
  const primaryCompanyId = row.companyId ? String(row.companyId) : null;
  const raw = row.accessCompanyIds;
  const accessCompanyIds: string[] = Array.isArray(raw) ? raw.map(String).filter(Boolean)
    : (typeof raw === 'string' && raw.startsWith('{')) ? raw.replace(/[{}]/g, '').split(',').map((s: string) => s.trim()).filter(Boolean)
    : [];
  const companyScope = Array.from(new Set([...(primaryCompanyId ? [primaryCompanyId] : []), ...accessCompanyIds]));
  return { userId: id, roleName, legacyRole, isSuperAdmin, isAdminSede, isProfesor, isTutor, isStaff: isSuperAdmin || isAdminSede, primaryCompanyId, accessCompanyIds, companyScope };
}

// ─────────────────────────────────────────────────────────────────────────────

interface ReportsModuleContext {
  app: express.Express;
  pool: Pool;
}

const MODULE_CODE = 'REPORTS';

export default function registerReportsModule({ app, pool }: ReportsModuleContext) {
  const router = express.Router();

  const requesterId = (req: express.Request): string =>
    String((req as any).authUserId || getRequesterUserId(req) || '').trim();

  const scopeOf = (req: express.Request) => resolveRequesterScope(pool, requesterId(req));

  const ensureActive = async () => {
    const mod = await pool.query('SELECT status FROM "SystemModule" WHERE code = $1 LIMIT 1', [MODULE_CODE]);
    return String(mod.rows[0]?.status || '') === 'Active';
  };

  const SELECT_COLS = `
    r.*,
    (s."firstName" || ' ' || s."lastName") AS "studentName",
    s."imageUrl" AS "studentAvatarUrl",
    a.name AS "authorName",
    COALESCE(a."imageUrl", a.avatar) AS "authorAvatarUrl",
    c.name AS "companyName"
  `;

  const BASE_FROM = `
    FROM "StudentReport" r
    JOIN "Student" s ON s.id = r."studentId"
    JOIN "User" a ON a.id = r."authorId"
    LEFT JOIN "Company" c ON c.id = s."companyId"
  `;

  const professorStudentScopeSql = (teacherParam: string) => `(
    EXISTS (SELECT 1 FROM "StudentTeacher" st WHERE st."studentId" = s.id AND st."teacherId" = ${teacherParam} AND st.active)
    OR (
      to_regclass('public."ClassTeacher"') IS NOT NULL
      AND to_regclass('public."ClassStudent"') IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "ClassStudent" cs
        JOIN "ClassTeacher" ct ON ct."classId" = cs."classId" AND ct."teacherId" = ${teacherParam} AND ct.active = true
        WHERE cs."studentId" = s.id AND cs.status = 'ACTIVE'
      )
    )
  )`;

  // ── /meta/students must come BEFORE /:id ─────────────────────────────────
  router.get('/meta/students', async (req, res) => {
    try {
      const scope = await scopeOf(req);
      if (!scope) return res.status(403).json({ error: 'Authentication required.' });

      const params: any[] = [];
      const conditions: string[] = ['s.status = \'ACTIVE\''];

      if (scope.isSuperAdmin) {
        // no restriction
      } else if (scope.isAdminSede) {
        if (!scope.companyScope.length) return res.json([]);
        params.push(scope.companyScope);
        conditions.push(`s."companyId" = ANY($${params.length})`);
      } else if (scope.isProfesor) {
        params.push(scope.userId);
        conditions.push(professorStudentScopeSql(`$${params.length}`));
      } else {
        return res.json([]);
      }

      const { rows } = await pool.query(
        `SELECT s.id, s."firstName", s."lastName", c.name AS "companyName"
         FROM "Student" s LEFT JOIN "Company" c ON c.id = s."companyId"
         WHERE ${conditions.join(' AND ')} ORDER BY s."lastName", s."firstName" LIMIT 500`,
        params
      );
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch students', details: error.message });
    }
  });

  // ── List ─────────────────────────────────────────────────────────────────
  router.get('/', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Reports module is not active.' });
      const scope = await scopeOf(req);
      if (!scope) return res.status(403).json({ error: 'Authentication required.' });

      const params: any[] = [];
      const conditions: string[] = [];

      if (scope.isSuperAdmin) {
        // no restriction
      } else if (scope.isAdminSede) {
        if (!scope.companyScope.length) return res.json({ items: [], total: 0 });
        params.push(scope.companyScope);
        conditions.push(`s."companyId" = ANY($${params.length})`);
      } else if (scope.isProfesor) {
        params.push(scope.userId);
        conditions.push(professorStudentScopeSql(`$${params.length}`));
      } else {
        return res.status(403).json({ error: 'Access denied.' });
      }

      if (req.query.studentId) { params.push(req.query.studentId); conditions.push(`r."studentId" = $${params.length}`); }
      if (req.query.authorId)  { params.push(req.query.authorId);  conditions.push(`r."authorId" = $${params.length}`); }
      if (req.query.status)    { params.push(req.query.status);    conditions.push(`r.status = $${params.length}`); }
      if (req.query.type)      { params.push(req.query.type);      conditions.push(`r.type = $${params.length}`); }
      if (req.query.companyId) { params.push(req.query.companyId); conditions.push(`s."companyId" = $${params.length}`); }
      if (req.query.q) {
        params.push(`%${req.query.q}%`);
        const n = params.length;
        conditions.push(`(r.title ILIKE $${n} OR r.content ILIKE $${n} OR r.summary ILIKE $${n} OR s."firstName" ILIKE $${n} OR s."lastName" ILIKE $${n})`);
      }

      const where  = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const page   = Math.max(1, parseInt(String(req.query.page  || '1'),  10));
      const limit  = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '50'), 10)));
      const offset = (page - 1) * limit;

      const [rows, total] = await Promise.all([
        pool.query(`SELECT ${SELECT_COLS} ${BASE_FROM} ${where} ORDER BY r."createdAt" DESC LIMIT ${limit} OFFSET ${offset}`, params),
        pool.query(`SELECT COUNT(*) AS total ${BASE_FROM} ${where}`, params),
      ]);

      res.json({ items: rows.rows, total: parseInt(total.rows[0]?.total ?? '0', 10), page, limit });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch reports', details: error.message });
    }
  });

  // ── Single ────────────────────────────────────────────────────────────────
  router.get('/:id', async (req, res) => {
    try {
      const scope = await scopeOf(req);
      if (!scope) return res.status(403).json({ error: 'Authentication required.' });
      const { rows } = await pool.query(`SELECT ${SELECT_COLS} ${BASE_FROM} WHERE r.id = $1 LIMIT 1`, [req.params.id]);
      if (!rows[0]) return res.status(404).json({ error: 'Report not found.' });
      res.json(rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch report', details: error.message });
    }
  });

  // ── Create ────────────────────────────────────────────────────────────────
  router.post('/', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Reports module is not active.' });
      const scope = await scopeOf(req);
      if (!scope || (!scope.isStaff && !scope.isProfesor)) return res.status(403).json({ error: 'Only staff or teachers can create reports.' });

      const studentId = String(req.body?.studentId || '').trim();
      const title     = String(req.body?.title     || '').trim();
      if (!studentId) return res.status(400).json({ error: 'studentId is required.' });
      if (!title)     return res.status(400).json({ error: 'title is required.' });

      if (!scope.isStaff) {
        const check = await pool.query(
          `SELECT 1 FROM "StudentTeacher" WHERE "studentId"=$1 AND "teacherId"=$2 AND active LIMIT 1
           UNION ALL
           SELECT 1 FROM "ClassStudent" cs
           JOIN "ClassTeacher" ct ON ct."classId" = cs."classId" AND ct."teacherId" = $2 AND ct.active = true
           WHERE cs."studentId" = $1 AND cs.status = 'ACTIVE'
           LIMIT 1`,
          [studentId, scope.userId]
        );
        if (!check.rows.length) return res.status(403).json({ error: 'Student out of scope.' });
      }

      const id     = crypto.randomUUID();
      const status = String(req.body?.status || 'DRAFT').trim();

      await pool.query(
        `INSERT INTO "StudentReport" (id, "studentId", "authorId", type, title, content, summary, visibility, status, "publishedAt", "createdAt", "updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())`,
        [id, studentId, scope.userId,
          String(req.body?.type || 'PROGRESS').trim(), title,
          String(req.body?.content  || '').trim() || null,
          String(req.body?.summary  || '').trim() || null,
          String(req.body?.visibility || 'INTERNAL_STAFF').trim(),
          status, status === 'PUBLISHED' ? new Date() : null]
      );

      if (req.body?.rating) {
        const rating = Math.min(5, Math.max(1, parseInt(req.body.rating, 10)));
        await pool.query(`UPDATE "StudentReport" SET rating=$1, "ratingTheme"=$2 WHERE id=$3`,
          [rating, String(req.body?.ratingTheme || 'stars').trim(), id]).catch(() => {});
      }

      const { rows } = await pool.query(`SELECT ${SELECT_COLS} ${BASE_FROM} WHERE r.id = $1`, [id]);
      res.status(201).json(rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to create report', details: error.message });
    }
  });

  // ── Update ────────────────────────────────────────────────────────────────
  router.put('/:id', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Reports module is not active.' });
      const scope = await scopeOf(req);
      const { id } = req.params;
      const existing = await pool.query('SELECT * FROM "StudentReport" WHERE id=$1 LIMIT 1', [id]);
      const rep = existing.rows[0];
      if (!rep) return res.status(404).json({ error: 'Report not found.' });
      if (!scope || (!scope.isStaff && rep.authorId !== scope.userId)) return res.status(403).json({ error: 'Cannot edit this report.' });

      const status = req.body?.status !== undefined ? String(req.body.status).trim() : rep.status;
      await pool.query(
        `UPDATE "StudentReport" SET type=$1, title=$2, content=$3, summary=$4, visibility=$5, status=$6, "publishedAt"=$7, "updatedAt"=NOW() WHERE id=$8`,
        [
          String(req.body?.type ?? rep.type).trim(),
          String(req.body?.title ?? rep.title).trim() || rep.title,
          req.body?.content   !== undefined ? (String(req.body.content).trim()  || null) : rep.content,
          req.body?.summary   !== undefined ? (String(req.body.summary).trim()  || null) : rep.summary,
          String(req.body?.visibility ?? rep.visibility).trim(),
          status,
          status === 'PUBLISHED' && !rep.publishedAt ? new Date() : rep.publishedAt,
          id,
        ]
      );

      if (req.body?.rating !== undefined || req.body?.ratingTheme !== undefined) {
        const rating = req.body.rating ? Math.min(5, Math.max(1, parseInt(req.body.rating, 10))) : null;
        await pool.query(`UPDATE "StudentReport" SET rating=$1, "ratingTheme"=$2 WHERE id=$3`,
          [rating, String(req.body?.ratingTheme || 'stars').trim(), id]).catch(() => {});
      }

      const { rows } = await pool.query(`SELECT ${SELECT_COLS} ${BASE_FROM} WHERE r.id = $1`, [id]);
      res.json(rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update report', details: error.message });
    }
  });

  // ── Delete ────────────────────────────────────────────────────────────────
  router.delete('/:id', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Reports module is not active.' });
      const scope = await scopeOf(req);
      const { id } = req.params;
      const existing = await pool.query('SELECT * FROM "StudentReport" WHERE id=$1 LIMIT 1', [id]);
      const rep = existing.rows[0];
      if (!rep) return res.status(404).json({ error: 'Report not found.' });
      if (!scope || (!scope.isStaff && rep.authorId !== scope.userId)) return res.status(403).json({ error: 'Cannot delete this report.' });

      await pool.query('DELETE FROM "StudentReportRecipient" WHERE "reportId"=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM "StudentReport" WHERE id=$1', [id]);
      res.status(204).end();
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to delete report', details: error.message });
    }
  });

  app.use('/api/reports', router);
}
