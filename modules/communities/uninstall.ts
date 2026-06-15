import type { Pool } from 'pg';
import { removeModuleMenu } from '@sinapsis/module-sdk-server';

interface UninstallContext {
  pool: Pool;
  moduleCode: string;
  moduleName: string;
  moduleDescription?: string | null;
  purgeData?: boolean;
}

export default async function uninstallCommunitiesModule(ctx: UninstallContext) {
  const { pool, moduleCode, purgeData = false } = ctx;

  await pool.query('UPDATE "SystemModule" SET status = $1, "updatedAt" = NOW() WHERE code = $2', ['Inactive', moduleCode]);
  await removeModuleMenu(pool, 'communities');

  if (!purgeData) return;

  await pool.query('DELETE FROM "CommunityPost"');
  await pool.query('DELETE FROM "CommunityMember"');
  await pool.query('DELETE FROM "Community"');
  await pool.query('DELETE FROM "Category" WHERE code = $1', ['COMMUNITY_POST_STATUS']);
}
