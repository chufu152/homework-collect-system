-- 假条作业类型：新增枚举值与每张假条的日期字段
ALTER TYPE "AssignmentType" ADD VALUE IF NOT EXISTS 'leave';
ALTER TABLE "SubmissionFile" ADD COLUMN "slipDate" TIMESTAMP(3);
