import crypto from 'crypto';
import type { Pool } from 'pg';
import { parseAccessCompanyIds } from './categoryTenantContext';

type PgExec = Pick<Pool, 'query'>;

/**
 * Idempotently creates a Category (system scope) plus its CategoryItem rows.
 * Items are created at system scope (organizationId/companyId NULL) so every
 * company sees them as defaults. Mirrors the helper used by the clients module.
 */
export const ensureCategoryWithItems = async (
  pool: PgExec,
  args: { code: string; name: string; module: string; description?: string; items: string[] }
): Promise<string> => {
  const existing = await pool.query(
    'SELECT id FROM "Category" WHERE code = $1 ORDER BY "createdAt" ASC LIMIT 1',
    [args.code]
  );

  let categoryId = existing.rows[0]?.id as string | undefined;

  if (!categoryId) {
    const created = await pool.query(
      'INSERT INTO "Category" (id, code, name, description, module, status, "sortOrder", "sortingRule", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, 0, $7, NOW(), NOW()) RETURNING id',
      [crypto.randomUUID(), args.code, args.name, args.description || null, args.module, 'Active', 'Manual']
    );
    categoryId = created.rows[0].id as string;
  }

  for (let i = 0; i < args.items.length; i += 1) {
    const name = args.items[i];
    const base = name.replace(/[^a-z0-9]/gi, '_').toUpperCase();

    // Idempotent within this category (matched by display name).
    const existingItem = await pool.query(
      'SELECT id FROM "CategoryItem" WHERE "categoryId" = $1 AND name = $2 LIMIT 1',
      [categoryId, name]
    );
    if (existingItem.rows[0]) continue;

    // CategoryItem.code is globally unique: reuse the plain code when free, else
    // namespace it under the category code (e.g. COMMUNITY_POST_STATUS_DRAFT).
    const taken = await pool.query('SELECT 1 FROM "CategoryItem" WHERE code = $1 LIMIT 1', [base]);
    const code = taken.rows[0] ? `${args.code}_${base}` : base;

    await pool.query(
      'INSERT INTO "CategoryItem" (id, code, name, description, status, "sortOrder", "categoryId", "organizationId", "companyId", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NULL, NOW(), NOW())',
      [crypto.randomUUID(), code, name, `${args.name}: ${name}`, 'Active', i, categoryId]
    );
  }

  return categoryId as string;
};

/** Idempotently upserts a SystemModule row by code and marks it Active. */
export const ensureSystemModule = async (
  pool: PgExec,
  args: { code: string; name: string; description?: string | null }
): Promise<void> => {
  const existing = await pool.query('SELECT id FROM "SystemModule" WHERE code = $1 LIMIT 1', [args.code]);
  if (existing.rows[0]) {
    await pool.query(
      'UPDATE "SystemModule" SET name = $1, description = $2, status = $3, "updatedAt" = NOW() WHERE code = $4',
      [args.name, args.description || null, 'Active', args.code]
    );
  } else {
    await pool.query(
      'INSERT INTO "SystemModule" (id, name, code, description, status, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, NOW(), NOW())',
      [crypto.randomUUID(), args.name, args.code, args.description || null, 'Active']
    );
  }
};

/** Idempotently ensures a Role exists (unique by name); returns its id. */
export const ensureRole = async (pool: PgExec, name: string, description?: string): Promise<string> => {
  const existing = await pool.query('SELECT id FROM "Role" WHERE name = $1 LIMIT 1', [name]);
  if (existing.rows[0]?.id) return String(existing.rows[0].id);
  const created = await pool.query(
    'INSERT INTO "Role" (id, name, description, "createdAt", "updatedAt") VALUES ($1, $2, $3, NOW(), NOW()) ON CONFLICT (name) DO UPDATE SET "updatedAt" = NOW() RETURNING id',
    [crypto.randomUUID(), name, description || null]
  );
  return String(created.rows[0].id);
};

export type PermissionFlags = {
  canRead?: boolean;
  canCreate?: boolean;
  canWrite?: boolean;
  canDelete?: boolean;
};

/**
 * Grants (or updates) a role's CRUD permission on a module. No-op if the role
 * or module is missing. Idempotent thanks to the (roleId, moduleId) unique key.
 */
export const grantModulePermission = async (
  pool: PgExec,
  args: { roleName: string; moduleCode: string } & PermissionFlags
): Promise<void> => {
  const role = await pool.query('SELECT id FROM "Role" WHERE name = $1 LIMIT 1', [args.roleName]);
  const mod = await pool.query('SELECT id FROM "SystemModule" WHERE code = $1 LIMIT 1', [args.moduleCode]);
  const roleId = role.rows[0]?.id as string | undefined;
  const moduleId = mod.rows[0]?.id as string | undefined;
  if (!roleId || !moduleId) return;

  await pool.query(
    `INSERT INTO "Permission" (id, "roleId", "moduleId", "canRead", "canCreate", "canWrite", "canDelete", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
     ON CONFLICT ("roleId", "moduleId") DO UPDATE
       SET "canRead" = EXCLUDED."canRead",
           "canCreate" = EXCLUDED."canCreate",
           "canWrite" = EXCLUDED."canWrite",
           "canDelete" = EXCLUDED."canDelete",
           "updatedAt" = NOW()`,
    [
      crypto.randomUUID(),
      roleId,
      moduleId,
      Boolean(args.canRead),
      Boolean(args.canCreate),
      Boolean(args.canWrite),
      Boolean(args.canDelete)
    ]
  );
};

export type ModuleMenuSeedItem = {
  label: string;
  icon: string;
  viewKey: string;
  sortOrder?: number;
};

/**
 * Idempotently seeds a sidebar MenuGroup and its MODULE_VIEW MenuItems so the
 * module's views are visible without manual Menu Management. Existing items for
 * the same (group, viewKey) are left untouched (respects user edits).
 */
export const seedModuleMenu = async (
  pool: PgExec,
  args: {
    moduleCode: string;
    group: { key: string; label: string; icon: string; sortOrder?: number };
    items: ModuleMenuSeedItem[];
  }
): Promise<void> => {
  const placement = 'sidebar';
  const existingGroup = await pool.query(
    'SELECT id FROM "MenuGroup" WHERE key = $1 AND placement = $2 LIMIT 1',
    [args.group.key, placement]
  );

  let groupId = existingGroup.rows[0]?.id as string | undefined;
  if (!groupId) {
    const createdGroup = await pool.query(
      'INSERT INTO "MenuGroup" (id, key, label, icon, status, "sortOrder", placement, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW()) RETURNING id',
      [crypto.randomUUID(), args.group.key, args.group.label, args.group.icon, 'Active', args.group.sortOrder ?? 50, placement]
    );
    groupId = createdGroup.rows[0].id as string;
  }

  for (let i = 0; i < args.items.length; i += 1) {
    const item = args.items[i];
    const exists = await pool.query(
      'SELECT id FROM "MenuItem" WHERE "groupId" = $1 AND "viewKey" = $2 AND "targetType" = $3 LIMIT 1',
      [groupId, item.viewKey, 'MODULE_VIEW']
    );
    if (exists.rows[0]) continue;

    await pool.query(
      'INSERT INTO "MenuItem" (id, "groupId", label, icon, "targetType", "viewKey", "moduleCode", status, "sortOrder", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())',
      [crypto.randomUUID(), groupId, item.label, item.icon, 'MODULE_VIEW', item.viewKey, args.moduleCode, 'Active', item.sortOrder ?? i]
    );
  }
};

/** Removes the seeded sidebar group (and its items via cascade) for a module key. */
export const removeModuleMenu = async (pool: PgExec, groupKey: string): Promise<void> => {
  await pool.query('DELETE FROM "MenuGroup" WHERE key = $1 AND placement = $2', [groupKey, 'sidebar']);
};

/** Canonical role names used by the ported "Ecosistema" domain. */
export const NATACION_ROLES = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN_SEDE: 'Admin Sede',
  PROFESOR: 'Profesor',
  TUTOR: 'Tutor'
} as const;

export type RequesterScope = {
  userId: string;
  roleName: string;
  legacyRole: string;
  isSuperAdmin: boolean;
  isAdminSede: boolean;
  isProfesor: boolean;
  isTutor: boolean;
  isStaff: boolean;
  primaryCompanyId: string | null;
  /** Organization (tenant) the user belongs to — null for platform-level super admins with no company. */
  organizationId: string | null;
  accessCompanyIds: string[];
  /** Companies an Admin Sede may act on (primary + access). */
  companyScope: string[];
};

/**
 * Resolves the requesting user's role + company scope for module-level business
 * scoping (the framework's Permission flags only express coarse CRUD access).
 * The userId should come from the X-User-Id header set by the web shell.
 */
export const resolveRequesterScope = async (pool: PgExec, userId: string): Promise<RequesterScope | null> => {
  const id = String(userId || '').trim();
  if (!id) return null;
  const r = await pool.query(
    `SELECT u.id,
            COALESCE(u.role, '') AS "legacyRole",
            COALESCE(r.name, '') AS "roleName",
            u."companyId" AS "companyId",
            u."accessCompanyIds" AS "accessCompanyIdsRaw",
            c."organizationId" AS "organizationId"
     FROM "User" u
     LEFT JOIN "Role" r ON r.id = u."roleId"
     LEFT JOIN "Company" c ON c.id = u."companyId"
     WHERE u.id = $1
     LIMIT 1`,
    [id]
  );
  const row = r.rows[0];
  if (!row) return null;

  const legacyRole = String(row.legacyRole || '').trim();
  const roleName = String(row.roleName || '').trim();
  const legacyLower = legacyRole.toLowerCase();
  const isLegacyAdmin = legacyLower === 'administrator' || legacyLower === 'admin';
  const isSuperAdmin = isLegacyAdmin || roleName === NATACION_ROLES.SUPER_ADMIN;
  const isAdminSede = roleName === NATACION_ROLES.ADMIN_SEDE;
  const isProfesor = roleName === NATACION_ROLES.PROFESOR;
  const isTutor = roleName === NATACION_ROLES.TUTOR;
  const primaryCompanyId = row.companyId ? String(row.companyId) : null;
  const organizationId = row.organizationId ? String(row.organizationId) : null;
  const accessCompanyIds = parseAccessCompanyIds(row.accessCompanyIdsRaw);
  const companyScope = Array.from(new Set([...(primaryCompanyId ? [primaryCompanyId] : []), ...accessCompanyIds]));

  return {
    userId: id,
    roleName,
    legacyRole,
    isSuperAdmin,
    isAdminSede,
    isProfesor,
    isTutor,
    isStaff: isSuperAdmin || isAdminSede,
    primaryCompanyId,
    organizationId,
    accessCompanyIds,
    companyScope
  };
};

/** Reads the requester user id from the X-User-Id header (set by the web shell), with a query fallback. */
export const getRequesterUserId = (req: { header?: (n: string) => string | undefined; query?: any; body?: any }): string => {
  const fromHeader = typeof req.header === 'function' ? req.header('X-User-Id') : undefined;
  const fromQuery = req.query?.userId;
  const fromBody = req.body?.userId || req.body?.createdById || req.body?.updatedById;
  return String(fromHeader || fromQuery || fromBody || '').trim();
};
