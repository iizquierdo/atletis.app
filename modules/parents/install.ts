import type { Pool } from 'pg';
import {
  ensureSystemModule,
  ensureRole,
  grantModulePermission,
  seedModuleMenu,
  NATACION_ROLES
} from '@sinapsis/module-sdk-server';

interface InstallContext {
  pool: Pool;
  moduleCode: string;
  moduleName: string;
  moduleDescription?: string | null;
}

export default async function installParentsModule(ctx: InstallContext) {
  const { pool, moduleCode, moduleName, moduleDescription } = ctx;

  await ensureSystemModule(pool, { code: moduleCode, name: moduleName, description: moduleDescription });

  // A "Padre" is a User with the Tutor role; ensure the extra contact columns exist.
  await pool.query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phone" TEXT');
  await pool.query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "document" TEXT');

  await ensureRole(pool, NATACION_ROLES.SUPER_ADMIN, 'Acceso total al sistema');
  await ensureRole(pool, NATACION_ROLES.ADMINISTRADOR, 'Gestión administrativa');
  await ensureRole(pool, NATACION_ROLES.ADMIN_SEDE, 'Administrador de una sede');
  await ensureRole(pool, NATACION_ROLES.TUTOR, 'Tutor / responsable de alumno');

  // Only staff (Super Admin / Administrador / Admin Sede) manage parents.
  await grantModulePermission(pool, { roleName: NATACION_ROLES.SUPER_ADMIN, moduleCode, canRead: true, canCreate: true, canWrite: true, canDelete: true });
  await grantModulePermission(pool, { roleName: NATACION_ROLES.ADMINISTRADOR, moduleCode, canRead: true, canCreate: true, canWrite: true, canDelete: true });
  await grantModulePermission(pool, { roleName: NATACION_ROLES.ADMIN_SEDE, moduleCode, canRead: true, canCreate: true, canWrite: true, canDelete: true });

  await seedModuleMenu(pool, {
    moduleCode,
    group: { key: 'parents', label: 'Padres', icon: 'fa-people-roof', sortOrder: 31 },
    items: [{ label: 'Padres', icon: 'fa-people-roof', viewKey: 'Parents', sortOrder: 0 }]
  });
}
