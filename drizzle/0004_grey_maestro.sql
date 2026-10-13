ALTER TABLE "media" ADD COLUMN "ai_label" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- Existing AI images created from a reference photo (own dish) no longer show the guest badge.
UPDATE "media" SET "ai_label" = false WHERE "kind" = 'ai_generated' AND "source_media_id" IS NOT NULL;
