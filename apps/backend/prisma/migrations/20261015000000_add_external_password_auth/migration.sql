-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isExternal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "passwordHash" TEXT,
ADD COLUMN     "passwordTokenHash" TEXT,
ADD COLUMN     "passwordTokenExpiry" TIMESTAMP(3),
ADD COLUMN     "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lockedUntil" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "User_passwordTokenHash_key" ON "User"("passwordTokenHash");

-- Backfill: placeholder users created by invites who have never signed in with Google
-- and are outside the staff domain are external.
UPDATE "User" SET "isExternal" = true
WHERE "googleId" IS NULL AND lower("email") NOT LIKE '%@forsysinc.com';
