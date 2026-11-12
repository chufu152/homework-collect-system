-- 每个班级独立管理密钥：存储 SHA-256 哈希；空串表示迁移前的历史班级，
-- 首次「导入班级」或回填脚本会写入哈希。
ALTER TABLE "Classroom" ADD COLUMN "teacherKeyHash" TEXT NOT NULL DEFAULT '';
