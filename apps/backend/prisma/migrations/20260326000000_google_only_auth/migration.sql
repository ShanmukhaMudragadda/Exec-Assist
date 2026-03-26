-- Drop password column (Google-only auth — passwords are not used)
ALTER TABLE "User" DROP COLUMN IF EXISTS "password";

-- Add googleId for Google account lookup
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "googleId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_googleId_key" ON "User"("googleId");

-- Remove legacy email/password-specific columns
ALTER TABLE "User" DROP COLUMN IF EXISTS "emailVerifyToken";
ALTER TABLE "User" DROP COLUMN IF EXISTS "resetPasswordToken";
ALTER TABLE "User" DROP COLUMN IF EXISTS "resetPasswordExpiry";

-- Make invitation expiresAt nullable (no expiry on "you've been added" notifications)
ALTER TABLE "InitiativeInvitation" ALTER COLUMN "expiresAt" DROP NOT NULL;

-- Drop invitation token column (no token-based acceptance flow anymore)
ALTER TABLE "InitiativeInvitation" DROP COLUMN IF EXISTS "token";
