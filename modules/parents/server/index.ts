import express from 'express';
import crypto from 'crypto';
import path from 'path';
import multer from 'multer';
import type { Pool } from 'pg';
import {
  resolveTenantAuthContext,
  resolveRequesterScope,
  getRequesterUserId,
  ensureRole,
  NATACION_ROLES,
  putObject,
  type RequesterScope
} from '@sinapsis/module-sdk-server';

const upload = multer({ storage: multer.memoryStorage() });

interface ParentsModuleContext {
  app: express.Express;
  pool: Pool;
}

const MODULE_CODE = 'PARENTS';

/**
 * A "Padre" is a User with the Tutor role. This module is the tenant-side ABM
 * for those accounts (basic data only). Tutor↔student links live in the Students
 * module (StudentTutor) and are managed from the student record.
 */
export default function registerParentsModule({ app, pool }: ParentsModuleContext) {
  const router = express.Router();

  const requesterId = (req: express.Request): string =>
    String((req as any).authUserId || getRequesterUserId(req) || '').trim();

  const ensureActive = async () => {
    const mod = await pool.query('SELECT status FROM "SystemModule" WHERE code = $1 LIMIT 1', [MODULE_CODE]);
    return String(mod.rows[0]?.status || '') === 'Active';
  };

  let columnsEnsured = false;
  const ensureColumns = async () => {
    if (columnsEnsured) return;
    await pool.query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phone" TEXT');
    await pool.query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "document" TEXT');
    await pool.query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT');
    await pool.query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "coverUrl" TEXT');
    columnsEnsured = true;
  };

  const tableExists = async (name: string) => {
    const r = await pool.query('SELECT to_regclass($1) AS t', [`public."${name}"`]);
    return Boolean(r.rows[0]?.t);
  };

  const getTutorRoleId = () => ensureRole(pool, NATACION_ROLES.TUTOR, 'Tutor / responsable de alumno');

  /**
   * SQL WHERE fragment (+params) limiting tutor users to the requester's scope.
   * Always confined to the requester's organization; Admin Sede is further
   * limited to its companies. Returns 'false' when nothing is visible.
   */
  const scopedClause = (scope: RequesterScope, organizationId: string, params: any[]): string => {
    params.push(organizationId);
    let clause = `c."organizationId" = $${params.length}`;
    if (!scope.isSuperAdmin) {
      if (!scope.companyScope.length) return 'false';
      params.push(scope.companyScope);
      clause += ` AND u."companyId" = ANY($${params.length})`;
    }
    return clause;
  };

  const loadParent = async (id: string) => {
    const r = await pool.query(
      `SELECT u.id, u.email, u.name, u."firstName", u."lastName", u.phone, u.document,
              u."companyId", u."imageUrl", u."coverUrl", c.name AS "companyName", u."createdAt"
       FROM "User" u JOIN "Company" c ON c.id = u."companyId"
       WHERE u.id = $1 LIMIT 1`,
      [id]
    );
    return r.rows[0] || null;
  };

  type Auth = { scope: RequesterScope; organizationId: string };
  const authStaff = async (req: express.Request, res: express.Response): Promise<Auth | null> => {
    const uid = requesterId(req);
    const scope = await resolveRequesterScope(pool, uid);
    const ctx = await resolveTenantAuthContext(pool, uid);
    if (!scope || !ctx) { res.status(401).json({ error: 'Authenticated user is required.' }); return null; }
    if (!scope.isStaff) { res.status(403).json({ error: 'Only staff can manage parents.' }); return null; }
    return { scope, organizationId: ctx.organizationId };
  };

  /** Loads a tutor user if it is within the requester's org + company scope. */
  const findInScope = async (auth: Auth, id: string) => {
    const r = await pool.query(
      `SELECT u.*, c."organizationId" AS "orgId"
       FROM "User" u JOIN "Company" c ON c.id = u."companyId" JOIN "Role" r ON r.id = u."roleId"
       WHERE u.id = $1 AND r.name = $2 LIMIT 1`,
      [id, NATACION_ROLES.TUTOR]
    );
    const row = r.rows[0];
    if (!row || row.orgId !== auth.organizationId) return null;
    if (!auth.scope.isSuperAdmin && !auth.scope.companyScope.includes(row.companyId)) return null;
    return row;
  };

  /** Validates a sede belongs to the org and is reachable by the requester. */
  const assertSede = async (auth: Auth, companyId: string, res: express.Response): Promise<boolean> => {
    const cc = await pool.query('SELECT 1 FROM "Company" WHERE id = $1 AND "organizationId" = $2 LIMIT 1', [companyId, auth.organizationId]);
    if (!cc.rows[0]) { res.status(400).json({ error: 'Sede out of scope.' }); return false; }
    if (!auth.scope.isSuperAdmin && !auth.scope.companyScope.includes(companyId)) { res.status(403).json({ error: 'Sede out of scope.' }); return false; }
    return true;
  };

  // ---- List -----------------------------------------------------------------
  router.get('/', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Parents module is not active.' });
      await ensureColumns();
      const auth = await authStaff(req, res);
      if (!auth) return;

      const params: any[] = [];
      const clause = scopedClause(auth.scope, auth.organizationId, params);
      if (clause === 'false') return res.json([]);

      const search = String(req.query.search || '').trim();
      let searchClause = '';
      if (search) {
        params.push(`%${search}%`);
        searchClause = `AND (LOWER(COALESCE(u."firstName",'') || ' ' || COALESCE(u."lastName",'')) LIKE LOWER($${params.length}) OR LOWER(u.email) LIKE LOWER($${params.length}) OR LOWER(COALESCE(u.document,'')) LIKE LOWER($${params.length}))`;
      }

      const hasStudentTutor = await tableExists('StudentTutor');
      const hasStudent = await tableExists('Student');
      const hasClassStudent = await tableExists('ClassStudent');
      const hasClass = await tableExists('Class');

      let classSubquery = 'NULL';
      if (hasClassStudent && hasClass) {
        classSubquery = `(SELECT cl.name FROM "ClassStudent" cs JOIN "Class" cl ON cl.id = cs."classId" WHERE cs."studentId" = s.id AND cs.status = 'ACTIVE' LIMIT 1)`;
      }
      const childrenSubquery = (hasStudentTutor && hasStudent)
        ? `COALESCE((
            SELECT json_agg(json_build_object(
              'id', s.id,
              'firstName', s."firstName",
              'lastName', s."lastName",
              'imageUrl', s."imageUrl",
              'className', ${classSubquery}
            ) ORDER BY s."lastName", s."firstName")
            FROM "StudentTutor" st
            JOIN "Student" s ON s.id = st."studentId"
            WHERE st."tutorId" = u.id AND st.active = true
          ), '[]'::json)`
        : `'[]'::json`;

      params.push(NATACION_ROLES.TUTOR);
      const result = await pool.query(
        `SELECT u.id, u.email, u.name, u."firstName", u."lastName", u.phone, u.document,
                u."companyId", u."imageUrl", c.name AS "companyName", u."createdAt",
                ${childrenSubquery} AS "children"
         FROM "User" u
         JOIN "Company" c ON c.id = u."companyId"
         JOIN "Role" r ON r.id = u."roleId"
         WHERE r.name = $${params.length} AND ${clause} ${searchClause}
         ORDER BY u."lastName" ASC, u."firstName" ASC`,
        params
      );
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch parents', details: error.message });
    }
  });

  // ---- Create ---------------------------------------------------------------
  router.post('/', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Parents module is not active.' });
      await ensureColumns();
      const auth = await authStaff(req, res);
      if (!auth) return;

      const firstName = String(req.body?.firstName || '').trim();
      const lastName = String(req.body?.lastName || '').trim();
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');
      const companyId = String(req.body?.companyId || '').trim() || auth.scope.primaryCompanyId || '';
      if (!firstName || !lastName) return res.status(400).json({ error: 'firstName and lastName are required.' });
      if (!email) return res.status(400).json({ error: 'email is required.' });
      if (!password) return res.status(400).json({ error: 'password is required.' });
      if (!companyId) return res.status(400).json({ error: 'companyId (sede) is required.' });
      if (!(await assertSede(auth, companyId, res))) return;

      const tutorRoleId = await getTutorRoleId();
      const id = crypto.randomUUID();
      const name = `${firstName} ${lastName}`.trim();
      await pool.query(
        `INSERT INTO "User" (id, email, name, "firstName", "lastName", password, role, "roleId", "companyId", phone, document, "createdAt", "updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())`,
        [
          id, email, name, firstName, lastName, password, NATACION_ROLES.TUTOR, tutorRoleId, companyId,
          String(req.body?.phone || '').trim() || null,
          String(req.body?.document || '').trim() || null
        ]
      );
      res.status(201).json(await loadParent(id));
    } catch (error: any) {
      if (String(error?.code) === '23505') return res.status(409).json({ error: 'A user with that email already exists.' });
      res.status(500).json({ error: 'Failed to create parent', details: error.message });
    }
  });

  // ---- Update ---------------------------------------------------------------
  router.put('/:id', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Parents module is not active.' });
      await ensureColumns();
      const auth = await authStaff(req, res);
      if (!auth) return;

      const target = await findInScope(auth, req.params.id);
      if (!target) return res.status(404).json({ error: 'Parent not found.' });

      const firstName = req.body?.firstName !== undefined ? (String(req.body.firstName).trim() || target.firstName) : target.firstName;
      const lastName = req.body?.lastName !== undefined ? (String(req.body.lastName).trim() || target.lastName) : target.lastName;
      const email = req.body?.email !== undefined ? (String(req.body.email).trim().toLowerCase() || target.email) : target.email;
      let companyId = target.companyId;
      if (req.body?.companyId !== undefined && String(req.body.companyId).trim() && String(req.body.companyId).trim() !== target.companyId) {
        companyId = String(req.body.companyId).trim();
        if (!(await assertSede(auth, companyId, res))) return;
      }
      const name = `${firstName} ${lastName}`.trim();
      const phone = req.body?.phone !== undefined ? (String(req.body.phone).trim() || null) : target.phone;
      const document = req.body?.document !== undefined ? (String(req.body.document).trim() || null) : target.document;
      const password = String(req.body?.password || '');

      await pool.query(
        `UPDATE "User" SET email=$1, name=$2, "firstName"=$3, "lastName"=$4, "companyId"=$5, phone=$6, document=$7, "updatedAt"=NOW()${password ? ', password=$9' : ''} WHERE id=$8`,
        password
          ? [email, name, firstName, lastName, companyId, phone, document, req.params.id, password]
          : [email, name, firstName, lastName, companyId, phone, document, req.params.id]
      );
      res.json(await loadParent(req.params.id));
    } catch (error: any) {
      if (String(error?.code) === '23505') return res.status(409).json({ error: 'A user with that email already exists.' });
      res.status(500).json({ error: 'Failed to update parent', details: error.message });
    }
  });

  // ---- Get one --------------------------------------------------------------
  router.get('/:id', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Parents module is not active.' });
      await ensureColumns();
      const auth = await authStaff(req, res);
      if (!auth) return;
      const target = await findInScope(auth, req.params.id);
      if (!target) return res.status(404).json({ error: 'Parent not found.' });
      res.json(await loadParent(req.params.id));
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch parent', details: error.message });
    }
  });

  // ---- Linked students (children) ------------------------------------------
  router.get('/:id/students', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Parents module is not active.' });
      await ensureColumns();
      const auth = await authStaff(req, res);
      if (!auth) return;
      const target = await findInScope(auth, req.params.id);
      if (!target) return res.status(404).json({ error: 'Parent not found.' });

      if (!(await tableExists('StudentTutor')) || !(await tableExists('Student'))) return res.json([]);

      const hasClassStudent = await tableExists('ClassStudent');
      const hasClass = await tableExists('Class');
      const classSubquery = (hasClassStudent && hasClass)
        ? `(SELECT cl.name FROM "ClassStudent" cs JOIN "Class" cl ON cl.id = cs."classId" WHERE cs."studentId" = s.id AND cs.status = 'ACTIVE' LIMIT 1)`
        : 'NULL';

      const result = await pool.query(
        `SELECT s.id, s.code, s."firstName", s."lastName", s."imageUrl", s.status,
                c.name AS "companyName", ${classSubquery} AS "className"
         FROM "StudentTutor" st
         JOIN "Student" s ON s.id = st."studentId"
         JOIN "Company" c ON c.id = s."companyId"
         WHERE st."tutorId" = $1 AND st.active = true
         ORDER BY s."lastName" ASC, s."firstName" ASC`,
        [req.params.id]
      );
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch children', details: error.message });
    }
  });

  // ---- Image upload (avatar / cover) ----------------------------------------
  router.post('/:id/image', upload.single('file'), async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Parents module is not active.' });
      await ensureColumns();
      const auth = await authStaff(req, res);
      if (!auth) return;
      const target = await findInScope(auth, req.params.id);
      if (!target) return res.status(404).json({ error: 'Parent not found.' });
      const file = req.file;
      if (!file) return res.status(400).json({ error: 'file is required.' });

      const kind = String(req.body?.kind || 'logo').trim() === 'cover' ? 'cover' : 'logo';
      const column = kind === 'cover' ? 'coverUrl' : 'imageUrl';

      const orgResult = await pool.query('SELECT * FROM "Organization" LIMIT 1');
      const org = orgResult.rows[0] || { name: 'org', id: '1' };
      const ext = path.extname(file.originalname || '').toLowerCase();
      const filename = `${kind}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}${ext}`;
      const orgFolderName = org.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '_' + String(org.id).split('-')[0];
      const objectKey = `${orgFolderName}/parents/${req.params.id}/${filename}`;
      const { url: fileUrl } = await putObject({ pool, key: objectKey, buffer: file.buffer, contentType: file.mimetype });

      await pool.query(`UPDATE "User" SET "${column}" = $1, "updatedAt" = NOW() WHERE id = $2`, [fileUrl, req.params.id]);
      res.json(await loadParent(req.params.id));
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to upload image', details: error.message });
    }
  });

  // ---- Delete (baja) --------------------------------------------------------
  router.delete('/:id', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Parents module is not active.' });
      const auth = await authStaff(req, res);
      if (!auth) return;

      const target = await findInScope(auth, req.params.id);
      if (!target) return res.status(404).json({ error: 'Parent not found.' });

      if (await tableExists('StudentTutor')) {
        await pool.query('DELETE FROM "StudentTutor" WHERE "tutorId" = $1', [req.params.id]);
      }
      await pool.query('DELETE FROM "User" WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to delete parent', details: error.message });
    }
  });

  app.use('/api/parents', router);
  return { basePath: '/api/parents' };
}
