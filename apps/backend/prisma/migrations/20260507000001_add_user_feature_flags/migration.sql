-- CreateTable
CREATE TABLE "UserFeatureFlag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserFeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserFeatureFlag_userId_idx" ON "UserFeatureFlag"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserFeatureFlag_userId_feature_key" ON "UserFeatureFlag"("userId", "feature");

-- AddForeignKey
ALTER TABLE "UserFeatureFlag" ADD CONSTRAINT "UserFeatureFlag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
