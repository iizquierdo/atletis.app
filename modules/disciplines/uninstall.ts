import type { Pool } from 'pg';
import { removeModuleMenu } from '@sinapsis/module-sdk-server';

interface UninstallContext {
  pool: Pool;
  moduleCode: string;
  moduleName: string;
  moduleDescription?: string | null;
  purgeData?: boolean;
}

export default async function uninstallDisciplinesModule(ctx: UninstallContext) {
  const { pool, moduleCode, purgeData = false } = ctx;

  await pool.query('UPDATE "SystemModule" SET status = $1, "updatedAt" = NOW() WHERE code = $2', ['Inactive', moduleCode]);
  await removeModuleMenu(pool, 'disciplines');

  if (!purgeData) return;

  await pool.query('DELETE FROM "DisciplineResource"');
  await pool.query('DELETE FROM "DisciplineLevel"');
  await pool.query('DELETE FROM "Discipline"');
  await pool.query('DELETE FROM "Category" WHERE code = ANY($1)', [['DISCIPLINE_RESOURCE_TYPE', 'DISCIPLINE_RESOURCE_VISIBILITY']]);
}
