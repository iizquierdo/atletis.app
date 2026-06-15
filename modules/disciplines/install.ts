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

export default async function installDisciplinesModule(ctx: InstallContext) {
  const { pool, moduleCode, moduleName, moduleDescription } = ctx;

  await ensureSystemModule(pool, { code: moduleCode, name: moduleName, description: moduleDescription });

  await ensureCategoryWithItems(pool, {
    code: 'DISCIPLINE_RESOURCE_TYPE',
    name: 'Discipline Resource Types',
    module: 'Disciplines',
    description: 'Tipos de recurso de la biblioteca de disciplinas',
    items: ['PEDAGOGICAL_MATERIAL', 'EXERCISE_VIDEO', 'TOOLS', 'WORK_GUIDELINES', 'GENERAL_FILE']
  });

  await ensureCategoryWithItems(pool, {
    code: 'DISCIPLINE_RESOURCE_VISIBILITY',
    name: 'Discipline Resource Visibility',
    module: 'Disciplines',
    description: 'Visibilidad de los recursos de disciplinas',
    items: ['ADMIN_ONLY', 'STAFF_ONLY', 'MEMBERS_ONLY', 'PUBLIC']
  });

  // Roles del dominio + permisos (acceso grueso; el scoping fino vive en el server).
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
    group: { key: 'disciplines', label: 'Disciplinas', icon: 'fa-dumbbell', sortOrder: 40 },
    items: [{ label: 'Disciplinas', icon: 'fa-dumbbell', viewKey: 'Disciplines', sortOrder: 0 }]
  });
}
