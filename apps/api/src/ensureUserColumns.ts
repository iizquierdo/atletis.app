import type pg from 'pg';

export const ensureUserColumns = async (pool: pg.Pool) => {
  await pool.query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "language" TEXT');
  await pool.query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "accessCompanyIds" TEXT');
  await pool.query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sessionToken" TEXT');
  await pool.query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordResetToken" TEXT');
  await pool.query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordResetExpiresAt" TIMESTAMPTZ');
  await pool.query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT');
  await pool.query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "coverUrl" TEXT');
};
