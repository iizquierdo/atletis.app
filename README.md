<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Sinapsis CRM/ERP

Monorepo pnpm con frontend y backend separados.

```
apps/
  web/            Vite + React 19 (UI / panel principal)
  api/            Express + Prisma (HTTP API)
  pwa-parent/     PWA de padres/tutores (servicio independiente, :13510)
  pwa-professor/  PWA de profesores (servicio independiente, :13511)
packages/
  shared-types/         Tipos compartidos entre web y api
  module-sdk-client/    Contrato + helpers para la mitad UI de los módulos
  module-sdk-server/    Helpers de tenant, referencias, mailing para módulos
modules/
  <name>/               Plug-and-play: client/ + server/ + migrations/ + install.ts + module.json
```

## Prerrequisitos

- Node.js ≥ 20
- pnpm ≥ 10 (`corepack enable` o `npm i -g pnpm`)
- Docker (para Postgres)

## Arranque

```bash
docker compose up -d
pnpm install
pnpm prisma:migrate         # crea/actualiza el schema
pnpm prisma:seed            # opcional, datos iniciales
pnpm dev                    # arranca web (13509) y api (14000) en paralelo
```

Sólo el front: `pnpm dev:web` · Sólo el back: `pnpm dev:api`.

PWAs (servicios independientes, cada una en su puerto, proxyan `/api` y `/storage` a la API):

```bash
pnpm dev:pwa-parent      # padres/tutores  → http://localhost:13510
pnpm dev:pwa-professor   # profesores      → http://localhost:13511
```

La **PWA de padres** ya está re-cableada a la API Sinapsis: login (`/api/auth/login` +
`/api/auth/session`), alumnos/informes/conversaciones (`/api/students/*`), recursos
(`/api/disciplines/*`) y comunidades (`/api/communities/*`). Todo el mapeo de formas vive
en `apps/pwa-parent/src/lib/data.ts`. Login como **tutor** (ej. `tutor.demo@natacion.local`
/ `Demo1234`): ve solo sus alumnos asignados, sus informes publicados y su mensajería.

La **PWA de profesores** es un scaffold (verifica conectividad); sus pantallas reales
quedan pendientes.

El dev server de Vite proxea `/api` y `/storage` hacia `http://localhost:14000` (configurable con `VITE_API_PROXY_TARGET`).

## Sistema de módulos (plug-and-play)

Cada módulo vive en `modules/<module-name>` y contiene:

- `module.json` (manifest)
- `migrations/*.sql` (DB migrations específicas del módulo)
- `install.ts` / `uninstall.ts` (hooks de seed/cleanup)
- `client/` (UI: importa `@sinapsis/module-sdk-client`)
- `server/` (API: importa `@sinapsis/module-sdk-server`)

Comandos disponibles (se delegan a `apps/api`):

```bash
pnpm module:list
pnpm module:install -- tasks
pnpm module:status -- tasks
pnpm module:uninstall -- tasks
pnpm module:uninstall -- tasks --purge
```

- `install` aplica sólo las migraciones pendientes (registradas en `_module_migrations`).
- `uninstall` sin `--purge` desactiva el módulo pero conserva los datos.
- `uninstall --purge` elimina los datos/artefactos.

## Módulos de gestión deportiva (Ecosistema)

Portados desde "Ecosistema Digital V2" como módulos nativos del framework. Cada
**Sede** se modela como una `Company` (la multi-tenancy nativa); el alcance de un
`Admin Sede` = su `companyId` (+ `accessCompanyIds` para multi-sede).

| Módulo | Code | Qué gestiona |
|---|---|---|
| Disciplinas | `DISCIPLINES` | Disciplinas (catálogo org-wide), niveles ordenables y biblioteca de recursos (con visibilidad). |
| Alumnos | `STUDENTS` | Ficha de alumno, inscripción a disciplinas/niveles, asignación de profesores/tutores, informes y mensajería (conversaciones por alumno). |
| Comunidades | `COMMUNITIES` | Comunidades por sede, miembros (alumnos) y publicaciones. |

Instalación (corre migraciones + siembra categorías, roles, permisos y menú):

```bash
pnpm --filter @sinapsis/api run module:install disciplines
pnpm --filter @sinapsis/api run module:install students
pnpm --filter @sinapsis/api run module:install communities
```

> Nota: el wrapper raíz `pnpm module:install -- <code>` duplica el separador `--`;
> usá la forma `--filter` de arriba.

### Roles y permisos (RBAC)

El install de cada módulo crea (idempotente) los roles **Super Admin**, **Admin Sede**,
**Profesor** y **Tutor**, y les asigna permisos por módulo (`Permission`). El acceso
grueso (leer/crear/editar/borrar por módulo) lo resuelve el middleware del framework;
el **scoping fino** vive en el server de cada módulo (resuelto desde el header
`X-User-Id`):

- **Super Admin**: acceso total.
- **Admin Sede**: alcance a su(s) compañía(s).
- **Profesor**: solo alumnos donde está asignado (`StudentTeacher`); puede crear informes/conversaciones.
- **Tutor**: solo alumnos vinculados (`StudentTutor`); ve informes `PUBLISHED`/`TUTORS_ONLY` y participa en conversaciones.

Asigná el rol a cada usuario desde el ABM de Usuarios del panel. Los módulos aparecen
en el sidebar automáticamente (el install siembra su `MenuGroup`/`MenuItem`).

## Convenciones UI

- Los formularios de creación deben abrirse en diálogos modales.
- Ver [AGENTS.md](./AGENTS.md) para la regla y el checklist.
