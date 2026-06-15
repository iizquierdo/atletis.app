import type { Pool } from 'pg';
import {
  ensureCategoryWithItems,
  ensureSystemModule,
  ensureRole,
  grantModulePermission,
  seedModuleMenu,
  ensureCoreReferenceTemplate,
  propagateReferenceTemplateToAllCompanies,
  NATACION_ROLES
} from '@sinapsis/module-sdk-server';

interface InstallContext {
  pool: Pool;
  moduleCode: string;
  moduleName: string;
  moduleDescription?: string | null;
}

export default async function installStudentsModule(ctx: InstallContext) {
  const { pool, moduleCode, moduleName, moduleDescription } = ctx;

  await ensureSystemModule(pool, { code: moduleCode, name: moduleName, description: moduleDescription });

  await ensureCategoryWithItems(pool, {
    code: 'STUDENT_GENDER',
    name: 'Student Gender',
    module: 'Students',
    description: 'Géneros de alumno',
    items: ['MALE', 'FEMALE', 'NON_BINARY', 'OTHER', 'UNSPECIFIED']
  });
  await ensureCategoryWithItems(pool, {
    code: 'STUDENT_STATUS',
    name: 'Student Status',
    module: 'Students',
    description: 'Estados de alumno',
    items: ['ACTIVE', 'INACTIVE']
  });
  await ensureCategoryWithItems(pool, {
    code: 'REPORT_TYPE',
    name: 'Student Report Types',
    module: 'Students',
    description: 'Tipos de informe',
    items: ['PROGRESS', 'OBSERVATION', 'LEVEL_CHANGE', 'RECOMMENDATION']
  });
  await ensureCategoryWithItems(pool, {
    code: 'REPORT_STATUS',
    name: 'Student Report Status',
    module: 'Students',
    description: 'Estados de informe',
    items: ['DRAFT', 'PUBLISHED', 'ARCHIVED']
  });
  await ensureCategoryWithItems(pool, {
    code: 'REPORT_VISIBILITY',
    name: 'Student Report Visibility',
    module: 'Students',
    description: 'Visibilidad de informe',
    items: ['TUTORS_ONLY', 'INTERNAL_STAFF']
  });

  // Auto-incrementing student code (ALU-000001) per company.
  await ensureCoreReferenceTemplate(pool, { module: 'STUDENTS', code: 'STUDENTS', prefix: 'ALU-', digits: 6, reference: 0 });
  await propagateReferenceTemplateToAllCompanies(pool, 'STUDENTS', 'STUDENTS');

  await ensureRole(pool, NATACION_ROLES.SUPER_ADMIN, 'Acceso total al sistema');
  await ensureRole(pool, NATACION_ROLES.ADMIN_SEDE, 'Administrador de una sede');
  await ensureRole(pool, NATACION_ROLES.PROFESOR, 'Profesor / staff técnico');
  await ensureRole(pool, NATACION_ROLES.TUTOR, 'Tutor / responsable de alumno');

  // Coarse module access; fine-grained scoping (own students, who can edit the
  // student record vs. only reports/messages) is enforced in the server.
  await grantModulePermission(pool, { roleName: NATACION_ROLES.SUPER_ADMIN, moduleCode, canRead: true, canCreate: true, canWrite: true, canDelete: true });
  await grantModulePermission(pool, { roleName: NATACION_ROLES.ADMIN_SEDE, moduleCode, canRead: true, canCreate: true, canWrite: true, canDelete: true });
  await grantModulePermission(pool, { roleName: NATACION_ROLES.PROFESOR, moduleCode, canRead: true, canCreate: true, canWrite: true });
  await grantModulePermission(pool, { roleName: NATACION_ROLES.TUTOR, moduleCode, canRead: true, canCreate: true, canWrite: true });

  await seedModuleMenu(pool, {
    moduleCode,
    group: { key: 'students', label: 'Alumnos', icon: 'fa-user-graduate', sortOrder: 30 },
    items: [{ label: 'Alumnos', icon: 'fa-user-graduate', viewKey: 'Students', sortOrder: 0 }]
  });
}
