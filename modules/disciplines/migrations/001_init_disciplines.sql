-- Disciplines module: org-wide catalog of sport disciplines, their skill levels
-- and a resource library. No companyId: the catalog is shared across all sedes.

CREATE TABLE IF NOT EXISTS "Discipline" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Discipline_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Discipline_name_key" ON "Discipline"("name");
CREATE INDEX IF NOT EXISTS "Discipline_active_idx" ON "Discipline"("active");

CREATE TABLE IF NOT EXISTS "DisciplineLevel" (
    "id" TEXT NOT NULL,
    "disciplineId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "levelOrder" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DisciplineLevel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DisciplineLevel_disciplineId_name_key" ON "DisciplineLevel"("disciplineId", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "DisciplineLevel_disciplineId_order_key" ON "DisciplineLevel"("disciplineId", "levelOrder");
CREATE INDEX IF NOT EXISTS "DisciplineLevel_disciplineId_idx" ON "DisciplineLevel"("disciplineId");

CREATE TABLE IF NOT EXISTS "DisciplineResource" (
    "id" TEXT NOT NULL,
    "disciplineId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'GENERAL_FILE',
    "resourceUrl" TEXT,
    "storageKey" TEXT,
    "thumbnailUrl" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'STAFF_ONLY',
    "publishedAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DisciplineResource_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DisciplineResource_disciplineId_idx" ON "DisciplineResource"("disciplineId", "active");
CREATE INDEX IF NOT EXISTS "DisciplineResource_visibility_idx" ON "DisciplineResource"("visibility");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Discipline_createdById_fkey') THEN
        ALTER TABLE "Discipline" ADD CONSTRAINT "Discipline_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Discipline_updatedById_fkey') THEN
        ALTER TABLE "Discipline" ADD CONSTRAINT "Discipline_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DisciplineLevel_disciplineId_fkey') THEN
        ALTER TABLE "DisciplineLevel" ADD CONSTRAINT "DisciplineLevel_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DisciplineResource_disciplineId_fkey') THEN
        ALTER TABLE "DisciplineResource" ADD CONSTRAINT "DisciplineResource_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DisciplineResource_createdById_fkey') THEN
        ALTER TABLE "DisciplineResource" ADD CONSTRAINT "DisciplineResource_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DisciplineResource_updatedById_fkey') THEN
        ALTER TABLE "DisciplineResource" ADD CONSTRAINT "DisciplineResource_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
