import type express from 'express';
import type pg from 'pg';
import type multer from 'multer';
import crypto from 'crypto';
import { ensureRole, NATACION_ROLES } from '@sinapsis/module-sdk-server';

type PrismaLike = any;

/**
 * Global (super-admin) ABM of "Padres" = Users with the Tutor role, across all
 * organizations. Mounted under /api/admin (so routes are /api/admin/parents...).
 */
export const registerModuleAdminRoutes = async (
  router: express.Router,
  _prisma: PrismaLike,
  pool: pg.Pool,
  _uploadMemory: multer.Multer
) => {
  let columnsEnsured = false;
  const ensureColumns = async () => {
    if (columnsEnsured) return;
    await pool.query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phone" TEXT');
    await pool.query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "document" TEXT');
    await pool.query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "activationToken" TEXT');
    await pool.query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "activationTokenExpiresAt" TIMESTAMPTZ');
    await pool.query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMPTZ');
    columnsEnsured = true;
  };

  const tableExists = async (name: string) => {
    const r = await pool.query('SELECT to_regclass($1) AS t', [`public."${name}"`]);
    return Boolean(r.rows[0]?.t);
  };

  const loadOne = async (id: string) => {
    const r = await pool.query(
      `SELECT u.id, u.email, u.name, u."firstName", u."lastName", u.phone, u.document, u."companyId",
              u."emailVerifiedAt",
              c.name AS "companyName", c."organizationId", o.name AS "organizationName", u."createdAt"
       FROM "User" u
       JOIN "Company" c ON c.id = u."companyId"
       JOIN "Organization" o ON o.id = c."organizationId"
       WHERE u.id = $1 LIMIT 1`,
      [id]
    );
    return r.rows[0] || null;
  };

  // List all tutor users (across organizations).
  router.get('/parents', async (_req, res) => {
    try {
      await ensureColumns();
      const r = await pool.query(
        `SELECT u.id, u.email, u.name, u."firstName", u."lastName", u.phone, u.document, u."companyId",
                u."emailVerifiedAt",
                c.name AS "companyName", c."organizationId", o.name AS "organizationName", u."createdAt"
         FROM "User" u
         JOIN "Company" c ON c.id = u."companyId"
         JOIN "Organization" o ON o.id = c."organizationId"
         JOIN "Role" r ON r.id = u."roleId"
         WHERE r.name = $1
         ORDER BY o.name ASC, u."lastName" ASC, u."firstName" ASC`,
        [NATACION_ROLES.TUTOR]
      );
      res.json(r.rows);
    } catch (e: any) {
      res.status(500).json({ error: 'Failed to list parents', details: e?.message || String(e) });
    }
  });

  // Sedes (companies) across all organizations, for the create/edit selector.
  router.get('/parents/companies', async (_req, res) => {
    try {
      const r = await pool.query(
        `SELECT c.id, c.name, c."organizationId", o.name AS "organizationName"
         FROM "Company" c
         JOIN "Organization" o ON o.id = c."organizationId"
         WHERE c.status = 'Active'
         ORDER BY o.name ASC, c.name ASC`
      );
      res.json(r.rows);
    } catch (e: any) {
      res.status(500).json({ error: 'Failed to list companies', details: e?.message || String(e) });
    }
  });

  router.post('/parents', async (req, res) => {
    try {
      await ensureColumns();
      const firstName = String(req.body?.firstName || '').trim();
      const lastName = String(req.body?.lastName || '').trim();
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');
      const companyId = String(req.body?.companyId || '').trim();
      if (!firstName || !lastName) return res.status(400).json({ error: 'firstName and lastName are required.' });
      if (!email) return res.status(400).json({ error: 'email is required.' });
      if (!password) return res.status(400).json({ error: 'password is required.' });
      if (!companyId) return res.status(400).json({ error: 'companyId (sede) is required.' });
      const cc = await pool.query('SELECT 1 FROM "Company" WHERE id = $1 LIMIT 1', [companyId]);
      if (!cc.rows[0]) return res.status(400).json({ error: 'Company not found.' });

      const tutorRoleId = await ensureRole(pool, NATACION_ROLES.TUTOR, 'Tutor / responsable de alumno');
      const id = crypto.randomUUID();
      const name = `${firstName} ${lastName}`.trim();
      await pool.query(
        `INSERT INTO "User" (id, email, name, "firstName", "lastName", password, role, "roleId", "companyId", phone, document, "emailVerifiedAt", "createdAt", "updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW(),NOW())`,
        [
          id, email, name, firstName, lastName, password, NATACION_ROLES.TUTOR, tutorRoleId, companyId,
          String(req.body?.phone || '').trim() || null,
          String(req.body?.document || '').trim() || null
        ]
      );
      res.status(201).json(await loadOne(id));
    } catch (e: any) {
      if (String(e?.code) === '23505') return res.status(409).json({ error: 'A user with that email already exists.' });
      res.status(500).json({ error: 'Failed to create parent', details: e?.message || String(e) });
    }
  });

  router.put('/parents/:id', async (req, res) => {
    try {
      await ensureColumns();
      const existing = await pool.query(
        `SELECT u.* FROM "User" u JOIN "Role" r ON r.id = u."roleId" WHERE u.id = $1 AND r.name = $2 LIMIT 1`,
        [req.params.id, NATACION_ROLES.TUTOR]
      );
      const target = existing.rows[0];
      if (!target) return res.status(404).json({ error: 'Parent not found' });

      const firstName = req.body?.firstName !== undefined ? (String(req.body.firstName).trim() || target.firstName) : target.firstName;
      const lastName = req.body?.lastName !== undefined ? (String(req.body.lastName).trim() || target.lastName) : target.lastName;
      const email = req.body?.email !== undefined ? (String(req.body.email).trim().toLowerCase() || target.email) : target.email;
      let companyId = target.companyId;
      if (req.body?.companyId !== undefined && String(req.body.companyId).trim()) {
        const next = String(req.body.companyId).trim();
        const cc = await pool.query('SELECT 1 FROM "Company" WHERE id = $1 LIMIT 1', [next]);
        if (!cc.rows[0]) return res.status(400).json({ error: 'Company not found.' });
        companyId = next;
      }
      const name = `${firstName} ${lastName}`.trim();
      const phone = req.body?.phone !== undefined ? (String(req.body.phone).trim() || null) : target.phone;
      const document = req.body?.document !== undefined ? (String(req.body.document).trim() || null) : target.document;
      const password = String(req.body?.password || '');
      const active = req.body?.active !== undefined ? Boolean(req.body.active) : Boolean(target.emailVerifiedAt);

      await pool.query(
        `UPDATE "User"
         SET email=$1,
             name=$2,
             "firstName"=$3,
             "lastName"=$4,
             "companyId"=$5,
             phone=$6,
             document=$7,
             "emailVerifiedAt"=${active ? 'COALESCE("emailVerifiedAt", NOW())' : 'NULL'},
             "activationToken"=${active ? 'NULL' : '"activationToken"'},
             "activationTokenExpiresAt"=${active ? 'NULL' : '"activationTokenExpiresAt"'},
             "updatedAt"=NOW()${password ? ', password=$9' : ''}
         WHERE id=$8`,
        password
          ? [email, name, firstName, lastName, companyId, phone, document, req.params.id, password]
          : [email, name, firstName, lastName, companyId, phone, document, req.params.id]
      );
      res.json(await loadOne(req.params.id));
    } catch (e: any) {
      if (String(e?.code) === '23505') return res.status(409).json({ error: 'A user with that email already exists.' });
      res.status(500).json({ error: 'Failed to update parent', details: e?.message || String(e) });
    }
  });

  router.delete('/parents/:id', async (req, res) => {
    try {
      const existing = await pool.query(
        `SELECT u.id FROM "User" u JOIN "Role" r ON r.id = u."roleId" WHERE u.id = $1 AND r.name = $2 LIMIT 1`,
        [req.params.id, NATACION_ROLES.TUTOR]
      );
      if (!existing.rows[0]) return res.status(404).json({ error: 'Parent not found' });

      if (await tableExists('StudentTutor')) {
        await pool.query('DELETE FROM "StudentTutor" WHERE "tutorId" = $1', [req.params.id]);
      }
      await pool.query('DELETE FROM "User" WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: 'Failed to delete parent', details: e?.message || String(e) });
    }
  });
};
