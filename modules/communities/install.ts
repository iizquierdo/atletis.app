import type { Pool } from 'pg';
import {
  ensureCategoryWithItems,
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

export default async function installCommunitiesModule(ctx: InstallContext) {
  const { pool, moduleCode, moduleName, moduleDescription } = ctx;

  await ensureSystemModule(pool, { code: moduleCode, name: moduleName, description: moduleDescription });

  await ensureCategoryWithItems(pool, {
    code: 'COMMUNITY_POST_STATUS',
    name: 'Community Post Status',
    module: 'Communities',
    description: 'Estados de publicación de comunidad',
    items: ['DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED']
  });

  await ensureRole(pool, NATACION_ROLES.SUPER_ADMIN, 'Acceso total al sistema');
  await ensureRole(pool, NATACION_ROLES.ADMIN_SEDE, 'Administrador de una sede');
  await ensureRole(pool, NATACION_ROLES.PROFESOR, 'Profesor / staff técnico');
  await ensureRole(pool, NATACION_ROLES.TUTOR, 'Tutor / responsable de alumno');

  await grantModulePermission(pool, { roleName: NATACION_ROLES.SUPER_ADMIN, moduleCode, canRead: true, canCreate: true, canWrite: true, canDelete: true });
  await grantModulePermission(pool, { roleName: NATACION_ROLES.ADMIN_SEDE, moduleCode, canRead: true, canCreate: true, canWrite: true, canDelete: true });
  await grantModulePermission(pool, { roleName: NATACION_ROLES.PROFESOR, moduleCode, canRead: true });
  await grantModulePermission(pool, { roleName: NATACION_ROLES.TUTOR, moduleCode, canRead: true });

  await seedModuleMenu(pool, {
    moduleCode,
    group: { key: 'communities', label: 'Comunidades', icon: 'fa-users-rectangle', sortOrder: 35 },
    items: [{ label: 'Comunidades', icon: 'fa-users-rectangle', viewKey: 'Communities', sortOrder: 0 }]
  });
}
