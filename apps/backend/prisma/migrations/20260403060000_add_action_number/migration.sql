-- Add actionNumber as a SERIAL column.
-- SERIAL automatically creates a sequence and assigns sequential values to ALL existing rows.
ALTER TABLE "Action" ADD COLUMN "actionNumber" SERIAL;

-- Add unique constraint
ALTER TABLE "Action" ADD CONSTRAINT "Action_actionNumber_key" UNIQUE ("actionNumber");
