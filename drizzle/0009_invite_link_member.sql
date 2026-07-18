-- Tie an invite to a household member (issue #82). When set, the invitee's
-- account is auto-linked to this member on acceptance. ON DELETE SET NULL so a
-- member removed between invite creation and acceptance falls back to no-link.
ALTER TABLE "invitation" ADD COLUMN "member_id" text;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;