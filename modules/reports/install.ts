import crypto from 'crypto';
import type { Pool } from 'pg';

interface InstallContext {
  pool: Pool;
  moduleCode: string;
  moduleName: string;
  moduleDescription?: string | null;
}

const ROLES = {
  SUPER_ADMIN: 'Super Admin',
  ADMINISTRADOR: 'Administrador',
  ADMIN_SEDE: 'Admin Sede',
  PROFESOR: 'Profesor',
} as const;

async function ensureSystemModule(pool: Pool, code: string, name: string, description: string | null) {
  const existing = await pool.query('SELECT id FROM "SystemModule" WHERE code = $1 LIMIT 1', [code]);
  if (existing.rows[0]) {
    await pool.query(
      'UPDATE "SystemModule" SET name=$1, description=$2, status=$3, "updatedAt"=NOW() WHERE code=$4',
      [name, description, 'Active', code]
    );
  } else {
    await pool.query(
      'INSERT INTO "SystemModule" (id, name, code, description, status, "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,NOW(),NOW())',
      [crypto.randomUUID(), name, code, description, 'Active']
    );
  }
}

async function ensureRole(pool: Pool, roleName: string, desc: string) {
  await pool.query(
    'INSERT INTO "Role" (id, name, description, "createdAt", "updatedAt") VALUES ($1,$2,$3,NOW(),NOW()) ON CONFLICT (name) DO UPDATE SET "updatedAt"=NOW()',
    [crypto.randomUUID(), roleName, desc]
  );
}

async function grantPermission(pool: Pool, roleName: string, moduleCode: string, flags: { canRead?: boolean; canCreate?: boolean; canWrite?: boolean; canDelete?: boolean }) {
  const roleRow = await pool.query('SELECT id FROM "Role" WHERE name=$1 LIMIT 1', [roleName]);
  const modRow  = await pool.query('SELECT id FROM "SystemModule" WHERE code=$1 LIMIT 1', [moduleCode]);
  const roleId   = roleRow.rows[0]?.id;
  const moduleId = modRow.rows[0]?.id;
  if (!roleId || !moduleId) return;
  await pool.query(
    `INSERT INTO "Permission" (id, "roleId", "moduleId", "canRead", "canCreate", "canWrite", "canDelete", "createdAt", "updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())
     ON CONFLICT ("roleId","moduleId") DO UPDATE
       SET "canRead"=EXCLUDED."canRead","canCreate"=EXCLUDED."canCreate",
           "canWrite"=EXCLUDED."canWrite","canDelete"=EXCLUDED."canDelete","updatedAt"=NOW()`,
    [crypto.randomUUID(), roleId, moduleId, Boolean(flags.canRead), Boolean(flags.canCreate), Boolean(flags.canWrite), Boolean(flags.canDelete)]
  );
}

async function seedMenu(pool: Pool, moduleCode: string, group: { key: string; label: string; icon: string; sortOrder: number }, items: { label: string; icon: string; viewKey: string; sortOrder: number }[]) {
  const placement = 'sidebar';
  const existing = await pool.query('SELECT id FROM "MenuGroup" WHERE key=$1 AND placement=$2 LIMIT 1', [group.key, placement]);
  let groupId: string = existing.rows[0]?.id;
  if (!groupId) {
    const r = await pool.query(
      'INSERT INTO "MenuGroup" (id, key, label, icon, status, "sortOrder", placement, "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW()) RETURNING id',
      [crypto.randomUUID(), group.key, group.label, group.icon, 'Active', group.sortOrder, placement]
    );
    groupId = r.rows[0].id;
  }
  for (const item of items) {
    const ex = await pool.query('SELECT id FROM "MenuItem" WHERE "groupId"=$1 AND "viewKey"=$2 AND "targetType"=$3 LIMIT 1', [groupId, item.viewKey, 'MODULE_VIEW']);
    if (ex.rows[0]) continue;
    await pool.query(
      'INSERT INTO "MenuItem" (id, "groupId", label, icon, "targetType", "viewKey", "moduleCode", status, "sortOrder", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())',
      [crypto.randomUUID(), groupId, item.label, item.icon, 'MODULE_VIEW', item.viewKey, moduleCode, 'Active', item.sortOrder]
    );
  }
}

export default async function installReportsModule({ pool, moduleCode, moduleName, moduleDescription }: InstallContext) {
  await ensureSystemModule(pool, moduleCode, moduleName, moduleDescription ?? null);

  await ensureRole(pool, ROLES.SUPER_ADMIN, 'Acceso total al sistema');
  await ensureRole(pool, ROLES.ADMINISTRADOR, 'Gestión administrativa');
  await ensureRole(pool, ROLES.ADMIN_SEDE,  'Administrador de una sede');
  await ensureRole(pool, ROLES.PROFESOR,    'Profesor / staff técnico');

  await grantPermission(pool, ROLES.SUPER_ADMIN, moduleCode, { canRead: true, canCreate: true, canWrite: true, canDelete: true });
  await grantPermission(pool, ROLES.ADMINISTRADOR, moduleCode, { canRead: true, canCreate: true, canWrite: true, canDelete: true });
  await grantPermission(pool, ROLES.ADMIN_SEDE,  moduleCode, { canRead: true, canCreate: true, canWrite: true, canDelete: true });
  await grantPermission(pool, ROLES.PROFESOR,    moduleCode, { canRead: true, canCreate: true, canWrite: true });

  await seedMenu(pool, moduleCode,
    { key: 'reports', label: 'Informes', icon: 'fa-file-lines', sortOrder: 45 },
    [{ label: 'Informes', icon: 'fa-file-lines', viewKey: 'Reports', sortOrder: 0 }]
  );
}
