import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'node:module';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(here, '..');
const repoRoot = path.resolve(apiRoot, '..', '..');

dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(apiRoot, '.env'), override: true });

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const ensureUserColumns = async (pool: pg.Pool) => {
  await pool.query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "language" TEXT');
  await pool.query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "accessCompanyIds" TEXT');
  await pool.query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sessionToken" TEXT');
  await pool.query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordResetToken" TEXT');
  await pool.query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordResetExpiresAt" TIMESTAMPTZ');
  await pool.query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT');
  await pool.query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "coverUrl" TEXT');
};

const listUserEmails = async (pool: pg.Pool) => {
  const result = await pool.query('SELECT email FROM "User" ORDER BY email ASC LIMIT 20');
  return result.rows.map((row) => String(row.email || '')).filter(Boolean);
};

const ensureFreePlan = async (prisma: InstanceType<typeof PrismaClient>) => {
  const existing = await prisma.subscriptionPlan.findFirst({ orderBy: { sortOrder: 'asc' } });
  if (existing) return existing;

  return prisma.subscriptionPlan.create({
    data: {
      code: 'FREE',
      name: 'Free',
      description: 'Plan gratuito por defecto ($0).',
      status: 'Active',
      sortOrder: 0,
      billingPeriod: 'Lifetime',
      priceCents: 0,
      currency: 'USD',
      trialDays: 0
    }
  });
};

const ensureOrganization = async (prisma: InstanceType<typeof PrismaClient>) => {
  const existing = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
  if (existing) return existing;

  const plan = await ensureFreePlan(prisma);
  return prisma.organization.create({
    data: {
      name: 'Default Organization',
      subscriptionPlanId: plan.id
    }
  });
};

const ensureCompany = async (prisma: InstanceType<typeof PrismaClient>, organizationId: string) => {
  const existing = await prisma.company.findFirst({
    where: { organizationId },
    orderBy: { createdAt: 'asc' }
  });
  if (existing) return existing;

  return prisma.company.create({
    data: {
      name: 'Main Company',
      organizationId
    }
  });
};

const ensureAdministratorRole = async (prisma: InstanceType<typeof PrismaClient>) => {
  let role = await prisma.role.findFirst({
    where: { name: { in: ['Administrator', 'Super Admin', 'Admin Sede'] } },
    orderBy: { createdAt: 'asc' }
  });
  if (role) return role;

  role = await prisma.role.create({
    data: {
      name: 'Administrator',
      description: 'Full access to everything'
    }
  });

  const modules = await prisma.systemModule.findMany();
  for (const mod of modules) {
    await prisma.permission.upsert({
      where: { roleId_moduleId: { roleId: role.id, moduleId: mod.id } },
      create: {
        roleId: role.id,
        moduleId: mod.id,
        canRead: true,
        canWrite: true,
        canCreate: true,
        canDelete: true
      },
      update: {
        canRead: true,
        canWrite: true,
        canCreate: true,
        canDelete: true
      }
    });
  }

  return role;
};

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error('[bootstrap] DATABASE_URL is required.');
    process.exit(1);
  }

  const email = String(process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@sinapsis.app')
    .trim()
    .toLowerCase();
  const password = String(process.env.BOOTSTRAP_ADMIN_PASSWORD || 'Admin1234');

  if (!email || !password) {
    console.error('[bootstrap] BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD are required.');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    await ensureUserColumns(pool);

    const existing = await pool.query('SELECT id, email FROM "User" WHERE LOWER(email) = $1 LIMIT 1', [email]);
    if (existing.rows[0]) {
      await pool.query('UPDATE "User" SET password = $1, "updatedAt" = NOW() WHERE id = $2', [
        password,
        existing.rows[0].id
      ]);
      console.log(`[bootstrap] Admin password updated for ${email}`);
      return;
    }

    const org = await ensureOrganization(prisma);
    const company = await ensureCompany(prisma, org.id);
    const role = await ensureAdministratorRole(prisma);

    await prisma.user.create({
      data: {
        email,
        firstName: 'Super',
        lastName: 'Admin',
        name: 'Super Admin',
        password,
        companyId: company.id,
        role: role.name,
        roleId: role.id
      }
    });

    console.log(`[bootstrap] Admin user created: ${email}`);
  } catch (error) {
    console.error('[bootstrap] Failed:', error);
    const emails = await listUserEmails(pool).catch(() => []);
    if (emails.length) {
      console.error('[bootstrap] Existing users in DB (use one of these or bootstrap a new email):');
      for (const userEmail of emails) console.error(`  - ${userEmail}`);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

void main();
