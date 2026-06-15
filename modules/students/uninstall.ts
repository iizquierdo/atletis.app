import type { Pool } from 'pg';
import { removeModuleMenu } from '@sinapsis/module-sdk-server';

interface UninstallContext {
  pool: Pool;
  moduleCode: string;
  moduleName: string;
  moduleDescription?: string | null;
  purgeData?: boolean;
}

export default async function uninstallStudentsModule(ctx: UninstallContext) {
  const { pool, moduleCode, purgeData = false } = ctx;

  await pool.query('UPDATE "SystemModule" SET status = $1, "updatedAt" = NOW() WHERE code = $2', ['Inactive', moduleCode]);
  await removeModuleMenu(pool, 'students');

  if (!purgeData) return;

  // Children first (FK order). Conversation/Report children cascade, but be explicit.
  await pool.query('DELETE FROM "MessageRead"');
  await pool.query('DELETE FROM "Message"');
  await pool.query('DELETE FROM "ConversationParticipant"');
  await pool.query('DELETE FROM "Conversation"');
  await pool.query('DELETE FROM "StudentReportRecipient"');
  await pool.query('DELETE FROM "StudentReport"');
  await pool.query('DELETE FROM "StudentTeacher"');
  await pool.query('DELETE FROM "StudentTutor"');
  await pool.query('DELETE FROM "StudentDiscipline"');
  await pool.query('DELETE FROM "Student"');
  await pool.query('DELETE FROM "Category" WHERE code = ANY($1)', [['STUDENT_GENDER', 'STUDENT_STATUS', 'REPORT_TYPE', 'REPORT_STATUS', 'REPORT_VISIBILITY']]);
  await pool.query('DELETE FROM "Reference" WHERE module = $1', ['STUDENTS']);
}
