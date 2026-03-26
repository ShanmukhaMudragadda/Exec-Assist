-- Make password nullable (Google-only auth — no passwords)
ALTER TABLE "User" ALTER COLUMN "password" DROP NOT NULL;

-- Add googleId for faster Google account lookup
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "googleId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_googleId_key" ON "User"("googleId");

-- Remove email/password-specific columns that are no longer needed
ALTER TABLE "User" DROP COLUMN IF EXISTS "emailVerifyToken";
ALTER TABLE "User" DROP COLUMN IF EXISTS "resetPasswordToken";
ALTER TABLE "User" DROP COLUMN IF EXISTS "resetPasswordExpiry";

-- Make invitation expiresAt nullable (no expiry on "you've been added" notifications)
ALTER TABLE "InitiativeInvitation" ALTER COLUMN "expiresAt" DROP NOT NULL;
