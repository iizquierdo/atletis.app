import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'node:module';
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const here = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(here, '..');
const repoRoot = path.resolve(apiRoot, '..', '..');

dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(apiRoot, '.env'), override: true });

// See server.ts: createRequire avoids Node 20 ESM/CJS issues with Prisma 7.
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

// Configuración para el nuevo Prisma 7 con driver adapters
async function main() {
    if (process.env.ALLOW_DESTRUCTIVE_SEED !== 'true') {
        console.log('[seed] aborted: this script wipes the DB before re-creating it.');
        console.log('[seed] To run it intentionally set ALLOW_DESTRUCTIVE_SEED=true.');
        console.log('[seed] For production / existing data use: pnpm bootstrap:admin');
        return;
    }

    console.log('--- Seeding Database ---')

    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    const adapter = new PrismaPg(pool)
    const prisma = new PrismaClient({ adapter })

    try {
        // Clear DB (ordenado por dependencias FK)
        await prisma.permission.deleteMany({});
        await prisma.user.deleteMany({});
        await prisma.role.deleteMany({});
        await prisma.systemModule.deleteMany({});
        await prisma.company.deleteMany({});
        await prisma.organization.deleteMany({});
        await prisma.subscriptionPlan.deleteMany({});
        await prisma.categoryItem.deleteMany({});
        await prisma.category.deleteMany({});
        await prisma.reference.deleteMany({});
        await prisma.core.deleteMany({});

        console.log('DB cleared');

        const freePlan = await prisma.subscriptionPlan.create({
            data: {
                id: '11111111-1111-4111-8111-111111111111',
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
        console.log('Plan de suscripción base:', freePlan.code);

        // 1. Crear Organización
        const org = await prisma.organization.create({
            data: {
                name: 'izk Labs',
                taxId: '30-71458922-4',
                email: 'contacto@sinapsis.app',
                address: 'Av. Libertador 1200, CABA',
                website: 'https://sinapsis.app',
                dateFormat: '2026/03/08',
                timeFormat: '2:19 AM',
                timezone: 'Australia/Adelaide',
                moneyFormat: '1,234.56',
                currencyPosition: '$ 100',
                defaultLanguage: 'English',
                subscriptionPlanId: freePlan.id
            },
        })
        console.log('Organización creada:', org.name)

        // 2. Crear Compañía (SaaS Multi-company)
        const company = await prisma.company.create({
            data: {
                name: 'Main Company',
                organizationId: org.id,
            },
        })
        console.log('Compañía creada:', company.name)

        // 3. Crear otra compañía
        const company2 = await prisma.company.create({
            data: {
                name: 'Sinapsis Logistics',
                organizationId: org.id,
            },
        })

        // 4. Crear Módulos
        console.log('Creando módulos...');
        const modules = [
            { name: 'Users', code: 'USERS', description: 'User management and permissions' },
            { name: 'Roles', code: 'ROLES', description: 'Role management' },
            { name: 'Modules', code: 'MODULES', description: 'System modules' },
            { name: 'Projects', code: 'PROJECTS', description: 'Project management' },
            { name: 'Inventory', code: 'INVENTORY', description: 'Inventory and stock' },
            { name: 'Finance', code: 'FINANCE', description: 'Accounting and invoices' },
        ];

        const createdModules = [];
        for (const m of modules) {
            const mod = await prisma.systemModule.create({ data: m });
            createdModules.push(mod);
            console.log('Módulo creado:', m.name);
        }

        // 5. Crear Roles y Permisos
        console.log('Creando roles...');
        const rolesData = [
            { name: 'Super Admin', description: 'Control total del tenant' },
            { name: 'Administrador', description: 'Gestión administrativa' },
            { name: 'Profesor', description: 'Acceso de instructor' },
        ];

        // Módulos del sistema (no operativos) — Administrador y Profesor tienen acceso restringido
        const SYSTEM_MODULE_CODES = ['ROLES', 'MODULES'];

        const createdRoles: any = {};
        for (const r of rolesData) {
            const role = await prisma.role.create({ data: r });
            createdRoles[r.name] = role;
            console.log('Rol creado:', r.name);

            for (const mod of createdModules) {
                const isSystemModule = SYSTEM_MODULE_CODES.includes(mod.code);

                let perms = { canRead: false, canWrite: false, canCreate: false, canDelete: false };

                if (r.name === 'Super Admin') {
                    // Acceso total a todo
                    perms = { canRead: true, canWrite: true, canCreate: true, canDelete: true };
                } else if (r.name === 'Administrador') {
                    // Acceso total en módulos operativos, solo lectura en módulos de sistema
                    perms = isSystemModule
                        ? { canRead: true, canWrite: false, canCreate: false, canDelete: false }
                        : { canRead: true, canWrite: true, canCreate: true, canDelete: true };
                } else if (r.name === 'Profesor') {
                    // Solo lectura en módulos de sistema, lectura + escritura en operativos
                    perms = isSystemModule
                        ? { canRead: false, canWrite: false, canCreate: false, canDelete: false }
                        : { canRead: true, canWrite: true, canCreate: false, canDelete: false };
                }

                await prisma.permission.create({
                    data: { roleId: role.id, moduleId: mod.id, ...perms }
                });
            }
        }

        // 6. Crear Usuarios iniciales
        const users = [
            { email: 'admin@sinapsis.app', firstName: 'Super', lastName: 'Admin', name: 'Super Admin', password: 'Admin1234', companyId: company.id, role: 'Super Admin', roleId: createdRoles['Super Admin'].id },
            { email: 'admin2@sinapsis.app', firstName: 'Admin', lastName: 'Demo', name: 'Admin Demo', password: 'Admin1234', companyId: company.id, role: 'Administrador', roleId: createdRoles['Administrador'].id },
            { email: 'profesor@sinapsis.app', firstName: 'Profesor', lastName: 'Demo', name: 'Profesor Demo', password: 'Profesor1234', companyId: company.id, role: 'Profesor', roleId: createdRoles['Profesor'].id },
        ];

        for (const u of users) {
            await prisma.user.create({ data: u });
            console.log('Usuario creado:', u.email);
        }

        // 5. Crear Categorías y sus Items para Dropdowns
        console.log('Creando categorías para dropdowns...');

        const typeCat = await prisma.category.create({
            data: {
                name: 'Company Type',
                code: 'COMPANY_TYPE',
                module: 'Company',
                description: 'Tipos de empresas vinculadas al sistema',
                items: {
                    create: [
                        { name: 'Subsidiary', code: 'SUBSIDIARY' },
                        { name: 'Branch', code: 'BRANCH' },
                        { name: 'Partner', code: 'PARTNER' },
                        { name: 'Client', code: 'CLIENT' },
                        { name: 'Vendor', code: 'VENDOR' },
                    ]
                }
            }
        });
        console.log('Categoría creada:', typeCat.name);

        const categoryCat = await prisma.category.create({
            data: {
                name: 'Company Category',
                code: 'COMPANY_CATEGORY',
                module: 'Company',
                description: 'Clasificación estratégica de empresas',
                items: {
                    create: [
                        { name: 'Platinum', code: 'PLATINUM' },
                        { name: 'Gold', code: 'GOLD' },
                        { name: 'Silver', code: 'SILVER' },
                        { name: 'Bronze', code: 'BRONZE' },
                    ]
                }
            }
        });
        console.log('Categoría creada:', categoryCat.name);

        // 6. Crear Referencia por defecto para Compañías y Usuarios
        console.log('Creando referencias por defecto...');
        await prisma.reference.create({
            data: {
                module: 'COMPANY_DEFAULT',
                code: 'COMPANY_DEFAULT',
                reference: 0,
                prefix: 'COM-',
                digits: 4
            }
        });

        await prisma.reference.create({
            data: {
                module: 'USER_DEFAULT',
                code: 'USER_DEFAULT',
                reference: 0,
                prefix: 'USR-',
                digits: 4
            }
        });

        await prisma.core.create({
            data: {
                id: 1,
                appName: 'Sinapsis CRM/ERP',
                dateFormat: '2026/03/08',
                timeFormat: '2:19 AM',
                timezone: 'Australia/Adelaide',
                moneyFormat: '1,234.56',
                currencyPosition: '$ 100',
                defaultLanguage: 'en',
                baseCurrency: 'USD'
            }
        });
        console.log('Core defaults creados');

        console.log('--- Seed finalizado con éxito! ---')

    } catch (e) {
        console.error('Error durante el seed:', e)
    } finally {
        await prisma.$disconnect()
        await pool.end()
    }
}

main()
