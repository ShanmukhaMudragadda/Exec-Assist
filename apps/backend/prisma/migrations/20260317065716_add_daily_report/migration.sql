-- AlterTable
ALTER TABLE "WorkspaceEmailSettings" ADD COLUMN     "dailyReportEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dailyReportTime" TEXT NOT NULL DEFAULT '08:00';
