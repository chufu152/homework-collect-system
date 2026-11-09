-- Shared DDL for PGlite-backed E2E tests.
-- Mirrors apps/api/prisma/schema.prisma. Keep this file in sync whenever a model,
-- enum, unique constraint or index changes; both E2E suites execute it verbatim.

CREATE TYPE "AssignmentType" AS ENUM ('online', 'offline', 'checkin', 'relay');
CREATE TYPE "AssignmentState" AS ENUM ('draft', 'published', 'closed');
CREATE TYPE "SubmissionMode" AS ENUM ('text', 'file', 'both');
CREATE TYPE "GroupStrategy" AS ENUM ('manual', 'balanced_random');

CREATE TABLE "DemoState" ("id" TEXT PRIMARY KEY, "classId" TEXT NOT NULL UNIQUE, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE "Classroom" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE "Student" ("id" TEXT PRIMARY KEY, "classId" TEXT NOT NULL REFERENCES "Classroom"("id") ON DELETE CASCADE, "studentNo" TEXT NOT NULL, "name" TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE("classId", "studentNo"));
CREATE TABLE "StudentGroup" ("id" TEXT PRIMARY KEY, "classId" TEXT NOT NULL REFERENCES "Classroom"("id") ON DELETE CASCADE, "name" TEXT NOT NULL, "strategy" "GroupStrategy" NOT NULL DEFAULT 'manual', "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE("classId", "name"));
CREATE TABLE "GroupMembership" ("groupId" TEXT NOT NULL REFERENCES "StudentGroup"("id") ON DELETE CASCADE, "studentId" TEXT NOT NULL REFERENCES "Student"("id") ON DELETE CASCADE, PRIMARY KEY("groupId", "studentId"));
CREATE TABLE "Assignment" ("id" TEXT PRIMARY KEY, "classId" TEXT NOT NULL REFERENCES "Classroom"("id") ON DELETE CASCADE, "title" TEXT NOT NULL, "type" "AssignmentType" NOT NULL, "state" "AssignmentState" NOT NULL DEFAULT 'draft', "instructions" TEXT NOT NULL DEFAULT '', "dueAt" TIMESTAMPTZ, "submissionMode" "SubmissionMode" NOT NULL DEFAULT 'both', "allowedTypes" TEXT[] NOT NULL DEFAULT ARRAY['pdf','doc','docx','jpg','jpeg','png','txt','zip']::TEXT[], "maxFileCount" INTEGER NOT NULL DEFAULT 5, "maxFileBytes" INTEGER NOT NULL DEFAULT 20971520, "shareCode" TEXT NOT NULL UNIQUE, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "publishedAt" TIMESTAMPTZ, "closedAt" TIMESTAMPTZ);
CREATE TABLE "AssignmentTarget" ("assignmentId" TEXT NOT NULL REFERENCES "Assignment"("id") ON DELETE CASCADE, "studentId" TEXT NOT NULL REFERENCES "Student"("id") ON DELETE CASCADE, PRIMARY KEY("assignmentId", "studentId"));
CREATE TABLE "Submission" ("id" TEXT PRIMARY KEY, "assignmentId" TEXT NOT NULL REFERENCES "Assignment"("id") ON DELETE CASCADE, "studentId" TEXT NOT NULL REFERENCES "Student"("id") ON DELETE RESTRICT, "receiptCode" TEXT NOT NULL UNIQUE, "textContent" TEXT NOT NULL DEFAULT '', "submittedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "version" INTEGER NOT NULL DEFAULT 1, UNIQUE("assignmentId", "studentId"));
CREATE TABLE "SubmissionVersion" ("id" TEXT PRIMARY KEY, "submissionId" TEXT NOT NULL REFERENCES "Submission"("id") ON DELETE CASCADE, "version" INTEGER NOT NULL, "textContent" TEXT NOT NULL DEFAULT '', "submittedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE("submissionId", "version"));
CREATE TABLE "SubmissionFile" ("id" TEXT PRIMARY KEY, "versionId" TEXT NOT NULL REFERENCES "SubmissionVersion"("id") ON DELETE CASCADE, "storageKey" TEXT NOT NULL UNIQUE, "originalName" TEXT NOT NULL, "contentType" TEXT NOT NULL, "sizeBytes" INTEGER NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE "Feedback" ("id" TEXT PRIMARY KEY, "submissionId" TEXT NOT NULL UNIQUE REFERENCES "Submission"("id") ON DELETE CASCADE, "score" DOUBLE PRECISION, "feedbackText" TEXT NOT NULL, "reviewedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE "CompletionRecord" ("assignmentId" TEXT NOT NULL REFERENCES "Assignment"("id") ON DELETE CASCADE, "studentId" TEXT NOT NULL REFERENCES "Student"("id") ON DELETE CASCADE, "completed" BOOLEAN NOT NULL DEFAULT FALSE, "completedAt" TIMESTAMPTZ, PRIMARY KEY("assignmentId", "studentId"));
CREATE TABLE "CheckIn" ("assignmentId" TEXT NOT NULL REFERENCES "Assignment"("id") ON DELETE CASCADE, "studentId" TEXT NOT NULL REFERENCES "Student"("id") ON DELETE CASCADE, "checkedInAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY("assignmentId", "studentId"));
CREATE TABLE "RelayEntry" ("id" TEXT PRIMARY KEY, "assignmentId" TEXT NOT NULL REFERENCES "Assignment"("id") ON DELETE CASCADE, "studentId" TEXT NOT NULL REFERENCES "Student"("id") ON DELETE CASCADE, "position" INTEGER NOT NULL, "content" TEXT NOT NULL DEFAULT '', "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE("assignmentId", "studentId"), UNIQUE("assignmentId", "position"));
