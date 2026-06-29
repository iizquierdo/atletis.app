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
  getRequesterUserId,
  putObject,
  type RequesterScope
} from '@sinapsis/module-sdk-server';

const upload = multer({ storage: multer.memoryStorage() });

interface StudentsModuleContext {
  app: express.Express;
  pool: Pool;
}

const MODULE_CODE = 'STUDENTS';
const META_CODES = ['STUDENT_GENDER', 'STUDENT_STATUS', 'REPORT_TYPE', 'REPORT_STATUS', 'REPORT_VISIBILITY'];

export default function registerStudentsModule({ app, pool }: StudentsModuleContext) {
  const router = express.Router();

  // Ensure rating columns exist (idempotent — safe to run every startup)
  void pool.query(`
    ALTER TABLE "StudentReport" ADD COLUMN IF NOT EXISTS "rating" INTEGER CHECK ("rating" >= 1 AND "rating" <= 5);
    ALTER TABLE "StudentReport" ADD COLUMN IF NOT EXISTS "ratingTheme" TEXT DEFAULT 'stars';
    ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
    ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "coverUrl" TEXT;
    ALTER TABLE "StudentTutor" ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'ACTIVE';
  `).catch(() => { /* table may not exist yet during first install */ });

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

  /** Returns the SQL WHERE fragment (+params) limiting students to those the requester may see. */
  const scopedStudentClause = (scope: RequesterScope | null, params: any[]): string => {
    if (!scope) return 'false';
    if (scope.isSuperAdmin) {
      if (!scope.organizationId) return 'true'; // platform-level admin with no company — unrestricted
      params.push(scope.organizationId);
      return `s."companyId" IN (SELECT id FROM "Company" WHERE "organizationId" = $${params.length})`;
    }
    if (scope.isAdminSede) {
      if (!scope.companyScope.length) return 'false';
      params.push(scope.companyScope);
      return `s."companyId" = ANY($${params.length})`;
    }
    if (scope.isProfesor) {
      params.push(scope.userId);
      const teacherParam = `$${params.length}`;
      return `(
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
    }
    if (scope.isTutor) {
      params.push(scope.userId);
      return `EXISTS (SELECT 1 FROM "StudentTutor" st WHERE st."studentId" = s.id AND st."tutorId" = $${params.length} AND st.active)`;
    }
    return 'false';
  };

  const canAccessStudent = async (scope: RequesterScope | null, studentId: string): Promise<boolean> => {
    if (!scope) return false;
    const params: any[] = [studentId];
    const clause = scopedStudentClause(scope, params);
    if (clause === 'true') {
      const r = await pool.query('SELECT 1 FROM "Student" s WHERE s.id = $1 LIMIT 1', [studentId]);
      return Boolean(r.rows[0]);
    }
    if (clause === 'false') return false;
    const r = await pool.query(`SELECT 1 FROM "Student" s WHERE s.id = $1 AND ${clause} LIMIT 1`, params);
    return Boolean(r.rows[0]);
  };

  const loadStudent = async (id: string) => {
    const r = await pool.query(
      `SELECT s.*, c.name AS "companyName",
              creator.name AS "createdByName", updater.name AS "updatedByName"
       FROM "Student" s
       JOIN "Company" c ON c.id = s."companyId"
       JOIN "User" creator ON creator.id = s."createdById"
       JOIN "User" updater ON updater.id = s."updatedById"
       WHERE s.id = $1 LIMIT 1`,
      [id]
    );
    const student = r.rows[0];
    if (!student) return null;
    const [hasClassStudent, hasClass, hasDiscipline, hasSchedule, hasClassTeacher, hasStudentDiscipline, hasStudentTeacher, hasStudentTutor] = await Promise.all([
      tableExists('ClassStudent'), tableExists('Class'), tableExists('Discipline'),
      tableExists('ClassSchedule'), tableExists('ClassTeacher'),
      tableExists('StudentDiscipline'), tableExists('StudentTeacher'), tableExists('StudentTutor'),
    ]);
    const schedulesSubquery = hasSchedule
      ? `(SELECT json_agg(json_build_object('dayOfWeek', s."dayOfWeek", 'startTime', s."startTime", 'endTime', s."endTime") ORDER BY s."dayOfWeek" ASC, s."startTime" ASC)
          FROM "ClassSchedule" s WHERE s."classId" = cl.id)`
      : `'[]'::json`;
    const classTeachersSubquery = hasClassTeacher
      ? `(SELECT COALESCE(json_agg(json_build_object('id', u.id, 'name', u.name, 'avatar', COALESCE(u."imageUrl", u.avatar)) ORDER BY u.name ASC), '[]'::json)
          FROM "ClassTeacher" ct JOIN "User" u ON u.id = ct."teacherId"
          WHERE ct."classId" = cl.id AND ct.active)`
      : `'[]'::json`;
    const [disc, teachers, tutors, classes] = await Promise.all([
      hasStudentDiscipline
        ? pool.query('SELECT * FROM "StudentDiscipline" WHERE "studentId" = $1', [id])
        : Promise.resolve({ rows: [] }),
      hasStudentTeacher
        ? pool.query(
            `SELECT st.*, u.name AS "teacherName", u.email AS "teacherEmail",
                    COALESCE(u."imageUrl", u.avatar) AS "teacherAvatar"
             FROM "StudentTeacher" st JOIN "User" u ON u.id = st."teacherId"
             WHERE st."studentId" = $1 AND st.active = true`,
            [id]
          )
        : Promise.resolve({ rows: [] }),
      hasStudentTutor
        ? pool.query('SELECT st.*, u.name AS "tutorName", u.email AS "tutorEmail" FROM "StudentTutor" st JOIN "User" u ON u.id = st."tutorId" WHERE st."studentId" = $1 ORDER BY st.active DESC, st."assignedAt" ASC', [id])
        : Promise.resolve({ rows: [] }),
      hasClassStudent && hasClass
        ? pool.query(
            `SELECT cs.id, cs."classId", cs."levelId", cs.status,
                    cl.name, cl.description AS "classDescription",
                    cl."imageUrl" AS "classImageUrl", cl."coverUrl" AS "classCoverUrl",
                    cl."disciplineId", cl.status AS "classStatus",
                    ${hasDiscipline ? 'd.name AS "disciplineName", d."imageUrl" AS "disciplineImageUrl", d."coverUrl" AS "disciplineCoverUrl"' : 'NULL AS "disciplineName", NULL AS "disciplineImageUrl", NULL AS "disciplineCoverUrl"'},
                    lvl.name AS "levelName", lvl.description AS "levelDescription", lvl."levelOrder" AS "levelOrder",
                    COALESCE(${schedulesSubquery}, '[]'::json) AS schedules,
                    COALESCE(${classTeachersSubquery}, '[]'::json) AS teachers
             FROM "ClassStudent" cs
             JOIN "Class" cl ON cl.id = cs."classId"
             ${hasDiscipline ? 'LEFT JOIN "Discipline" d ON d.id = cl."disciplineId"' : ''}
             LEFT JOIN "ClassLevel" lvl ON lvl.id = cs."levelId"
             WHERE cs."studentId" = $1
             ORDER BY cl.name ASC`,
            [id]
          )
        : Promise.resolve({ rows: [] })
    ]);
    student.disciplines = disc.rows;
    student.teachers = teachers.rows;
    student.tutors = tutors.rows;
    student.classes = classes.rows;
    return student;
  };

  const syncRelations = async (studentId: string, body: any) => {
    if (Array.isArray(body?.disciplineAssignments) && await tableExists('StudentDiscipline')) {
      await pool.query('DELETE FROM "StudentDiscipline" WHERE "studentId" = $1', [studentId]);
      for (const d of body.disciplineAssignments) {
        const disciplineId = String(d?.disciplineId || '').trim();
        if (!disciplineId) continue;
        await pool.query(
          `INSERT INTO "StudentDiscipline" (id, "studentId", "disciplineId", "levelId", status, "startDate", "endDate", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
           ON CONFLICT ("studentId", "disciplineId") DO UPDATE SET "levelId" = EXCLUDED."levelId", status = EXCLUDED.status, "updatedAt" = NOW()`,
          [crypto.randomUUID(), studentId, disciplineId, String(d?.levelId || '').trim() || null, String(d?.status || 'ACTIVE'), d?.startDate ? new Date(d.startDate) : null, d?.endDate ? new Date(d.endDate) : null]
        );
      }
    }
    if (Array.isArray(body?.teacherIds) && await tableExists('StudentTeacher')) {
      await pool.query('DELETE FROM "StudentTeacher" WHERE "studentId" = $1', [studentId]);
      for (const tid of body.teacherIds) {
        const teacherId = String(tid || '').trim();
        if (!teacherId) continue;
        await pool.query('INSERT INTO "StudentTeacher" (id, "studentId", "teacherId", active, "assignedAt") VALUES ($1, $2, $3, true, NOW()) ON CONFLICT ("studentId", "teacherId") DO UPDATE SET active = true', [crypto.randomUUID(), studentId, teacherId]);
      }
    }
    if (Array.isArray(body?.tutorIds) && await tableExists('StudentTutor')) {
      await pool.query('DELETE FROM "StudentTutor" WHERE "studentId" = $1', [studentId]);
      for (const tid of body.tutorIds) {
        const tutorId = String(tid || '').trim();
        if (!tutorId) continue;
        await pool.query('INSERT INTO "StudentTutor" (id, "studentId", "tutorId", active, "assignedAt") VALUES ($1, $2, $3, true, NOW()) ON CONFLICT ("studentId", "tutorId") DO UPDATE SET active = true', [crypto.randomUUID(), studentId, tutorId]);
      }
    }
  };

  const ensureStudentReferenceRow = async (companyId: string) => {
    const existing = await pool.query(
      `SELECT id FROM "Reference" WHERE "companyId" = $1 AND module = 'STUDENTS' AND COALESCE(code, '') = 'STUDENTS' LIMIT 1`,
      [companyId]
    );
    if (existing.rows[0]) return;
    // Try to clone from core template (companyId IS NULL)
    const template = await pool.query(
      `SELECT prefix, sufix, digits, clone FROM "Reference" WHERE "companyId" IS NULL AND module = 'STUDENTS' AND COALESCE(code, '') = 'STUDENTS' LIMIT 1`
    );
    if (template.rows[0]) {
      const t = template.rows[0];
      await pool.query(
        `INSERT INTO "Reference" (id, "companyId", module, code, reference, prefix, sufix, digits, clone, "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), $1, 'STUDENTS', 'STUDENTS', 0, $2, $3, $4, $5, NOW(), NOW())
         ON CONFLICT DO NOTHING`,
        [companyId, t.prefix, t.sufix, t.digits, t.clone]
      );
    } else {
      // No core template exists either — create both
      await pool.query(
        `INSERT INTO "Reference" (id, "companyId", module, code, reference, prefix, sufix, digits, clone, "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), NULL, 'STUDENTS', 'STUDENTS', 0, NULL, NULL, 4, 0, NOW(), NOW())
         ON CONFLICT DO NOTHING`
      );
      await pool.query(
        `INSERT INTO "Reference" (id, "companyId", module, code, reference, prefix, sufix, digits, clone, "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), $1, 'STUDENTS', 'STUDENTS', 0, NULL, NULL, 4, 0, NOW(), NOW())
         ON CONFLICT DO NOTHING`,
        [companyId]
      );
    }
  };

  const isParticipant = async (conversationId: string, userId: string) => {
    const r = await pool.query('SELECT 1 FROM "ConversationParticipant" WHERE "conversationId" = $1 AND "userId" = $2 AND active LIMIT 1', [conversationId, userId]);
    return Boolean(r.rows[0]);
  };

  // ---- Docs -----------------------------------------------------------------
  router.get('/openapi.json', (req, res) => {
    const serverUrl = `${req.protocol}://${req.get('host')}`;
    res.json({
      openapi: '3.0.3',
      info: { title: 'Sinapsis Students API', version: '1.0.0', description: 'Students, enrollment, reports and messaging.' },
      servers: [{ url: serverUrl }],
      paths: {
        '/api/students': { get: { summary: 'List students' }, post: { summary: 'Create student' } },
        '/api/students/{id}': { get: { summary: 'Get student' }, put: { summary: 'Update student' } },
        '/api/students/{id}/reports': { get: {}, post: {} },
        '/api/students/{id}/conversations': { get: {}, post: {} }
      }
    });
  });

  router.get('/docs', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html><html><head><meta charset="utf-8"/><title>Sinapsis Students API</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"/></head><body><div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>window.ui=SwaggerUIBundle({url:'/api/students/openapi.json',dom_id:'#swagger-ui',deepLinking:true});</script></body></html>`);
  });

  // ---- Meta -----------------------------------------------------------------
  router.get('/meta', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Students module is not active.' });
      const uid = requesterId(req);
      const ctx = uid ? await resolveTenantAuthContext(pool, uid) : null;
      const organizationId = ctx?.organizationId || '';

      const catMap = await fetchMergedItemsByCategoryCodes(pool, { codes: META_CODES, organizationId, companyIdContext: null, activeOnly: true });

      // Staff users available as teachers/tutors — scoped to the requester's organization.
      const scope = uid ? await resolveRequesterScope(pool, uid) : null;
      const staffOrgId = scope?.organizationId || null;
      const staff = staffOrgId
        ? await pool.query(
            `SELECT u.id, u.name, u.email, COALESCE(r.name, u.role) AS "roleName", u."companyId"
             FROM "User" u
             LEFT JOIN "Role" r ON r.id = u."roleId"
             JOIN "Company" c ON c.id = u."companyId"
             WHERE c."organizationId" = $1
             ORDER BY u.name ASC`,
            [staffOrgId]
          )
        : await pool.query(
            `SELECT u.id, u.name, u.email, COALESCE(r.name, u.role) AS "roleName", u."companyId"
             FROM "User" u LEFT JOIN "Role" r ON r.id = u."roleId"
             ORDER BY u.name ASC`
          );

      // Disciplines (+levels) only if that module is installed.
      let disciplines: any[] = [];
      if (await tableExists('Discipline')) {
        const d = await pool.query(
          'SELECT id, name, "imageUrl", "coverUrl" FROM "Discipline" WHERE active = true ORDER BY name ASC'
        );
        const levels = (await tableExists('DisciplineLevel'))
          ? (await pool.query(
              'SELECT id, "disciplineId", name, description, "levelOrder" FROM "DisciplineLevel" WHERE active = true ORDER BY "levelOrder" ASC'
            )).rows
          : [];
        disciplines = d.rows.map((disc: any) => ({ ...disc, levels: levels.filter((l: any) => l.disciplineId === disc.id) }));
      }

      res.json({
        categories: {
          genders: catMap.get('STUDENT_GENDER') || [],
          statuses: catMap.get('STUDENT_STATUS') || [],
          reportTypes: catMap.get('REPORT_TYPE') || [],
          reportStatuses: catMap.get('REPORT_STATUS') || [],
          reportVisibilities: catMap.get('REPORT_VISIBILITY') || []
        },
        staff: staff.rows,
        disciplines
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to load students metadata', details: error.message });
    }
  });

  // ---- Students collection --------------------------------------------------
  router.get('/', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Students module is not active.' });
      const scope = await scopeOf(req);
      const params: any[] = [];
      const where: string[] = [scopedStudentClause(scope, params)];

      const search = String(req.query.search || '').trim();
      const status = String(req.query.status || '').trim();
      const companyId = String(req.query.companyId || '').trim();
      if (search) {
        params.push(`%${search}%`);
        where.push(`(LOWER(s."firstName" || ' ' || s."lastName") LIKE LOWER($${params.length}) OR LOWER(COALESCE(s.document,'')) LIKE LOWER($${params.length}) OR LOWER(s.code) LIKE LOWER($${params.length}))`);
      }
      if (status) { params.push(status); where.push(`s.status = $${params.length}`); }
      if (companyId && scope?.isSuperAdmin) { params.push(companyId); where.push(`s."companyId" = $${params.length}`); }

      const hasClassTable = await tableExists('Class');
      const classesSubquery = hasClassTable
        ? `COALESCE((SELECT json_agg(cl.name ORDER BY cl.name) FROM "ClassStudent" cs JOIN "Class" cl ON cl.id = cs."classId" WHERE cs."studentId" = s.id AND cs.status = 'ACTIVE'), '[]'::json)`
        : `'[]'::json`;
      const result = await pool.query(
        `SELECT s.id, s.code, s."firstName", s."lastName", s.document, s.status, s."companyId", s."imageUrl",
                c.name AS "companyName",
                ${classesSubquery} AS "classNames"
         FROM "Student" s JOIN "Company" c ON c.id = s."companyId"
         WHERE ${where.join(' AND ')}
         ORDER BY s."lastName" ASC, s."firstName" ASC`,
        params
      );
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch students', details: error.message });
    }
  });

  router.post('/', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Students module is not active.' });
      const scope = await scopeOf(req);
      if (!scope?.isStaff) return res.status(403).json({ error: 'Only staff can create students.' });

      const firstName = String(req.body?.firstName || '').trim();
      const lastName = String(req.body?.lastName || '').trim();
      const companyId = String(req.body?.companyId || '').trim() || scope.primaryCompanyId || '';
      const userId = scope.userId;
      if (!firstName || !lastName) return res.status(400).json({ error: 'firstName and lastName are required.' });
      if (!companyId) return res.status(400).json({ error: 'companyId (sede) is required.' });
      if (scope.isAdminSede && !scope.companyScope.includes(companyId)) return res.status(403).json({ error: 'Company out of scope.' });

      const id = crypto.randomUUID();
      await ensureStudentReferenceRow(companyId);
      const code = await reserveNextReference(pool, { companyId, module: 'STUDENTS', code: 'STUDENTS' });
      await pool.query(
        `INSERT INTO "Student" (id, code, "firstName", "lastName", document, "birthDate", gender, email, phone, address,
            "medicalNotes", "emergencyContactName", "emergencyContactPhone", "emergencyContactEmail",
            "guardianName", "guardianPhone", "guardianEmail", notes, status, "joinDate", "companyId", "createdById", "updatedById", "createdAt", "updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$22,NOW(),NOW())`,
        [
          id, code, firstName, lastName,
          String(req.body?.document || '').trim() || null,
          req.body?.birthDate ? new Date(req.body.birthDate) : null,
          String(req.body?.gender || '').trim() || null,
          String(req.body?.email || '').trim() || null,
          String(req.body?.phone || '').trim() || null,
          String(req.body?.address || '').trim() || null,
          String(req.body?.medicalNotes || '').trim() || null,
          String(req.body?.emergencyContactName || '').trim() || null,
          String(req.body?.emergencyContactPhone || '').trim() || null,
          String(req.body?.emergencyContactEmail || '').trim() || null,
          String(req.body?.guardianName || '').trim() || null,
          String(req.body?.guardianPhone || '').trim() || null,
          String(req.body?.guardianEmail || '').trim() || null,
          String(req.body?.notes || '').trim() || null,
          String(req.body?.status || 'ACTIVE').trim() || 'ACTIVE',
          req.body?.joinDate ? new Date(req.body.joinDate) : null,
          companyId, userId
        ]
      );
      await syncRelations(id, req.body);
      res.status(201).json(await loadStudent(id));
    } catch (error: any) {
      if (String(error?.code) === '23505') return res.status(409).json({ error: 'A student with that document already exists.' });
      res.status(500).json({ error: 'Failed to create student', details: error.message });
    }
  });

  // ---- Conversations (literal paths before /:id) ----------------------------
  router.get('/conversations/:conversationId', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Students module is not active.' });
      const scope = await scopeOf(req);
      const conversationId = req.params.conversationId;
      const conv = await pool.query('SELECT * FROM "Conversation" WHERE id = $1 LIMIT 1', [conversationId]);
      if (!conv.rows[0]) return res.status(404).json({ error: 'Conversation not found' });
      if (!scope?.isStaff && !(await isParticipant(conversationId, scope?.userId || ''))) return res.status(403).json({ error: 'Not a participant.' });

      const messages = await pool.query(
        `SELECT m.*, u.name AS "senderName",
                COALESCE((SELECT json_agg(json_build_object('userId', mr."userId", 'readAt', mr."readAt")) FROM "MessageRead" mr WHERE mr."messageId" = m.id), '[]') AS reads
         FROM "Message" m JOIN "User" u ON u.id = m."senderId"
         WHERE m."conversationId" = $1 ORDER BY m."createdAt" ASC`,
        [conversationId]
      );
      const participants = await pool.query('SELECT cp.*, u.name AS "userName" FROM "ConversationParticipant" cp JOIN "User" u ON u.id = cp."userId" WHERE cp."conversationId" = $1', [conversationId]);
      res.json({ ...conv.rows[0], messages: messages.rows, participants: participants.rows });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch conversation', details: error.message });
    }
  });

  router.post('/conversations/:conversationId/messages', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Students module is not active.' });
      const scope = await scopeOf(req);
      const conversationId = req.params.conversationId;
      const body = String(req.body?.body || '').trim();
      if (!body) return res.status(400).json({ error: 'body is required.' });
      const conv = await pool.query('SELECT id FROM "Conversation" WHERE id = $1 LIMIT 1', [conversationId]);
      if (!conv.rows[0]) return res.status(404).json({ error: 'Conversation not found' });
      if (!scope?.isStaff && !(await isParticipant(conversationId, scope?.userId || ''))) return res.status(403).json({ error: 'Not a participant.' });

      const id = crypto.randomUUID();
      await pool.query('INSERT INTO "Message" (id, "conversationId", "senderId", body, "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,NOW(),NOW())', [id, conversationId, scope!.userId, body]);
      await pool.query('UPDATE "Conversation" SET "updatedAt" = NOW() WHERE id = $1', [conversationId]);
      const created = await pool.query('SELECT m.*, u.name AS "senderName" FROM "Message" m JOIN "User" u ON u.id = m."senderId" WHERE m.id = $1', [id]);
      res.status(201).json(created.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to send message', details: error.message });
    }
  });

  router.patch('/conversations/:conversationId/messages/:messageId/read', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Students module is not active.' });
      const scope = await scopeOf(req);
      const { conversationId, messageId } = req.params;
      if (!scope?.userId) return res.status(401).json({ error: 'Auth required.' });
      await pool.query('INSERT INTO "MessageRead" (id, "messageId", "userId", "readAt") VALUES ($1,$2,$3,NOW()) ON CONFLICT ("messageId","userId") DO UPDATE SET "readAt" = NOW()', [crypto.randomUUID(), messageId, scope.userId]);
      await pool.query('UPDATE "ConversationParticipant" SET "lastReadAt" = NOW() WHERE "conversationId" = $1 AND "userId" = $2', [conversationId, scope.userId]);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to mark read', details: error.message });
    }
  });

  // ---- Student reports ------------------------------------------------------
  router.get('/:id/reports', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Students module is not active.' });
      const scope = await scopeOf(req);
      const studentId = req.params.id;
      if (!(await canAccessStudent(scope, studentId))) return res.status(403).json({ error: 'Student out of scope.' });

      const params: any[] = [studentId];
      let extra = '';
      if (scope && scope.isTutor && !scope.isStaff && !scope.isProfesor) {
        extra = `AND r.status = 'PUBLISHED' AND r.visibility = 'TUTORS_ONLY'`;
      }
      const reports = await pool.query(
        `SELECT r.*, a.name AS "authorName", COALESCE(a."imageUrl", a.avatar) AS "authorAvatarUrl" FROM "StudentReport" r JOIN "User" a ON a.id = r."authorId"
         WHERE r."studentId" = $1 ${extra} ORDER BY r."createdAt" DESC`,
        params
      );
      res.json(reports.rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch reports', details: error.message });
    }
  });

  router.post('/:id/reports', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Students module is not active.' });
      const scope = await scopeOf(req);
      const studentId = req.params.id;
      if (!scope || (!scope.isStaff && !scope.isProfesor)) return res.status(403).json({ error: 'Only staff or teachers can create reports.' });
      if (!(await canAccessStudent(scope, studentId))) return res.status(403).json({ error: 'Student out of scope.' });
      const title = String(req.body?.title || '').trim();
      if (!title) return res.status(400).json({ error: 'title is required.' });

      const id = crypto.randomUUID();
      const status = String(req.body?.status || 'DRAFT').trim();
      // Base insert — always safe
      await pool.query(
        `INSERT INTO "StudentReport" (id, "studentId", "authorId", type, title, content, summary, "levelChangeId", visibility, status, "publishedAt", "createdAt", "updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())`,
        [
          id, studentId, scope.userId,
          String(req.body?.type || 'PROGRESS').trim(),
          title,
          String(req.body?.content || '').trim() || null,
          String(req.body?.summary || '').trim() || null,
          String(req.body?.levelChangeId || '').trim() || null,
          String(req.body?.visibility || 'INTERNAL_STAFF').trim(),
          status,
          status === 'PUBLISHED' ? new Date() : (req.body?.publishedAt ? new Date(req.body.publishedAt) : null)
        ]
      );
      // Rating — silently skipped if columns don't exist yet
      if (req.body?.rating) {
        const rating = Math.min(5, Math.max(1, parseInt(req.body.rating, 10)));
        const ratingTheme = req.body?.ratingTheme ? String(req.body.ratingTheme).trim() : 'stars';
        await pool.query(
          `UPDATE "StudentReport" SET rating=$1, "ratingTheme"=$2 WHERE id=$3`,
          [rating, ratingTheme, id]
        ).catch(() => { /* columns not yet migrated — ignored */ });
      }
      if (Array.isArray(req.body?.recipientIds)) {
        for (const rid of req.body.recipientIds) {
          const uid = String(rid || '').trim();
          if (!uid) continue;
          await pool.query('INSERT INTO "StudentReportRecipient" (id, "reportId", "userId", "createdAt") VALUES ($1,$2,$3,NOW()) ON CONFLICT ("reportId","userId") DO NOTHING', [crypto.randomUUID(), id, uid]);
        }
      }
      const created = await pool.query('SELECT r.*, a.name AS "authorName", COALESCE(a."imageUrl", a.avatar) AS "authorAvatarUrl" FROM "StudentReport" r JOIN "User" a ON a.id = r."authorId" WHERE r.id = $1', [id]);
      res.status(201).json(created.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to create report', details: error.message });
    }
  });

  router.put('/:id/reports/:reportId', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Students module is not active.' });
      const scope = await scopeOf(req);
      const { id: studentId, reportId } = req.params;
      const existing = await pool.query('SELECT * FROM "StudentReport" WHERE id = $1 AND "studentId" = $2 LIMIT 1', [reportId, studentId]);
      const rep = existing.rows[0];
      if (!rep) return res.status(404).json({ error: 'Report not found' });
      if (!scope || (!scope.isStaff && rep.authorId !== scope.userId)) return res.status(403).json({ error: 'Cannot edit this report.' });

      const status = req.body?.status !== undefined ? String(req.body.status).trim() : rep.status;
      // Main update — always safe (no optional columns)
      await pool.query(
        `UPDATE "StudentReport" SET type=$1, title=$2, content=$3, summary=$4, "levelChangeId"=$5, visibility=$6, status=$7,
            "publishedAt"=$8, "updatedAt"=NOW() WHERE id=$9`,
        [
          String(req.body?.type ?? rep.type).trim(),
          String(req.body?.title ?? rep.title).trim() || rep.title,
          req.body?.content !== undefined ? (String(req.body.content).trim() || null) : rep.content,
          req.body?.summary !== undefined ? (String(req.body.summary).trim() || null) : rep.summary,
          req.body?.levelChangeId !== undefined ? (String(req.body.levelChangeId).trim() || null) : rep.levelChangeId,
          String(req.body?.visibility ?? rep.visibility).trim(),
          status,
          status === 'PUBLISHED' && !rep.publishedAt ? new Date() : rep.publishedAt,
          reportId
        ]
      );
      // Rating update — only available after migration; silently skipped if columns don't exist yet
      if (req.body?.rating !== undefined || req.body?.ratingTheme !== undefined) {
        const rating = req.body.rating ? Math.min(5, Math.max(1, parseInt(req.body.rating, 10))) : null;
        const ratingTheme = req.body.ratingTheme ? String(req.body.ratingTheme).trim() : 'stars';
        await pool.query(
          `UPDATE "StudentReport" SET rating=$1, "ratingTheme"=$2 WHERE id=$3`,
          [rating, ratingTheme, reportId]
        ).catch(() => { /* columns not yet migrated — ignored */ });
      }
      const updated = await pool.query('SELECT r.*, a.name AS "authorName", COALESCE(a."imageUrl", a.avatar) AS "authorAvatarUrl" FROM "StudentReport" r JOIN "User" a ON a.id = r."authorId" WHERE r.id = $1', [reportId]);
      res.json(updated.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update report', details: error.message });
    }
  });

  router.patch('/:id/reports/:reportId/status', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Students module is not active.' });
      const scope = await scopeOf(req);
      const { id: studentId, reportId } = req.params;
      const existing = await pool.query('SELECT * FROM "StudentReport" WHERE id = $1 AND "studentId" = $2 LIMIT 1', [reportId, studentId]);
      const rep = existing.rows[0];
      if (!rep) return res.status(404).json({ error: 'Report not found' });
      if (!scope || (!scope.isStaff && rep.authorId !== scope.userId)) return res.status(403).json({ error: 'Cannot edit this report.' });
      const status = String(req.body?.status || '').trim();
      if (!status) return res.status(400).json({ error: 'status is required.' });
      await pool.query('UPDATE "StudentReport" SET status=$1, "publishedAt"=$2, "updatedAt"=NOW() WHERE id=$3', [status, status === 'PUBLISHED' && !rep.publishedAt ? new Date() : rep.publishedAt, reportId]);
      const updated = await pool.query('SELECT * FROM "StudentReport" WHERE id = $1', [reportId]);
      res.json(updated.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update report status', details: error.message });
    }
  });

  router.delete('/:id/reports/:reportId', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Students module is not active.' });
      const scope = await scopeOf(req);
      const { id: studentId, reportId } = req.params;
      const existing = await pool.query('SELECT * FROM "StudentReport" WHERE id = $1 AND "studentId" = $2 LIMIT 1', [reportId, studentId]);
      const rep = existing.rows[0];
      if (!rep) return res.status(404).json({ error: 'Report not found' });
      if (!scope || (!scope.isStaff && rep.authorId !== scope.userId)) return res.status(403).json({ error: 'Cannot delete this report.' });
      await pool.query('DELETE FROM "StudentReportRecipient" WHERE "reportId" = $1', [reportId]);
      await pool.query('DELETE FROM "StudentReport" WHERE id = $1', [reportId]);
      res.status(204).end();
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to delete report', details: error.message });
    }
  });

  // ---- Student conversations ------------------------------------------------
  router.get('/:id/conversations', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Students module is not active.' });
      const scope = await scopeOf(req);
      const studentId = req.params.id;
      if (!(await canAccessStudent(scope, studentId))) return res.status(403).json({ error: 'Student out of scope.' });

      const params: any[] = [studentId];
      let participantClause = '';
      if (scope && !scope.isStaff) {
        params.push(scope.userId);
        participantClause = `AND EXISTS (SELECT 1 FROM "ConversationParticipant" cp WHERE cp."conversationId" = cv.id AND cp."userId" = $${params.length} AND cp.active)`;
      }
      const result = await pool.query(
        `SELECT cv.*, creator.name AS "createdByName",
                (SELECT COUNT(*)::int FROM "Message" m WHERE m."conversationId" = cv.id) AS "messageCount"
         FROM "Conversation" cv JOIN "User" creator ON creator.id = cv."createdById"
         WHERE cv."studentId" = $1 ${participantClause} ORDER BY cv."updatedAt" DESC`,
        params
      );
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch conversations', details: error.message });
    }
  });

  router.post('/:id/conversations', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Students module is not active.' });
      const scope = await scopeOf(req);
      const studentId = req.params.id;
      if (!(await canAccessStudent(scope, studentId))) return res.status(403).json({ error: 'Student out of scope.' });

      const id = crypto.randomUUID();
      await pool.query('INSERT INTO "Conversation" (id, "studentId", subject, status, "createdById", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,NOW(),NOW())', [
        id, studentId, String(req.body?.subject || '').trim() || null, String(req.body?.status || 'OPEN').trim(), scope!.userId
      ]);
      // creator + requested participants
      const participantIds = new Set<string>([scope!.userId, ...((Array.isArray(req.body?.participantIds) ? req.body.participantIds : []).map((x: any) => String(x || '').trim()).filter(Boolean))]);
      for (const uid of participantIds) {
        await pool.query('INSERT INTO "ConversationParticipant" (id, "conversationId", "userId", active, "joinedAt") VALUES ($1,$2,$3,true,NOW()) ON CONFLICT ("conversationId","userId") DO NOTHING', [crypto.randomUUID(), id, uid]);
      }
      const firstMessage = String(req.body?.firstMessage?.body || req.body?.firstMessage || '').trim();
      if (firstMessage) {
        await pool.query('INSERT INTO "Message" (id, "conversationId", "senderId", body, "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,NOW(),NOW())', [crypto.randomUUID(), id, scope!.userId, firstMessage]);
      }
      const created = await pool.query('SELECT * FROM "Conversation" WHERE id = $1', [id]);
      res.status(201).json(created.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to create conversation', details: error.message });
    }
  });

  // ---- Student attendance (weekly summary for tutors) -----------------------
  router.get('/:id/attendance', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Students module is not active.' });
      const scope = await scopeOf(req);
      const studentId = req.params.id;
      if (!(await canAccessStudent(scope, studentId))) return res.status(403).json({ error: 'Student out of scope.' });
      if (!(await tableExists('ClassAttendance'))) return res.json([]);

      const from = String(req.query.from || '').trim();
      const to = String(req.query.to || '').trim();
      const params: any[] = [studentId];
      let dateFilter = '';
      if (from) { params.push(from); dateFilter += ` AND a."date" >= $${params.length}`; }
      if (to) { params.push(to); dateFilter += ` AND a."date" <= $${params.length}`; }

      const result = await pool.query(
        `SELECT a."classId", to_char(a."date", 'YYYY-MM-DD') AS "date", a."present"
         FROM "ClassAttendance" a
         WHERE a."studentId" = $1${dateFilter}
         ORDER BY a."date" ASC`,
        params
      );
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch attendance', details: error.message });
    }
  });

  // ---- Student disciplines (ABM from the student record) --------------------
  router.post('/:id/disciplines', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Students module is not active.' });
      const scope = await scopeOf(req);
      if (!scope?.isStaff) return res.status(403).json({ error: 'Only staff can manage disciplines.' });
      const studentId = req.params.id;
      if (!(await canAccessStudent(scope, studentId))) return res.status(403).json({ error: 'Student out of scope.' });
      const disciplineId = String(req.body?.disciplineId || '').trim();
      if (!disciplineId) return res.status(400).json({ error: 'disciplineId is required.' });
      await pool.query(
        `INSERT INTO "StudentDiscipline" (id, "studentId", "disciplineId", "levelId", status, "startDate", "endDate", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         ON CONFLICT ("studentId", "disciplineId") DO UPDATE SET "levelId" = EXCLUDED."levelId", status = EXCLUDED.status, "updatedAt" = NOW()`,
        [crypto.randomUUID(), studentId, disciplineId, String(req.body?.levelId || '').trim() || null, String(req.body?.status || 'ACTIVE').trim() || 'ACTIVE', req.body?.startDate ? new Date(req.body.startDate) : null, req.body?.endDate ? new Date(req.body.endDate) : null]
      );
      res.status(201).json(await loadStudent(studentId));
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to add discipline', details: error.message });
    }
  });

  router.put('/:id/disciplines/:disciplineId', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Students module is not active.' });
      const scope = await scopeOf(req);
      if (!scope?.isStaff) return res.status(403).json({ error: 'Only staff can manage disciplines.' });
      const { id: studentId, disciplineId } = req.params;
      if (!(await canAccessStudent(scope, studentId))) return res.status(403).json({ error: 'Student out of scope.' });
      const r = await pool.query(
        `UPDATE "StudentDiscipline" SET "levelId" = $1, status = $2, "updatedAt" = NOW() WHERE "studentId" = $3 AND "disciplineId" = $4`,
        [String(req.body?.levelId || '').trim() || null, String(req.body?.status || 'ACTIVE').trim() || 'ACTIVE', studentId, disciplineId]
      );
      if (!r.rowCount) return res.status(404).json({ error: 'Enrollment not found.' });
      res.json(await loadStudent(studentId));
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update discipline', details: error.message });
    }
  });

  router.delete('/:id/disciplines/:disciplineId', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Students module is not active.' });
      const scope = await scopeOf(req);
      if (!scope?.isStaff) return res.status(403).json({ error: 'Only staff can manage disciplines.' });
      const { id: studentId, disciplineId } = req.params;
      if (!(await canAccessStudent(scope, studentId))) return res.status(403).json({ error: 'Student out of scope.' });
      await pool.query('DELETE FROM "StudentDiscipline" WHERE "studentId" = $1 AND "disciplineId" = $2', [studentId, disciplineId]);
      res.json(await loadStudent(studentId));
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to remove discipline', details: error.message });
    }
  });

  // ---- Student tutors / padres (ABM from the student record) ----------------
  router.post('/:id/tutors', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Students module is not active.' });
      const scope = await scopeOf(req);
      if (!scope?.isStaff) return res.status(403).json({ error: 'Only staff can manage parents.' });
      const studentId = req.params.id;
      if (!(await canAccessStudent(scope, studentId))) return res.status(403).json({ error: 'Student out of scope.' });
      const tutorId = String(req.body?.tutorId || '').trim();
      if (!tutorId) return res.status(400).json({ error: 'tutorId is required.' });
      const exists = await pool.query('SELECT 1 FROM "User" WHERE id = $1 LIMIT 1', [tutorId]);
      if (!exists.rows[0]) return res.status(404).json({ error: 'Parent not found.' });
      await pool.query(
        'INSERT INTO "StudentTutor" (id, "studentId", "tutorId", active, "assignedAt") VALUES ($1, $2, $3, true, NOW()) ON CONFLICT ("studentId", "tutorId") DO UPDATE SET active = true',
        [crypto.randomUUID(), studentId, tutorId]
      );
      res.status(201).json(await loadStudent(studentId));
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to add parent', details: error.message });
    }
  });

  router.delete('/:id/tutors/:tutorId', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Students module is not active.' });
      const scope = await scopeOf(req);
      if (!scope?.isStaff) return res.status(403).json({ error: 'Only staff can manage parents.' });
      const { id: studentId, tutorId } = req.params;
      if (!(await canAccessStudent(scope, studentId))) return res.status(403).json({ error: 'Student out of scope.' });
      await pool.query('DELETE FROM "StudentTutor" WHERE "studentId" = $1 AND "tutorId" = $2', [studentId, tutorId]);
      res.json(await loadStudent(studentId));
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to remove parent', details: error.message });
    }
  });

  // ---- Image upload (avatar / cover) ----------------------------------------
  router.post('/:id/image', upload.single('file'), async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Students module is not active.' });
      const scope = await scopeOf(req);
      if (!scope?.isStaff) return res.status(403).json({ error: 'Only staff can upload student images.' });
      const studentId = req.params.id;
      if (!(await canAccessStudent(scope, studentId))) return res.status(403).json({ error: 'Student out of scope.' });
      const file = req.file;
      if (!file) return res.status(400).json({ error: 'file is required.' });

      const kind = String(req.body?.kind || 'logo').trim() === 'cover' ? 'cover' : 'logo';
      const column = kind === 'cover' ? 'coverUrl' : 'imageUrl';

      const orgResult = await pool.query('SELECT * FROM "Organization" LIMIT 1');
      const org = orgResult.rows[0] || { name: 'org', id: '1' };
      const ext = path.extname(file.originalname || '').toLowerCase();
      const filename = `${kind}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}${ext}`;
      const orgFolderName = org.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '_' + String(org.id).split('-')[0];
      const objectKey = `${orgFolderName}/students/${studentId}/${filename}`;
      const { url: fileUrl } = await putObject({ pool, key: objectKey, buffer: file.buffer, contentType: file.mimetype });

      await pool.query(`UPDATE "Student" SET "${column}" = $1, "updatedAt" = NOW() WHERE id = $2`, [fileUrl, studentId]);
      res.json(await loadStudent(studentId));
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to upload image', details: error.message });
    }
  });

  // ---- Lookup by DNI (literal path — must be before /:id) ------------------
  router.get('/lookup', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Students module is not active.' });
      const scope = await scopeOf(req);
      if (!scope?.userId) return res.status(401).json({ error: 'Auth required.' });

      const dni = String(req.query.dni || '').trim();
      if (!dni) return res.status(400).json({ error: 'dni query param is required.' });

      const hasDisciplineTable = await tableExists('Discipline');
      const disciplinesSubquery = hasDisciplineTable
        ? `COALESCE((SELECT json_agg(d.name ORDER BY d.name) FROM "StudentDiscipline" sd JOIN "Discipline" d ON d.id = sd."disciplineId" WHERE sd."studentId" = s.id AND sd.status = 'ACTIVE'), '[]'::json)`
        : `'[]'::json`;

      const result = await pool.query(
        `SELECT s.id, s.code, s."firstName", s."lastName", s.document, s.status, s."companyId", s."imageUrl",
                c.name AS "companyName",
                ${disciplinesSubquery} AS "disciplineNames"
         FROM "Student" s JOIN "Company" c ON c.id = s."companyId"
         WHERE LOWER(COALESCE(s.document,'')) = LOWER($1)
         LIMIT 1`,
        [dni]
      );
      if (!result.rows[0]) return res.status(404).json({ error: 'No se encontró un alumno con ese DNI.' });
      res.json(result.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to lookup student', details: error.message });
    }
  });

  // ---- Self-link tutor to student -------------------------------------------
  router.post('/:id/link-tutor', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Students module is not active.' });
      const scope = await scopeOf(req);
      if (!scope?.userId) return res.status(401).json({ error: 'Auth required.' });

      const studentId = req.params.id;
      const student = await pool.query('SELECT id FROM "Student" WHERE id = $1 LIMIT 1', [studentId]);
      if (!student.rows[0]) return res.status(404).json({ error: 'Student not found.' });

      // Insert as PENDING (inactive) so staff must approve before the parent sees the student
      await pool.query(
        `INSERT INTO "StudentTutor" (id, "studentId", "tutorId", active, "status", "assignedAt")
         VALUES ($1, $2, $3, false, 'PENDING', NOW())
         ON CONFLICT ("studentId", "tutorId") DO NOTHING`,
        [crypto.randomUUID(), studentId, scope.userId]
      );
      res.status(201).json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to link tutor to student', details: error.message });
    }
  });

  // ---- Approve pending tutor request ----------------------------------------
  router.post('/:id/tutors/:tutorId/approve', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Students module is not active.' });
      const scope = await scopeOf(req);
      if (!scope?.isStaff) return res.status(403).json({ error: 'Only staff can approve parent requests.' });
      const { id: studentId, tutorId } = req.params;
      if (!(await canAccessStudent(scope, studentId))) return res.status(403).json({ error: 'Student out of scope.' });
      const r = await pool.query(
        `UPDATE "StudentTutor" SET active = true, "status" = 'ACTIVE' WHERE "studentId" = $1 AND "tutorId" = $2`,
        [studentId, tutorId]
      );
      if (!r.rowCount) return res.status(404).json({ error: 'Tutor link not found.' });
      res.json(await loadStudent(studentId));
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to approve tutor request', details: error.message });
    }
  });

  // ---- Single student (after sub-resource literals) -------------------------
  router.get('/:id', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Students module is not active.' });
      const scope = await scopeOf(req);
      if (!(await canAccessStudent(scope, req.params.id))) return res.status(403).json({ error: 'Student out of scope.' });
      const student = await loadStudent(req.params.id);
      if (!student) return res.status(404).json({ error: 'Student not found' });
      res.json(student);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch student', details: error.message });
    }
  });

  router.put('/:id', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Students module is not active.' });
      const scope = await scopeOf(req);
      if (!scope?.isStaff) return res.status(403).json({ error: 'Only staff can edit students.' });
      const existing = await loadStudent(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Student not found' });
      if (scope.isAdminSede && !scope.companyScope.includes(existing.companyId)) return res.status(403).json({ error: 'Student out of scope.' });

      await pool.query(
        `UPDATE "Student" SET "firstName"=$1,"lastName"=$2,document=$3,"birthDate"=$4,gender=$5,email=$6,phone=$7,address=$8,
            "medicalNotes"=$9,"emergencyContactName"=$10,"emergencyContactPhone"=$11,"emergencyContactEmail"=$12,
            "guardianName"=$13,"guardianPhone"=$14,"guardianEmail"=$15,notes=$16,status=$17,"joinDate"=$18,"updatedById"=$19,"updatedAt"=NOW()
         WHERE id=$20`,
        [
          String(req.body?.firstName ?? existing.firstName).trim() || existing.firstName,
          String(req.body?.lastName ?? existing.lastName).trim() || existing.lastName,
          req.body?.document !== undefined ? (String(req.body.document).trim() || null) : existing.document,
          req.body?.birthDate !== undefined ? (req.body.birthDate ? new Date(req.body.birthDate) : null) : existing.birthDate,
          req.body?.gender !== undefined ? (String(req.body.gender).trim() || null) : existing.gender,
          req.body?.email !== undefined ? (String(req.body.email).trim() || null) : existing.email,
          req.body?.phone !== undefined ? (String(req.body.phone).trim() || null) : existing.phone,
          req.body?.address !== undefined ? (String(req.body.address).trim() || null) : existing.address,
          req.body?.medicalNotes !== undefined ? (String(req.body.medicalNotes).trim() || null) : existing.medicalNotes,
          req.body?.emergencyContactName !== undefined ? (String(req.body.emergencyContactName).trim() || null) : existing.emergencyContactName,
          req.body?.emergencyContactPhone !== undefined ? (String(req.body.emergencyContactPhone).trim() || null) : existing.emergencyContactPhone,
          req.body?.emergencyContactEmail !== undefined ? (String(req.body.emergencyContactEmail).trim() || null) : existing.emergencyContactEmail,
          req.body?.guardianName !== undefined ? (String(req.body.guardianName).trim() || null) : existing.guardianName,
          req.body?.guardianPhone !== undefined ? (String(req.body.guardianPhone).trim() || null) : existing.guardianPhone,
          req.body?.guardianEmail !== undefined ? (String(req.body.guardianEmail).trim() || null) : existing.guardianEmail,
          req.body?.notes !== undefined ? (String(req.body.notes).trim() || null) : existing.notes,
          String(req.body?.status ?? existing.status).trim() || existing.status,
          req.body?.joinDate !== undefined ? (req.body.joinDate ? new Date(req.body.joinDate) : null) : existing.joinDate,
          scope.userId,
          req.params.id
        ]
      );
      await syncRelations(req.params.id, req.body);
      res.json(await loadStudent(req.params.id));
    } catch (error: any) {
      if (String(error?.code) === '23505') return res.status(409).json({ error: 'A student with that document already exists.' });
      res.status(500).json({ error: 'Failed to update student', details: error.message });
    }
  });

  router.patch('/:id/status', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Students module is not active.' });
      const scope = await scopeOf(req);
      if (!scope?.isStaff) return res.status(403).json({ error: 'Only staff can change status.' });
      const status = String(req.body?.status || '').trim();
      if (!status) return res.status(400).json({ error: 'status is required.' });
      const r = await pool.query('UPDATE "Student" SET status=$1, "updatedById"=$2, "updatedAt"=NOW() WHERE id=$3', [status, scope.userId, req.params.id]);
      if (!r.rowCount) return res.status(404).json({ error: 'Student not found' });
      res.json(await loadStudent(req.params.id));
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update student status', details: error.message });
    }
  });

  // ---- Student objective progress -------------------------------------------
  const ensureObjectiveProgressTable = async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "StudentObjectiveProgress" (
        "id" TEXT NOT NULL,
        "studentId" TEXT NOT NULL,
        "objectiveId" TEXT NOT NULL,
        "progress" INTEGER NOT NULL DEFAULT 0,
        "updatedById" TEXT,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "StudentObjectiveProgress_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "StudentObjectiveProgress_student_objective_key" UNIQUE ("studentId", "objectiveId")
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS "StudentObjectiveProgress_studentId_idx" ON "StudentObjectiveProgress"("studentId")');
  };

  // Returns the objectives of the student's enrolled class level(s), joined with
  // per-student progress. Objectives live as a JSONB array on "ClassLevel"
  // ([{ id, title, completed }]); the student's level comes from "ClassStudent".
  router.get('/:id/objectives', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Students module is not active.' });
      const scope = await scopeOf(req);
      if (!(await canAccessStudent(scope, req.params.id))) return res.status(403).json({ error: 'Student out of scope.' });
      await ensureObjectiveProgressTable();

      if (!(await tableExists('ClassStudent')) || !(await tableExists('ClassLevel'))) return res.json([]);

      const levels = await pool.query(
        `SELECT cl.id AS "levelId", cl.name AS "levelName", cl.objectives, c.name AS "className", cl."levelOrder"
         FROM "ClassStudent" cs
         JOIN "Class" c ON c.id = cs."classId"
         JOIN "ClassLevel" cl ON cl.id = cs."levelId"
         WHERE cs."studentId" = $1 AND cs.status = 'ACTIVE'
         ORDER BY cl."levelOrder" ASC, cl.name ASC`,
        [req.params.id]
      );

      if (!levels.rows.length) return res.json([]);

      // Flatten the JSONB objectives across levels, de-duplicating by objective id.
      const flat: Array<{ id: string; levelId: string; levelName: string; className: string; title: string; sortOrder: number; defaultCompleted: boolean }> = [];
      const seen = new Set<string>();
      for (const lvl of levels.rows as any[]) {
        const objectives = Array.isArray(lvl.objectives) ? lvl.objectives : [];
        let order = 0;
        for (const o of objectives) {
          const oid = String(o?.id || '').trim();
          const title = String(o?.title || '').trim();
          if (!oid || !title || seen.has(oid)) continue;
          seen.add(oid);
          flat.push({
            id: oid,
            levelId: String(lvl.levelId),
            levelName: lvl.levelName ?? '',
            className: lvl.className ?? '',
            title,
            sortOrder: order++,
            defaultCompleted: Boolean(o?.completed)
          });
        }
      }

      if (!flat.length) return res.json([]);

      const progRes = await pool.query(
        `SELECT "objectiveId", progress FROM "StudentObjectiveProgress" WHERE "studentId" = $1 AND "objectiveId" = ANY($2)`,
        [req.params.id, flat.map((o) => o.id)]
      );
      const progMap = new Map<string, number>(progRes.rows.map((r: any) => [String(r.objectiveId), Number(r.progress)]));

      const rows = flat.map((o) => ({
        id: o.id,
        levelId: o.levelId,
        levelName: o.levelName,
        className: o.className,
        title: o.title,
        sortOrder: o.sortOrder,
        progress: progMap.has(o.id) ? progMap.get(o.id) : (o.defaultCompleted ? 100 : 0)
      }));

      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch student objectives', details: error.message });
    }
  });

  router.put('/:id/objectives/:objectiveId/progress', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Students module is not active.' });
      const scope = await scopeOf(req);
      if (!scope || (!scope.isStaff && !scope.isProfesor)) {
        return res.status(403).json({ error: 'Only staff or assigned teachers can update objective progress.' });
      }
      if (!(await canAccessStudent(scope, req.params.id))) return res.status(403).json({ error: 'Student out of scope.' });
      await ensureObjectiveProgressTable();

      const { id: studentId, objectiveId } = req.params;
      const progress = Math.min(100, Math.max(0, Number(req.body?.progress ?? 0)));

      await pool.query(
        `INSERT INTO "StudentObjectiveProgress" (id, "studentId", "objectiveId", progress, "updatedById", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT ("studentId", "objectiveId")
         DO UPDATE SET progress = $4, "updatedById" = $5, "updatedAt" = NOW()`,
        [crypto.randomUUID(), studentId, objectiveId, progress, scope.userId || null]
      );

      res.json({ studentId, objectiveId, progress });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update objective progress', details: error.message });
    }
  });

  app.use('/api/students', router);
  return { basePath: '/api/students', openapiPath: '/api/students/openapi.json', docsPath: '/api/students/docs' };
}
