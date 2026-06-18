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

interface TeachersModuleContext {
  app: express.Express;
  pool: Pool;
}

const MODULE_CODE = 'TEACHERS';

/**
 * A "Profesor" is a User with the Profesor role. This module is the tenant-side ABM
 * for those accounts (basic data only). Profesor↔class links live in the Classes
 * module (ClassTeacher) and are managed from the class record.
 */
export default function registerTeachersModule({ app, pool }: TeachersModuleContext) {
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

  const getProfesorRoleId = () => ensureRole(pool, NATACION_ROLES.PROFESOR, 'Profesor / staff técnico');

  /**
   * SQL WHERE fragment (+params) limiting profesor users to the requester's scope.
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

  const loadTeacher = async (id: string) => {
    const r = await pool.query(
      `SELECT u.id, u.email, u.name, u."firstName", u."lastName", u.phone, u.document,
              u."companyId", c.name AS "companyName", u."createdAt",
              u."imageUrl", u."coverUrl"
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
    if (!scope.isStaff) { res.status(403).json({ error: 'Only staff can manage teachers.' }); return null; }
    return { scope, organizationId: ctx.organizationId };
  };

  /** Loads a profesor user if it is within the requester's org + company scope. */
  const findInScope = async (auth: Auth, id: string) => {
    const r = await pool.query(
      `SELECT u.*, c."organizationId" AS "orgId"
       FROM "User" u JOIN "Company" c ON c.id = u."companyId" JOIN "Role" r ON r.id = u."roleId"
       WHERE u.id = $1 AND r.name = $2 LIMIT 1`,
      [id, NATACION_ROLES.PROFESOR]
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
      if (!(await ensureActive())) return res.status(409).json({ error: 'Teachers module is not active.' });
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

      params.push(NATACION_ROLES.PROFESOR);
      const result = await pool.query(
        `SELECT u.id, u.email, u.name, u."firstName", u."lastName", u.phone, u.document,
                u."companyId", c.name AS "companyName", u."createdAt", u."imageUrl"
         FROM "User" u
         JOIN "Company" c ON c.id = u."companyId"
         JOIN "Role" r ON r.id = u."roleId"
         WHERE r.name = $${params.length} AND ${clause} ${searchClause}
         ORDER BY u."lastName" ASC, u."firstName" ASC`,
        params
      );
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch teachers', details: error.message });
    }
  });

  // ---- Get one --------------------------------------------------------------
  router.get('/:id', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Teachers module is not active.' });
      await ensureColumns();
      const auth = await authStaff(req, res);
      if (!auth) return;
      const target = await findInScope(auth, req.params.id);
      if (!target) return res.status(404).json({ error: 'Teacher not found.' });
      res.json(await loadTeacher(req.params.id));
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch teacher', details: error.message });
    }
  });

  // ---- Classes for a teacher ------------------------------------------------
  router.get('/:id/classes', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Teachers module is not active.' });
      const auth = await authStaff(req, res);
      if (!auth) return;
      const target = await findInScope(auth, req.params.id);
      if (!target) return res.status(404).json({ error: 'Teacher not found.' });
      if (!(await tableExists('ClassTeacher'))) return res.json([]);
      const hasDisciplines = await tableExists('Discipline');
      const r = await pool.query(
        `SELECT cl.id, cl.name, cl."companyId", cl.status, c.name AS "companyName",
                ${hasDisciplines ? `(SELECT d.name FROM "Discipline" d WHERE d.id = cl."disciplineId")` : 'NULL'} AS "disciplineName"
         FROM "ClassTeacher" ct
         JOIN "Class" cl ON cl.id = ct."classId"
         JOIN "Company" c ON c.id = cl."companyId"
         WHERE ct."teacherId" = $1 AND ct.active = true
         ORDER BY cl.name ASC`,
        [req.params.id]
      );
      res.json(r.rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch teacher classes', details: error.message });
    }
  });

  // ---- Image upload (logo / cover) ------------------------------------------
  router.post('/:id/image', upload.single('file'), async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Teachers module is not active.' });
      await ensureColumns();
      const auth = await authStaff(req, res);
      if (!auth) return;
      const target = await findInScope(auth, req.params.id);
      if (!target) return res.status(404).json({ error: 'Teacher not found.' });
      const file = req.file;
      if (!file) return res.status(400).json({ error: 'file is required.' });

      const kind = String(req.body?.kind || 'logo').trim() === 'cover' ? 'cover' : 'logo';
      const column = kind === 'cover' ? 'coverUrl' : 'imageUrl';

      const orgResult = await pool.query('SELECT * FROM "Organization" LIMIT 1');
      const org = orgResult.rows[0] || { name: 'org', id: '1' };
      const ext = path.extname(file.originalname || '').toLowerCase();
      const filename = `${kind}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}${ext}`;
      const orgFolderName = org.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '_' + String(org.id).split('-')[0];
      const objectKey = `${orgFolderName}/teachers/${req.params.id}/${filename}`;
      const { url: fileUrl } = await putObject({ pool, key: objectKey, buffer: file.buffer, contentType: file.mimetype });

      await pool.query(`UPDATE "User" SET "${column}" = $1, "updatedAt" = NOW() WHERE id = $2`, [fileUrl, req.params.id]);
      res.json(await loadTeacher(req.params.id));
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to upload image', details: error.message });
    }
  });

  // ---- Assign teacher to a class --------------------------------------------
  router.post('/:id/classes', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Teachers module is not active.' });
      const auth = await authStaff(req, res);
      if (!auth) return;
      const target = await findInScope(auth, req.params.id);
      if (!target) return res.status(404).json({ error: 'Teacher not found.' });
      if (!(await tableExists('ClassTeacher'))) return res.status(409).json({ error: 'Classes module not available.' });
      const classId = String(req.body?.classId || '').trim();
      if (!classId) return res.status(400).json({ error: 'classId is required.' });
      const cls = await pool.query(
        `SELECT cl.id FROM "Class" cl JOIN "Company" c ON c.id = cl."companyId" WHERE cl.id = $1 AND c."organizationId" = $2 LIMIT 1`,
        [classId, auth.organizationId]
      );
      if (!cls.rows[0]) return res.status(404).json({ error: 'Class not found.' });
      await pool.query(
        `INSERT INTO "ClassTeacher" (id, "classId", "teacherId", active, "assignedAt")
         VALUES ($1, $2, $3, true, NOW())
         ON CONFLICT ("classId", "teacherId") DO UPDATE SET active = true, "assignedAt" = NOW()`,
        [crypto.randomUUID(), classId, req.params.id]
      );
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to assign class', details: error.message });
    }
  });

  // ---- Remove teacher from a class ------------------------------------------
  router.delete('/:id/classes/:classId', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Teachers module is not active.' });
      const auth = await authStaff(req, res);
      if (!auth) return;
      const target = await findInScope(auth, req.params.id);
      if (!target) return res.status(404).json({ error: 'Teacher not found.' });
      if (!(await tableExists('ClassTeacher'))) return res.json({ success: true });
      await pool.query('DELETE FROM "ClassTeacher" WHERE "teacherId" = $1 AND "classId" = $2', [req.params.id, req.params.classId]);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to remove from class', details: error.message });
    }
  });

  // ---- Students taught by this teacher (via ClassTeacher → ClassStudent) ----
  router.get('/:id/students', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Teachers module is not active.' });
      const auth = await authStaff(req, res);
      if (!auth) return;
      const target = await findInScope(auth, req.params.id);
      if (!target) return res.status(404).json({ error: 'Teacher not found.' });
      if (!(await tableExists('ClassTeacher')) || !(await tableExists('ClassStudent'))) return res.json([]);
      const hasStudent = await pool.query(`SELECT to_regclass('public."Student"') AS t`);
      if (!hasStudent.rows[0]?.t) return res.json([]);
      const r = await pool.query(
        `SELECT DISTINCT s.id, s."firstName", s."lastName", s.email, s.code AS "studentCode",
                s."imageUrl",
                cl.id AS "classId", cl.name AS "className", c.name AS "companyName",
                cs.status AS "enrollmentStatus"
         FROM "ClassTeacher" ct
         JOIN "Class" cl ON cl.id = ct."classId"
         JOIN "Company" c ON c.id = cl."companyId"
         JOIN "ClassStudent" cs ON cs."classId" = cl.id AND cs.status = 'ACTIVE'
         JOIN "Student" s ON s.id = cs."studentId"
         WHERE ct."teacherId" = $1 AND ct.active = true AND c."organizationId" = $2
         ORDER BY s."lastName" ASC, s."firstName" ASC`,
        [req.params.id, auth.organizationId]
      );
      res.json(r.rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch students', details: error.message });
    }
  });

  // ---- Available classes (to pick from when assigning) ----------------------
  router.get('/:id/available-classes', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Teachers module is not active.' });
      const auth = await authStaff(req, res);
      if (!auth) return;
      const target = await findInScope(auth, req.params.id);
      if (!target) return res.status(404).json({ error: 'Teacher not found.' });
      if (!(await tableExists('ClassTeacher'))) {
        const all = await pool.query(
          `SELECT cl.id, cl.name, cl.status, c.name AS "companyName" FROM "Class" cl
           JOIN "Company" c ON c.id = cl."companyId"
           WHERE c."organizationId" = $1 ORDER BY cl.name ASC`,
          [auth.organizationId]
        );
        return res.json(all.rows);
      }
      const r = await pool.query(
        `SELECT cl.id, cl.name, cl.status, c.name AS "companyName"
         FROM "Class" cl
         JOIN "Company" c ON c.id = cl."companyId"
         WHERE c."organizationId" = $1
           AND cl.id NOT IN (
             SELECT "classId" FROM "ClassTeacher" WHERE "teacherId" = $2 AND active = true
           )
         ORDER BY cl.name ASC`,
        [auth.organizationId, req.params.id]
      );
      res.json(r.rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch available classes', details: error.message });
    }
  });

  // ---- Communities for a teacher --------------------------------------------
  router.get('/:id/communities', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Teachers module is not active.' });
      const auth = await authStaff(req, res);
      if (!auth) return;
      const target = await findInScope(auth, req.params.id);
      if (!target) return res.status(404).json({ error: 'Teacher not found.' });
      if (!(await tableExists('CommunityProfessor'))) return res.json([]);
      const hasDiscipline = await tableExists('Discipline');
      const disciplineJoin = hasDiscipline ? `LEFT JOIN "Discipline" disc ON disc.id = cm."disciplineId"` : '';
      const disciplineSelect = hasDiscipline ? `, disc.name AS "disciplineName"` : `, NULL AS "disciplineName"`;
      const r = await pool.query(
        `SELECT cm.id, cm.name, cm.active, cm."imageUrl", cm."companyId", c.name AS "companyName"${disciplineSelect},
                (SELECT COUNT(*)::int FROM "CommunityMember" m WHERE m."communityId" = cm.id AND m.active) AS "memberCount",
                (SELECT COUNT(*)::int FROM "CommunityPost" p WHERE p."communityId" = cm.id) AS "postCount"
         FROM "Community" cm
         JOIN "Company" c ON c.id = cm."companyId"
         ${disciplineJoin}
         WHERE EXISTS (
           SELECT 1 FROM "CommunityProfessor" cp WHERE cp."communityId" = cm.id AND cp."userId" = $1 AND cp.active = true
         )
         ORDER BY cm.name ASC`,
        [req.params.id]
      );
      res.json(r.rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch communities', details: error.message });
    }
  });

  // ---- Reports authored by a teacher ----------------------------------------
  router.get('/:id/reports', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Teachers module is not active.' });
      const auth = await authStaff(req, res);
      if (!auth) return;
      const target = await findInScope(auth, req.params.id);
      if (!target) return res.status(404).json({ error: 'Teacher not found.' });
      if (!(await tableExists('StudentReport'))) return res.json([]);
      const r = await pool.query(
        `SELECT r.*, (s."firstName" || ' ' || s."lastName") AS "studentName", s."imageUrl" AS "studentAvatarUrl",
                c.name AS "companyName"
         FROM "StudentReport" r
         JOIN "Student" s ON s.id = r."studentId"
         LEFT JOIN "Company" c ON c.id = s."companyId"
         WHERE r."authorId" = $1
         ORDER BY r."createdAt" DESC`,
        [req.params.id]
      );
      res.json(r.rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch reports', details: error.message });
    }
  });

  // ---- Conversations where teacher is a participant -------------------------
  router.get('/:id/conversations', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Teachers module is not active.' });
      const auth = await authStaff(req, res);
      if (!auth) return;
      const target = await findInScope(auth, req.params.id);
      if (!target) return res.status(404).json({ error: 'Teacher not found.' });
      if (!(await tableExists('Conversation'))) return res.json([]);
      const r = await pool.query(
        `SELECT conv.id, conv.subject, conv.status, conv."createdAt", conv."updatedAt",
                s."firstName" AS "studentFirstName", s."lastName" AS "studentLastName",
                s."imageUrl" AS "studentAvatarUrl",
                last_msg.body AS "lastMessageBody",
                last_msg."createdAt" AS "lastMessageAt",
                COALESCE(last_sender."firstName" || ' ' || last_sender."lastName", last_sender.name) AS "lastSenderName",
                (SELECT COUNT(*)::int FROM "Message" m WHERE m."conversationId" = conv.id) AS "messageCount"
         FROM "Conversation" conv
         JOIN "Student" s ON s.id = conv."studentId"
         JOIN "ConversationParticipant" cp ON cp."conversationId" = conv.id AND cp."userId" = $1 AND cp.active = true
         LEFT JOIN LATERAL (
           SELECT m.body, m."createdAt", m."senderId"
           FROM "Message" m WHERE m."conversationId" = conv.id ORDER BY m."createdAt" DESC LIMIT 1
         ) last_msg ON true
         LEFT JOIN "User" last_sender ON last_sender.id = last_msg."senderId"
         ORDER BY COALESCE(last_msg."createdAt", conv."createdAt") DESC`,
        [req.params.id]
      );
      res.json(r.rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch conversations', details: error.message });
    }
  });

  // ---- Available communities (not yet assigned) ----------------------------
  router.get('/:id/available-communities', async (req, res) => {
    try {
      const auth = await authStaff(req, res);
      if (!auth) return;
      const target = await findInScope(auth, req.params.id);
      if (!target) return res.status(404).json({ error: 'Teacher not found.' });
      if (!(await tableExists('Community'))) return res.json([]);
      const hasDiscipline = await tableExists('Discipline');
      const disciplineJoin = hasDiscipline ? `LEFT JOIN "Discipline" disc ON disc.id = cm."disciplineId"` : '';
      const disciplineSelect = hasDiscipline ? `, disc.name AS "disciplineName"` : `, NULL AS "disciplineName"`;
      const r = await pool.query(
        `SELECT cm.id, cm.name, c.name AS "companyName"${disciplineSelect}
         FROM "Community" cm
         JOIN "Company" c ON c.id = cm."companyId"
         ${disciplineJoin}
         WHERE c."organizationId" = $1 AND cm.active = true
           AND NOT EXISTS (
             SELECT 1 FROM "CommunityProfessor" cp
             WHERE cp."communityId" = cm.id AND cp."userId" = $2 AND cp.active = true
           )
         ORDER BY cm.name ASC`,
        [auth.organizationId, req.params.id]
      );
      res.json(r.rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch available communities', details: error.message });
    }
  });

  // ---- Add teacher to community --------------------------------------------
  router.post('/:id/communities', async (req, res) => {
    try {
      const auth = await authStaff(req, res);
      if (!auth) return;
      const target = await findInScope(auth, req.params.id);
      if (!target) return res.status(404).json({ error: 'Teacher not found.' });
      const communityId = String(req.body?.communityId || '').trim();
      if (!communityId) return res.status(400).json({ error: 'communityId is required.' });
      await pool.query(
        `INSERT INTO "CommunityProfessor" (id, "communityId", "userId", active, "addedAt")
         VALUES ($1,$2,$3,true,NOW())
         ON CONFLICT ("communityId","userId") DO UPDATE SET active = true`,
        [crypto.randomUUID(), communityId, req.params.id]
      );
      res.status(201).json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to add community', details: error.message });
    }
  });

  // ---- Remove teacher from community ---------------------------------------
  router.delete('/:id/communities/:communityId', async (req, res) => {
    try {
      const auth = await authStaff(req, res);
      if (!auth) return;
      const target = await findInScope(auth, req.params.id);
      if (!target) return res.status(404).json({ error: 'Teacher not found.' });
      await pool.query(
        `UPDATE "CommunityProfessor" SET active = false WHERE "communityId" = $1 AND "userId" = $2`,
        [req.params.communityId, req.params.id]
      );
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to remove community', details: error.message });
    }
  });

  // ---- Students available for report creation by teacher -------------------
  router.get('/:id/report-students', async (req, res) => {
    try {
      const auth = await authStaff(req, res);
      if (!auth) return;
      const target = await findInScope(auth, req.params.id);
      if (!target) return res.status(404).json({ error: 'Teacher not found.' });
      const hasST = await tableExists('StudentTeacher');
      const hasCT = await tableExists('ClassTeacher');
      const hasCS = await tableExists('ClassStudent');
      let rows: any[] = [];
      if (hasST || (hasCT && hasCS)) {
        const clauses: string[] = [];
        if (hasST) clauses.push(`EXISTS (SELECT 1 FROM "StudentTeacher" st WHERE st."studentId" = s.id AND st."teacherId" = $1 AND st.active)`);
        if (hasCT && hasCS) clauses.push(`EXISTS (SELECT 1 FROM "ClassStudent" cs JOIN "ClassTeacher" ct ON ct."classId" = cs."classId" AND ct."teacherId" = $1 AND ct.active = true WHERE cs."studentId" = s.id AND cs.status = 'ACTIVE')`);
        const r = await pool.query(
          `SELECT s.id, s."firstName", s."lastName", c.name AS "companyName"
           FROM "Student" s
           LEFT JOIN "Company" c ON c.id = s."companyId"
           WHERE (${clauses.join(' OR ')}) AND s.status = 'ACTIVE'
           ORDER BY s."lastName" ASC, s."firstName" ASC`,
          [req.params.id]
        );
        rows = r.rows;
      } else {
        const r = await pool.query(
          `SELECT s.id, s."firstName", s."lastName", c.name AS "companyName"
           FROM "Student" s
           LEFT JOIN "Company" c ON c.id = s."companyId"
           WHERE s.status = 'ACTIVE' AND c."organizationId" = $1
           ORDER BY s."lastName" ASC, s."firstName" ASC`,
          [auth.organizationId]
        );
        rows = r.rows;
      }
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch students', details: error.message });
    }
  });

  // ---- Create report authored by teacher -----------------------------------
  router.post('/:id/reports', async (req, res) => {
    try {
      const auth = await authStaff(req, res);
      if (!auth) return;
      const target = await findInScope(auth, req.params.id);
      if (!target) return res.status(404).json({ error: 'Teacher not found.' });
      const studentId = String(req.body?.studentId || '').trim();
      const title = String(req.body?.title || '').trim();
      if (!studentId || !title) return res.status(400).json({ error: 'studentId and title are required.' });
      const status = String(req.body?.status || 'DRAFT');
      const id = crypto.randomUUID();
      await pool.query(
        `INSERT INTO "StudentReport" (id, "studentId", "authorId", type, title, content, summary, visibility, status, "publishedAt", "createdAt", "updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())`,
        [
          id, studentId, req.params.id,
          String(req.body?.type || 'PROGRESS'),
          title,
          String(req.body?.content || '') || null,
          String(req.body?.summary || '') || null,
          String(req.body?.visibility || 'INTERNAL_STAFF'),
          status,
          status === 'PUBLISHED' ? new Date() : null
        ]
      );
      if (req.body?.rating) {
        await pool.query(`UPDATE "StudentReport" SET rating=$1, "ratingTheme"=$2 WHERE id=$3`, [req.body.rating, req.body.ratingTheme || 'stars', id]);
      }
      const created = await pool.query(
        `SELECT r.*, (s."firstName" || ' ' || s."lastName") AS "studentName", s."imageUrl" AS "studentAvatarUrl", c.name AS "companyName"
         FROM "StudentReport" r JOIN "Student" s ON s.id = r."studentId" LEFT JOIN "Company" c ON c.id = s."companyId"
         WHERE r.id = $1`, [id]
      );
      res.status(201).json(created.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to create report', details: error.message });
    }
  });

  // ---- Update report -------------------------------------------------------
  router.put('/:id/reports/:reportId', async (req, res) => {
    try {
      const auth = await authStaff(req, res);
      if (!auth) return;
      const target = await findInScope(auth, req.params.id);
      if (!target) return res.status(404).json({ error: 'Teacher not found.' });
      const existing = await pool.query('SELECT * FROM "StudentReport" WHERE id=$1 AND "authorId"=$2 LIMIT 1', [req.params.reportId, req.params.id]);
      if (!existing.rows[0]) return res.status(404).json({ error: 'Report not found.' });
      const r = existing.rows[0];
      const status = req.body?.status !== undefined ? String(req.body.status) : r.status;
      const wasPublished = r.status === 'PUBLISHED';
      const nowPublished = status === 'PUBLISHED';
      await pool.query(
        `UPDATE "StudentReport" SET type=$1, title=$2, content=$3, summary=$4, visibility=$5, status=$6, "publishedAt"=$7, "updatedAt"=NOW() WHERE id=$8`,
        [
          req.body?.type ?? r.type, req.body?.title ?? r.title,
          req.body?.content !== undefined ? (String(req.body.content) || null) : r.content,
          req.body?.summary !== undefined ? (String(req.body.summary) || null) : r.summary,
          req.body?.visibility ?? r.visibility, status,
          nowPublished && !wasPublished ? new Date() : r.publishedAt,
          req.params.reportId
        ]
      );
      if (req.body?.rating !== undefined) {
        await pool.query(`UPDATE "StudentReport" SET rating=$1, "ratingTheme"=$2 WHERE id=$3`, [req.body.rating || null, req.body.ratingTheme || 'stars', req.params.reportId]);
      }
      const updated = await pool.query(
        `SELECT r.*, (s."firstName" || ' ' || s."lastName") AS "studentName", s."imageUrl" AS "studentAvatarUrl", c.name AS "companyName"
         FROM "StudentReport" r JOIN "Student" s ON s.id = r."studentId" LEFT JOIN "Company" c ON c.id = s."companyId"
         WHERE r.id = $1`, [req.params.reportId]
      );
      res.json(updated.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update report', details: error.message });
    }
  });

  // ---- Delete report -------------------------------------------------------
  router.delete('/:id/reports/:reportId', async (req, res) => {
    try {
      const auth = await authStaff(req, res);
      if (!auth) return;
      const target = await findInScope(auth, req.params.id);
      if (!target) return res.status(404).json({ error: 'Teacher not found.' });
      await pool.query('DELETE FROM "StudentReportRecipient" WHERE "reportId"=$1', [req.params.reportId]).catch(() => {});
      await pool.query('DELETE FROM "StudentReport" WHERE id=$1 AND "authorId"=$2', [req.params.reportId, req.params.id]);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to delete report', details: error.message });
    }
  });

  // ---- Create conversation with teacher as participant ---------------------
  router.post('/:id/conversations', async (req, res) => {
    try {
      const auth = await authStaff(req, res);
      if (!auth) return;
      const target = await findInScope(auth, req.params.id);
      if (!target) return res.status(404).json({ error: 'Teacher not found.' });
      const studentId = String(req.body?.studentId || '').trim();
      if (!studentId) return res.status(400).json({ error: 'studentId is required.' });
      const subject = String(req.body?.subject || '').trim() || null;
      const convId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO "Conversation" (id, "studentId", subject, status, "createdAt", "updatedAt") VALUES ($1,$2,$3,'OPEN',NOW(),NOW())`,
        [convId, studentId, subject]
      );
      await pool.query(
        `INSERT INTO "ConversationParticipant" (id, "conversationId", "userId", active, "joinedAt") VALUES ($1,$2,$3,true,NOW())
         ON CONFLICT ("conversationId","userId") DO UPDATE SET active = true`,
        [crypto.randomUUID(), convId, req.params.id]
      );
      if (req.body?.firstMessage) {
        const msgId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO "Message" (id, "conversationId", "senderId", body, "createdAt") VALUES ($1,$2,$3,$4,NOW())`,
          [msgId, convId, req.params.id, String(req.body.firstMessage)]
        );
        await pool.query(`UPDATE "Conversation" SET "updatedAt"=NOW() WHERE id=$1`, [convId]);
      }
      const r = await pool.query(
        `SELECT conv.id, conv.subject, conv.status, conv."createdAt",
                s."firstName" AS "studentFirstName", s."lastName" AS "studentLastName"
         FROM "Conversation" conv JOIN "Student" s ON s.id = conv."studentId"
         WHERE conv.id = $1`, [convId]
      );
      res.status(201).json(r.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to create conversation', details: error.message });
    }
  });

  // ---- Get messages of a conversation (teacher view) -----------------------
  router.get('/:id/conversations/:convId/messages', async (req, res) => {
    try {
      const auth = await authStaff(req, res);
      if (!auth) return;
      const target = await findInScope(auth, req.params.id);
      if (!target) return res.status(404).json({ error: 'Teacher not found.' });
      const r = await pool.query(
        `SELECT m.id, m."conversationId", m."senderId", m.body, m."createdAt",
                COALESCE(u."firstName" || ' ' || u."lastName", u.name, u.email) AS "senderName",
                u."imageUrl" AS "senderImageUrl"
         FROM "Message" m
         JOIN "User" u ON u.id = m."senderId"
         WHERE m."conversationId" = $1
         ORDER BY m."createdAt" ASC`,
        [req.params.convId]
      );
      res.json(r.rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch messages', details: error.message });
    }
  });

  // ---- Send message as teacher ---------------------------------------------
  router.post('/:id/conversations/:convId/messages', async (req, res) => {
    try {
      const auth = await authStaff(req, res);
      if (!auth) return;
      const target = await findInScope(auth, req.params.id);
      if (!target) return res.status(404).json({ error: 'Teacher not found.' });
      const body = String(req.body?.body || '').trim();
      if (!body) return res.status(400).json({ error: 'body is required.' });
      const msgId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO "Message" (id, "conversationId", "senderId", body, "createdAt") VALUES ($1,$2,$3,$4,NOW())`,
        [msgId, req.params.convId, req.params.id, body]
      );
      await pool.query(`UPDATE "Conversation" SET "updatedAt"=NOW() WHERE id=$1`, [req.params.convId]);
      const r = await pool.query(
        `SELECT m.id, m."conversationId", m."senderId", m.body, m."createdAt",
                COALESCE(u."firstName" || ' ' || u."lastName", u.name, u.email) AS "senderName",
                u."imageUrl" AS "senderImageUrl"
         FROM "Message" m JOIN "User" u ON u.id = m."senderId" WHERE m.id = $1`, [msgId]
      );
      res.status(201).json(r.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to send message', details: error.message });
    }
  });

  // ---- Create ---------------------------------------------------------------
  router.post('/', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Teachers module is not active.' });
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

      const profesorRoleId = await getProfesorRoleId();
      const id = crypto.randomUUID();
      const name = `${firstName} ${lastName}`.trim();
      await pool.query(
        `INSERT INTO "User" (id, email, name, "firstName", "lastName", password, role, "roleId", "companyId", phone, document, "createdAt", "updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())`,
        [
          id, email, name, firstName, lastName, password, NATACION_ROLES.PROFESOR, profesorRoleId, companyId,
          String(req.body?.phone || '').trim() || null,
          String(req.body?.document || '').trim() || null
        ]
      );
      res.status(201).json(await loadTeacher(id));
    } catch (error: any) {
      if (String(error?.code) === '23505') return res.status(409).json({ error: 'A user with that email already exists.' });
      res.status(500).json({ error: 'Failed to create teacher', details: error.message });
    }
  });

  // ---- Update ---------------------------------------------------------------
  router.put('/:id', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Teachers module is not active.' });
      await ensureColumns();
      const auth = await authStaff(req, res);
      if (!auth) return;

      const target = await findInScope(auth, req.params.id);
      if (!target) return res.status(404).json({ error: 'Teacher not found.' });

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
      res.json(await loadTeacher(req.params.id));
    } catch (error: any) {
      if (String(error?.code) === '23505') return res.status(409).json({ error: 'A user with that email already exists.' });
      res.status(500).json({ error: 'Failed to update teacher', details: error.message });
    }
  });

  // ---- Delete (baja) --------------------------------------------------------
  router.delete('/:id', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Teachers module is not active.' });
      const auth = await authStaff(req, res);
      if (!auth) return;

      const target = await findInScope(auth, req.params.id);
      if (!target) return res.status(404).json({ error: 'Teacher not found.' });

      if (await tableExists('ClassTeacher')) {
        await pool.query('DELETE FROM "ClassTeacher" WHERE "teacherId" = $1', [req.params.id]);
      }
      await pool.query('DELETE FROM "User" WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to delete teacher', details: error.message });
    }
  });

  app.use('/api/teachers', router);
  return { basePath: '/api/teachers' };
}
