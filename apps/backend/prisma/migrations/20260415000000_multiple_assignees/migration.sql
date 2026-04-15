-- CreateTable: ActionAssignee (many-to-many between Action and User)
CREATE TABLE "ActionAssignee" (
    "actionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ActionAssignee_pkey" PRIMARY KEY ("actionId","userId")
);

-- CreateIndex
CREATE INDEX "ActionAssignee_userId_idx" ON "ActionAssignee"("userId");

-- AddForeignKey
ALTER TABLE "ActionAssignee" ADD CONSTRAINT "ActionAssignee_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "Action"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionAssignee" ADD CONSTRAINT "ActionAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing single assignees into the new table
INSERT INTO "ActionAssignee" ("actionId", "userId")
SELECT "id", "assigneeId"
FROM "Action"
WHERE "assigneeId" IS NOT NULL;

-- DropColumn: assigneeId from Action
ALTER TABLE "Action" DROP COLUMN "assigneeId";
