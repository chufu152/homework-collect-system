-- Alter enum: 表单作业类型（PostgreSQL 枚举追加值）
ALTER TYPE "AssignmentType" ADD VALUE IF NOT EXISTS 'form';
