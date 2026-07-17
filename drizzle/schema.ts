import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  smallserial,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name"),
  active: boolean("active").notNull().default(true),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  publishingSuspendedAt: timestamp("publishing_suspended_at", { withTimezone: true }),
  contributorProbationUntil: timestamp("contributor_probation_until", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt()
});

export const contributorApplications = pgTable("contributor_applications", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicantId: uuid("applicant_id").notNull().unique().references(() => profiles.id, { onDelete: "cascade" }),
  targetLanguages: text("target_languages").array().notNull(),
  experience: text("experience").notNull(),
  samplePlan: text("sample_plan").notNull(),
  state: text("state").notNull().default("pending"),
  reviewerNote: text("reviewer_note"),
  reviewedBy: uuid("reviewed_by").references(() => profiles.id, { onDelete: "set null" }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  updatedAt: updatedAt()
}, (table) => [index("contributor_applications_queue_idx").on(table.state, table.submittedAt)]);

export const protectedAdministrators = pgTable("protected_administrators", {
  userId: uuid("user_id").primaryKey().references(() => profiles.id, { onDelete: "restrict" }),
  bootstrapEmail: text("bootstrap_email").notNull().unique(),
  reason: text("reason").notNull(),
  createdAt: createdAt()
});

export const roles = pgTable("roles", {
  id: smallserial("id").primaryKey(),
  name: text("name").notNull().unique()
}, (table) => [check("roles_name_check", sql`${table.name} in ('user','contributor','moderator','admin','super_admin')`)]);

export const userRoles = pgTable("user_roles", {
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  roleId: smallint("role_id").notNull().references(() => roles.id, { onDelete: "restrict" }),
  grantedBy: uuid("granted_by").references(() => profiles.id, { onDelete: "set null" }),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  version: integer("version").notNull().default(1)
}, (table) => [
  primaryKey({ columns: [table.userId, table.roleId] }),
  index("user_roles_active_idx").on(table.userId, table.expiresAt, table.suspendedAt)
]);

export const supportedLanguages = pgTable("supported_languages", {
  code: text("code").primaryKey(),
  label: text("label").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt()
});

export const moderatorLanguageAssignments = pgTable("moderator_language_assignments", {
  moderatorId: uuid("moderator_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  languageCode: text("language_code").notNull().references(() => supportedLanguages.code, { onDelete: "restrict" }),
  assignedBy: uuid("assigned_by").notNull().references(() => profiles.id, { onDelete: "restrict" }),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  version: integer("version").notNull().default(1)
}, (table) => [primaryKey({ columns: [table.moderatorId, table.languageCode] })]);

export const submissions = pgTable("submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  creatorId: uuid("creator_id").notNull().references(() => profiles.id, { onDelete: "restrict" }),
  targetLanguage: text("target_language").notNull().references(() => supportedLanguages.code),
  baseLanguage: text("base_language").notNull().references(() => supportedLanguages.code),
  title: text("title").notNull(),
  state: text("state").notNull(),
  currentVersion: integer("current_version").notNull(),
  rowVersion: integer("row_version").notNull().default(1),
  archivedFromState: text("archived_from_state"),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (table) => [
  index("submissions_queue_idx").on(table.targetLanguage, table.state, table.createdAt),
  index("submissions_creator_idx").on(table.creatorId, table.createdAt)
]);

export const submissionVersions = pgTable("submission_versions", {
  submissionId: uuid("submission_id").notNull().references(() => submissions.id, { onDelete: "restrict" }),
  version: integer("version").notNull(),
  sourceDraftRevision: integer("source_draft_revision").notNull(),
  canonicalJson: jsonb("canonical_json").notNull(),
  contentHash: text("content_hash").notNull(),
  schemaVersion: integer("schema_version").notNull(),
  generationSource: text("generation_source").notNull(),
  creationMethod: text("creation_method").notNull().default("ai"),
  possibleDuplicate: boolean("possible_duplicate").notNull().default(false),
  contributorNote: text("contributor_note"),
  duplicateMatchSubmissionId: uuid("duplicate_match_submission_id"),
  duplicateSimilarity: text("duplicate_similarity"),
  duplicateReasons: jsonb("duplicate_reasons").notNull().default([]),
  promptTemplateVersion: text("prompt_template_version"),
  creatorConfirmed: boolean("creator_confirmed").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  primaryKey({ columns: [table.submissionId, table.version] }),
  uniqueIndex("submission_versions_hash_unique").on(table.submissionId, table.contentHash),
  check("submission_versions_version_check", sql`${table.version} > 0`)
]);

export const moderationAssignments = pgTable("moderation_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  submissionId: uuid("submission_id").notNull(),
  submissionVersion: integer("submission_version").notNull(),
  moderatorId: uuid("moderator_id").notNull().references(() => profiles.id, { onDelete: "restrict" }),
  assignedBy: uuid("assigned_by").notNull().references(() => profiles.id, { onDelete: "restrict" }),
  state: text("state").notNull().default("active"),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  releasedAt: timestamp("released_at", { withTimezone: true })
}, (table) => [
  foreignKey({ columns: [table.submissionId, table.submissionVersion], foreignColumns: [submissionVersions.submissionId, submissionVersions.version] }).onDelete("restrict"),
  uniqueIndex("moderation_one_active_idx").on(table.submissionId).where(sql`${table.state} = 'active'`),
  index("moderation_workload_idx").on(table.moderatorId, table.state, table.assignedAt)
]);

export const reviewerFeedback = pgTable("reviewer_feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  submissionId: uuid("submission_id").notNull(),
  submissionVersion: integer("submission_version").notNull(),
  authorId: uuid("author_id").notNull().references(() => profiles.id, { onDelete: "restrict" }),
  sentenceIndex: integer("sentence_index"),
  lessonIndex: integer("lesson_index"),
  targetType: text("target_type").notNull().default("sentence"),
  targetPath: text("target_path"),
  visibility: text("visibility").notNull().default("contributor"),
  category: text("category").notNull(),
  body: text("body").notNull(),
  suggestedPatch: jsonb("suggested_patch"),
  resolutionState: text("resolution_state").notNull().default("open"),
  resolvedBy: uuid("resolved_by").references(() => profiles.id, { onDelete: "set null" }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (table) => [
  foreignKey({ columns: [table.submissionId, table.submissionVersion], foreignColumns: [submissionVersions.submissionId, submissionVersions.version] }).onDelete("restrict"),
  index("reviewer_feedback_version_idx").on(table.submissionId, table.submissionVersion, table.sentenceIndex)
]);

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id").references(() => profiles.id, { onDelete: "set null" }),
  actorRoles: text("actor_roles").array().notNull().default(sql`'{}'::text[]`),
  eventType: text("event_type").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  previousState: text("previous_state"),
  nextState: text("next_state"),
  reason: text("reason"),
  note: text("note"),
  submissionVersion: integer("submission_version"),
  actionId: text("action_id"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: createdAt()
}, (table) => [
  uniqueIndex("audit_action_id_unique").on(table.actionId).where(sql`${table.actionId} is not null`),
  index("audit_entity_idx").on(table.entityType, table.entityId, table.createdAt)
]);

export const permissionEvents = pgTable("permission_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id").references(() => profiles.id, { onDelete: "set null" }),
  targetUserId: uuid("target_user_id").notNull().references(() => profiles.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  roleName: text("role_name"),
  languageCode: text("language_code"),
  reason: text("reason").notNull(),
  createdAt: createdAt()
});

export const publishedLessons = pgTable("published_lessons", {
  id: uuid("id").primaryKey().defaultRandom(),
  stableLessonId: text("stable_lesson_id").notNull().unique(),
  submissionId: uuid("submission_id").notNull().unique(),
  publishedVersion: integer("published_version").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  targetLanguage: text("target_language").notNull(),
  baseLanguage: text("base_language").notNull(),
  level: text("level").notNull(),
  tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
  sentenceCount: integer("sentence_count").notNull(),
  contributorId: uuid("contributor_id").notNull().references(() => profiles.id, { onDelete: "restrict" }),
  schemaVersion: integer("schema_version").notNull(),
  lessonVersion: text("lesson_version").notNull(),
  checksum: text("checksum").notNull(),
  license: text("license").notNull().default("CC BY 4.0"),
  compatibility: text("compatibility").notNull().default("Fydor 2.0+"),
  contentHash: text("content_hash").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: updatedAt(),
  archivedAt: timestamp("archived_at", { withTimezone: true })
}, (table) => [
  foreignKey({ columns: [table.submissionId, table.publishedVersion], foreignColumns: [submissionVersions.submissionId, submissionVersions.version] }).onDelete("restrict"),
  index("published_library_idx").on(table.targetLanguage, table.baseLanguage, table.level, table.publishedAt).where(sql`${table.archivedAt} is null`),
  index("published_tags_idx").using("gin", table.tags)
]);

export const contributionContentHashes = pgTable("contribution_content_hashes", {
  contentHash: text("content_hash").primaryKey(),
  submissionId: uuid("submission_id").notNull().references(() => submissions.id, { onDelete: "cascade" }),
  submissionVersion: integer("submission_version").notNull(),
  state: text("state").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (table) => [
  foreignKey({ columns: [table.submissionId, table.submissionVersion], foreignColumns: [submissionVersions.submissionId, submissionVersions.version] }).onDelete("cascade"),
  index("contribution_hash_submission_idx").on(table.submissionId)
]);

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  linkPath: text("link_path").notNull(),
  groupKey: text("group_key"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: createdAt()
}, (table) => [index("notifications_user_idx").on(table.userId, table.readAt, table.createdAt)]);

export const idempotencyRecords = pgTable("idempotency_records", {
  actorId: uuid("actor_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  operation: text("operation").notNull(),
  key: text("key").notNull(),
  requestHash: text("request_hash").notNull(),
  responseJson: jsonb("response_json"),
  createdAt: createdAt()
}, (table) => [primaryKey({ columns: [table.actorId, table.operation, table.key] })]);
