-- AlterTable
ALTER TABLE "WorkspaceInvitation" ADD COLUMN     "profile" TEXT;

-- AlterTable
ALTER TABLE "WorkspaceMember" ADD COLUMN     "profile" TEXT;

-- CreateTable
CREATE TABLE "WorkspaceEmailSettings" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "notifyOnTaskCreate" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnTaskAssign" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnTaskComplete" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnComment" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnDueDate" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceEmailSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceEmailSettings_workspaceId_key" ON "WorkspaceEmailSettings"("workspaceId");

-- AddForeignKey
ALTER TABLE "WorkspaceEmailSettings" ADD CONSTRAINT "WorkspaceEmailSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
