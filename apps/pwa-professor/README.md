# PWA Professor

App PWA para profesores — **servicio independiente** dentro del monorepo Sinapsis.

```bash
pnpm dev:pwa-professor      # arranca en http://localhost:13511
```

Proxea `/api` y `/storage` hacia la API Sinapsis (`http://localhost:14000` por defecto,
configurable con `VITE_API_PROXY_TARGET`).

Estado: scaffold mínimo (verifica conectividad con la API). Las pantallas reales
(alumnos asignados, informes, asistencia) están pendientes de implementación contra
la API de módulos (`/api/students`, etc.).
