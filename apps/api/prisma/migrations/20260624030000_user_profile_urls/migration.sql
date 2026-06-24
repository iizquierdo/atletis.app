-- Optional profile URLs (read by getNormalizedUserById at login/session).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "coverUrl" TEXT;
