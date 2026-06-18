import express from 'express';
import crypto from 'crypto';
import type { Pool } from 'pg';
import {
  resolveTenantAuthContext,
  resolveRequesterScope,
  getRequesterUserId,
  seedModuleMenu,
  ensureSystemModule,
  grantModulePermission,
  NATACION_ROLES,
  type RequesterScope
} from '@sinapsis/module-sdk-server';

interface MessagingModuleContext {
  app: express.Express;
  pool: Pool;
}

const MODULE_CODE = 'MESSAGING';

export default async function registerMessagingModule({ app, pool }: MessagingModuleContext) {
  const router = express.Router();

  await ensureSystemModule(pool, {
    code: MODULE_CODE,
    name: 'Mensajería',
    description: 'Mensajería entre padres y profesores vinculada a alumnos'
  });

  await Promise.all([
    grantModulePermission(pool, { roleName: NATACION_ROLES.TUTOR,      moduleCode: MODULE_CODE, canRead: true, canCreate: true, canWrite: true, canDelete: false }),
    grantModulePermission(pool, { roleName: NATACION_ROLES.PROFESOR,   moduleCode: MODULE_CODE, canRead: true, canCreate: true, canWrite: true, canDelete: false }),
    grantModulePermission(pool, { roleName: NATACION_ROLES.ADMIN_SEDE, moduleCode: MODULE_CODE, canRead: true, canCreate: false, canWrite: false, canDelete: false }),
  ]);

  await seedModuleMenu(pool, {
    moduleCode: MODULE_CODE,
    group: { key: 'messaging', label: 'Mensajería', icon: 'fa-comments', sortOrder: 70 },
    items: [{ label: 'Mensajes', icon: 'fa-envelope', viewKey: 'Messaging', sortOrder: 0 }]
  });

  const ensureActive = async () => {
    const mod = await pool.query('SELECT status FROM "SystemModule" WHERE code = $1 LIMIT 1', [MODULE_CODE]);
    return String(mod.rows[0]?.status || '') === 'Active';
  };

  type Auth = { scope: RequesterScope; organizationId: string; userId: string };

  const authUser = async (req: express.Request, res: express.Response): Promise<Auth | null> => {
    const uid = String((req as any).authUserId || getRequesterUserId(req) || '').trim();
    const scope = await resolveRequesterScope(pool, uid);
    const ctx = await resolveTenantAuthContext(pool, uid);
    if (!scope || !ctx) { res.status(401).json({ error: 'Se requiere autenticación.' }); return null; }
    return { scope, organizationId: ctx.organizationId, userId: uid };
  };

  // Build WHERE clause for Conversation access.
  // Assumes: JOIN "Student" s ON s.id = conv."studentId"
  //          JOIN "Company" c ON c.id = s."companyId"
  const buildConvWhere = (
    scope: RequesterScope,
    userId: string,
    organizationId: string,
    params: any[]
  ): string => {
    params.push(organizationId);
    const orgCheck = `c."organizationId" = $${params.length}`;

    if (scope.isSuperAdmin) return orgCheck;

    if (scope.isAdminSede) {
      if (!scope.companyScope || !scope.companyScope.length) return 'false';
      params.push(scope.companyScope);
      return `${orgCheck} AND s."companyId" = ANY($${params.length})`;
    }

    // Tutor or Profesor: must be active participant
    params.push(userId);
    return `${orgCheck} AND EXISTS (
      SELECT 1 FROM "ConversationParticipant" _cp
      WHERE _cp."conversationId" = conv.id AND _cp."userId" = $${params.length} AND _cp.active
    )`;
  };

  // ── GET /api/messaging/threads ─────────────────────────────────────────────
  router.get('/threads', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Módulo de mensajería no activo.' });
      const auth = await authUser(req, res);
      if (!auth) return;
      const { scope, organizationId, userId } = auth;

      const params: any[] = [];
      const where = buildConvWhere(scope, userId, organizationId, params);
      if (where === 'false') return res.json([]);

      params.push(userId);
      const uidParam = `$${params.length}`;

      const r = await pool.query(
        `SELECT
           conv.id,
           conv."studentId",
           s."firstName"            AS "studentFirstName",
           s."lastName"             AS "studentLastName",
           conv.subject,
           conv.status,
           conv."createdAt",
           conv."updatedAt",
           part."lastReadAt",
           COALESCE((
             SELECT COUNT(*)::int
             FROM "Message" m
             WHERE m."conversationId" = conv.id
               AND m."senderId" != ${uidParam}
               AND (part."lastReadAt" IS NULL OR m."createdAt" > part."lastReadAt")
           ), 0) AS "unreadCount",
           last_msg.body            AS "lastMessageBody",
           last_msg."createdAt"     AS "lastMessageAt",
           COALESCE(last_sender."firstName" || ' ' || last_sender."lastName", last_sender.name) AS "lastSenderName",
           (
             SELECT json_agg(json_build_object(
               'userId',   cp2."userId",
               'name',     COALESCE(u2."firstName" || ' ' || u2."lastName", u2.name, u2.email),
               'imageUrl', u2."imageUrl"
             ) ORDER BY cp2."joinedAt")
             FROM "ConversationParticipant" cp2
             JOIN "User" u2 ON u2.id = cp2."userId"
             WHERE cp2."conversationId" = conv.id AND cp2.active
           ) AS participants
         FROM "Conversation" conv
         JOIN "Student" s ON s.id = conv."studentId"
         JOIN "Company" c ON c.id = s."companyId"
         LEFT JOIN "ConversationParticipant" part
           ON part."conversationId" = conv.id AND part."userId" = ${uidParam}
         LEFT JOIN LATERAL (
           SELECT m.body, m."createdAt", m."senderId"
           FROM "Message" m
           WHERE m."conversationId" = conv.id
           ORDER BY m."createdAt" DESC
           LIMIT 1
         ) last_msg ON true
         LEFT JOIN "User" last_sender ON last_sender.id = last_msg."senderId"
         WHERE ${where}
         ORDER BY COALESCE(last_msg."createdAt", conv."createdAt") DESC`,
        params
      );

      res.json(r.rows);
    } catch (err: any) {
      res.status(500).json({ error: 'Error cargando conversaciones.', details: err.message });
    }
  });

  // ── GET /api/messaging/threads/:id ────────────────────────────────────────
  router.get('/threads/:id', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Módulo de mensajería no activo.' });
      const auth = await authUser(req, res);
      if (!auth) return;
      const { scope, userId } = auth;

      const r = await pool.query(
        `SELECT conv.*,
                s."firstName" AS "studentFirstName", s."lastName" AS "studentLastName",
                c.name AS "companyName",
                (
                  SELECT json_agg(json_build_object(
                    'userId', cp."userId",
                    'name',   COALESCE(u."firstName" || ' ' || u."lastName", u.name),
                    'imageUrl', u."imageUrl",
                    'lastReadAt', cp."lastReadAt"
                  ))
                  FROM "ConversationParticipant" cp
                  JOIN "User" u ON u.id = cp."userId"
                  WHERE cp."conversationId" = conv.id AND cp.active
                ) AS participants
         FROM "Conversation" conv
         JOIN "Student" s ON s.id = conv."studentId"
         JOIN "Company" c ON c.id = s."companyId"
         WHERE conv.id = $1 LIMIT 1`,
        [req.params.id]
      );
      const conv = r.rows[0];
      if (!conv) return res.status(404).json({ error: 'Conversación no encontrada.' });

      if (!scope.isSuperAdmin) {
        const partCheck = await pool.query(
          `SELECT 1 FROM "ConversationParticipant"
           WHERE "conversationId" = $1 AND "userId" = $2 AND active LIMIT 1`,
          [conv.id, userId]
        );
        if (!partCheck.rows[0]) return res.status(403).json({ error: 'Sin acceso.' });
      }

      res.json(conv);
    } catch (err: any) {
      res.status(500).json({ error: 'Error cargando conversación.', details: err.message });
    }
  });

  // ── GET /api/messaging/threads/:id/messages ───────────────────────────────
  router.get('/threads/:id/messages', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Módulo de mensajería no activo.' });
      const auth = await authUser(req, res);
      if (!auth) return;
      const { scope, userId } = auth;

      if (!scope.isSuperAdmin && !scope.isAdminSede) {
        const part = await pool.query(
          `SELECT 1 FROM "ConversationParticipant"
           WHERE "conversationId" = $1 AND "userId" = $2 AND active LIMIT 1`,
          [req.params.id, userId]
        );
        if (!part.rows[0]) return res.status(403).json({ error: 'Sin acceso.' });
      }

      const r = await pool.query(
        `SELECT m.id, m."conversationId", m."senderId", m.body, m."createdAt",
                u."firstName", u."lastName",
                COALESCE(u."firstName" || ' ' || u."lastName", u.name) AS "senderName",
                u."imageUrl" AS "senderImageUrl",
                EXISTS (
                  SELECT 1 FROM "MessageRead" mr
                  WHERE mr."messageId" = m.id AND mr."userId" = $2
                ) AS "isRead"
         FROM "Message" m
         LEFT JOIN "User" u ON u.id = m."senderId"
         WHERE m."conversationId" = $1
         ORDER BY m."createdAt" ASC`,
        [req.params.id, userId]
      );

      // Update participant's lastReadAt
      await pool.query(
        `INSERT INTO "ConversationParticipant" (id, "conversationId", "userId", active, "joinedAt", "lastReadAt")
         VALUES ($1, $2, $3, true, NOW(), NOW())
         ON CONFLICT ("conversationId", "userId") DO UPDATE SET "lastReadAt" = NOW()`,
        [crypto.randomUUID(), req.params.id, userId]
      );

      // Insert MessageRead for messages not yet read by this user
      const unread = r.rows.filter((m: any) => !m.isRead && m.senderId !== userId);
      for (const m of unread) {
        await pool.query(
          `INSERT INTO "MessageRead" (id, "messageId", "userId", "readAt")
           VALUES ($1, $2, $3, NOW()) ON CONFLICT DO NOTHING`,
          [crypto.randomUUID(), m.id, userId]
        ).catch(() => {});
      }

      res.json(r.rows);
    } catch (err: any) {
      res.status(500).json({ error: 'Error cargando mensajes.', details: err.message });
    }
  });

  // ── POST /api/messaging/threads/:id/messages ──────────────────────────────
  router.post('/threads/:id/messages', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Módulo de mensajería no activo.' });
      const auth = await authUser(req, res);
      if (!auth) return;
      const { scope, userId } = auth;

      if (!scope.isSuperAdmin && !scope.isAdminSede) {
        const part = await pool.query(
          `SELECT 1 FROM "ConversationParticipant"
           WHERE "conversationId" = $1 AND "userId" = $2 AND active LIMIT 1`,
          [req.params.id, userId]
        );
        if (!part.rows[0]) return res.status(403).json({ error: 'Sin acceso.' });
      }

      const body = String(req.body?.body || '').trim();
      if (!body) return res.status(400).json({ error: 'El mensaje no puede estar vacío.' });

      const msgId = crypto.randomUUID();

      await pool.query(
        `INSERT INTO "Message" (id, "conversationId", "senderId", body, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, NOW(), NOW())`,
        [msgId, req.params.id, userId, body]
      );

      await pool.query(
        `INSERT INTO "MessageRead" (id, "messageId", "userId", "readAt")
         VALUES ($1, $2, $3, NOW()) ON CONFLICT DO NOTHING`,
        [crypto.randomUUID(), msgId, userId]
      );

      await pool.query(
        `UPDATE "Conversation" SET "updatedAt" = NOW() WHERE id = $1`,
        [req.params.id]
      );

      const uRow = await pool.query(
        `SELECT "firstName", "lastName", name, "imageUrl" FROM "User" WHERE id = $1`,
        [userId]
      );
      const u = uRow.rows[0] || {};

      res.status(201).json({
        id: msgId,
        conversationId: req.params.id,
        senderId: userId,
        body,
        createdAt: new Date().toISOString(),
        isRead: true,
        firstName: u.firstName || null,
        lastName: u.lastName || null,
        senderName: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.name || null,
        senderImageUrl: u.imageUrl || null
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Error enviando mensaje.', details: err.message });
    }
  });

  // ── GET /api/messaging/contacts ───────────────────────────────────────────
  router.get('/contacts', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Módulo de mensajería no activo.' });
      const auth = await authUser(req, res);
      if (!auth) return;
      const { scope, userId } = auth;

      if (!scope.isTutor && !scope.isProfesor && !scope.isAdminSede && !scope.isSuperAdmin) {
        return res.json([]);
      }

      const params: any[] = [];
      let clause = '1=1';

      if (scope.isTutor) {
        params.push(userId);
        clause = `EXISTS (
          SELECT 1 FROM "StudentTutor" st
          WHERE st."studentId" = s.id AND st."tutorId" = $${params.length} AND st.active
        )`;
      } else if (scope.isProfesor) {
        params.push(userId);
        clause = `(
          EXISTS (SELECT 1 FROM "StudentTeacher" st WHERE st."studentId" = s.id AND st."teacherId" = $${params.length} AND st.active)
          OR (
            to_regclass('public."ClassTeacher"') IS NOT NULL
            AND to_regclass('public."ClassStudent"') IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM "ClassStudent" cs
              JOIN "ClassTeacher" ct ON ct."classId" = cs."classId" AND ct."teacherId" = $${params.length} AND ct.active = true
              WHERE cs."studentId" = s.id AND cs.status = 'ACTIVE'
            )
          )
        )`;
      } else if (scope.isAdminSede && !scope.isSuperAdmin) {
        if (!scope.companyScope || !scope.companyScope.length) return res.json([]);
        params.push(scope.companyScope);
        clause = `s."companyId" = ANY($${params.length})`;
      }

      const r = await pool.query(
        `SELECT s.id, s."firstName", s."lastName", s."companyId", c.name AS "companyName"
         FROM "Student" s
         JOIN "Company" c ON c.id = s."companyId"
         WHERE s.status = 'ACTIVE' AND ${clause}
         ORDER BY s."lastName", s."firstName"
         LIMIT 200`,
        params
      );

      res.json(r.rows);
    } catch (err: any) {
      res.status(500).json({ error: 'Error cargando contactos.', details: err.message });
    }
  });

  // ── POST /api/messaging/threads ───────────────────────────────────────────
  router.post('/threads', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Módulo de mensajería no activo.' });
      const auth = await authUser(req, res);
      if (!auth) return;
      const { scope, userId } = auth;

      if (!scope.isTutor && !scope.isProfesor && !scope.isAdminSede && !scope.isSuperAdmin) {
        return res.status(403).json({ error: 'Sin permiso para crear conversaciones.' });
      }

      const { studentId, subject, participantIds } = req.body as {
        studentId?: string;
        subject?: string;
        participantIds?: string[];
      };
      if (!studentId) return res.status(400).json({ error: 'Se requiere studentId.' });

      const convId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO "Conversation" (id, "studentId", subject, status, "createdById", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, 'OPEN', $4, NOW(), NOW())`,
        [convId, studentId, subject || null, userId]
      );

      const allParticipants = Array.from(new Set([userId, ...(participantIds || [])]));
      for (const pid of allParticipants) {
        await pool.query(
          `INSERT INTO "ConversationParticipant" (id, "conversationId", "userId", active, "joinedAt")
           VALUES ($1, $2, $3, true, NOW()) ON CONFLICT DO NOTHING`,
          [crypto.randomUUID(), convId, pid]
        );
      }

      const r = await pool.query(
        `SELECT conv.*,
                s."firstName" AS "studentFirstName", s."lastName" AS "studentLastName",
                c.name AS "companyName"
         FROM "Conversation" conv
         JOIN "Student" s ON s.id = conv."studentId"
         JOIN "Company" c ON c.id = s."companyId"
         WHERE conv.id = $1`,
        [convId]
      );

      res.status(201).json(r.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: 'Error creando conversación.', details: err.message });
    }
  });

  app.use('/api/messaging', router);
  return { basePath: '/api/messaging' };
}
