-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('ACCOUNT', 'GUEST_NEW', 'GUEST_RENEW');

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "guestTokenHash" TEXT,
ADD COLUMN     "kind" "PaymentKind" NOT NULL DEFAULT 'ACCOUNT',
ADD COLUMN     "remnawaveUserId" TEXT,
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_guestTokenHash_key" ON "Payment"("guestTokenHash");
