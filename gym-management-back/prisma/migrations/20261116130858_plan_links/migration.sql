-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "PlanDiscipline" (
    "planId" TEXT NOT NULL,
    "disciplineId" TEXT NOT NULL,

    CONSTRAINT "PlanDiscipline_pkey" PRIMARY KEY ("planId","disciplineId")
);

-- CreateTable
CREATE TABLE "PlanClassGroup" (
    "planId" TEXT NOT NULL,
    "classGroupId" TEXT NOT NULL,

    CONSTRAINT "PlanClassGroup_pkey" PRIMARY KEY ("planId","classGroupId")
);

-- AddForeignKey
ALTER TABLE "PlanDiscipline" ADD CONSTRAINT "PlanDiscipline_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanDiscipline" ADD CONSTRAINT "PlanDiscipline_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanClassGroup" ADD CONSTRAINT "PlanClassGroup_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanClassGroup" ADD CONSTRAINT "PlanClassGroup_classGroupId_fkey" FOREIGN KEY ("classGroupId") REFERENCES "ClassGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
