-- CreateEnum
CREATE TYPE "BillingMode" AS ENUM ('SEPARATE', 'CONSOLIDATED');

-- CreateEnum
CREATE TYPE "DiscountKind" AS ENUM ('NONE', 'STATIC', 'PROGRESSIVE', 'FAMILY_FIXED');

-- CreateEnum
CREATE TYPE "DiscountValueType" AS ENUM ('FIXED', 'PERCENT');

-- CreateEnum
CREATE TYPE "DiscountOverride" AS ENUM ('INHERIT', 'CUSTOM', 'NONE');

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "discountNote" TEXT,
ADD COLUMN     "familyChargeId" TEXT;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "familyId" TEXT,
ALTER COLUMN "email" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "familyDiscountKind" "DiscountKind" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "familyDiscountType" "DiscountValueType" NOT NULL DEFAULT 'PERCENT',
ADD COLUMN     "familyDiscountValue" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "guardianId" TEXT;

-- CreateTable
CREATE TABLE "Guardian" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "cpf" TEXT,
    "relation" TEXT,
    "studentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Guardian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Family" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "billingMode" "BillingMode" NOT NULL DEFAULT 'SEPARATE',
    "dueDay" INTEGER,
    "discountOverride" "DiscountOverride" NOT NULL DEFAULT 'INHERIT',
    "discountKind" "DiscountKind",
    "discountType" "DiscountValueType",
    "discountValue" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Family_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyCharge" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" DATE,
    "paymentMethod" "PaymentMethod",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FamilyCharge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Guardian_studentId_key" ON "Guardian"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Guardian_tenantId_email_key" ON "Guardian"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Guardian_tenantId_cpf_key" ON "Guardian"("tenantId", "cpf");

-- CreateIndex
CREATE UNIQUE INDEX "Family_guardianId_key" ON "Family"("guardianId");

-- CreateIndex
CREATE INDEX "Family_tenantId_idx" ON "Family"("tenantId");

-- CreateIndex
CREATE INDEX "FamilyCharge_tenantId_dueDate_idx" ON "FamilyCharge"("tenantId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "FamilyCharge_familyId_year_month_key" ON "FamilyCharge"("familyId", "year", "month");

-- CreateIndex
CREATE INDEX "Invoice_familyChargeId_idx" ON "Invoice"("familyChargeId");

-- CreateIndex
CREATE INDEX "Student_familyId_idx" ON "Student"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "User_guardianId_key" ON "User"("guardianId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Guardian"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guardian" ADD CONSTRAINT "Guardian_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guardian" ADD CONSTRAINT "Guardian_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Family" ADD CONSTRAINT "Family_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Family" ADD CONSTRAINT "Family_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Guardian"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyCharge" ADD CONSTRAINT "FamilyCharge_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyCharge" ADD CONSTRAINT "FamilyCharge_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_familyChargeId_fkey" FOREIGN KEY ("familyChargeId") REFERENCES "FamilyCharge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

