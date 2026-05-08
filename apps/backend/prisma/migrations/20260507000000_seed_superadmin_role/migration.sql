-- Set super-admin role on the dedicated EA account (no-op if account doesn't exist yet)
UPDATE "User" SET "role" = 'superadmin' WHERE "email" = 'eassist@forsysinc.com';
