CREATE TABLE "api_keys" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" varchar(20) NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"permissions" jsonb NOT NULL,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "api_audit_log" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"api_key_id" varchar(255) NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"action" varchar(255) NOT NULL,
	"resource" varchar(255),
	"request_method" varchar(10),
	"request_path" text,
	"response_status" varchar(10),
	"metadata" jsonb,
	"ip_address" varchar(45),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "api_keys_user_id_idx" ON "api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_key_hash_idx" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "api_keys_is_active_idx" ON "api_keys" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "api_audit_log_api_key_id_idx" ON "api_audit_log" USING btree ("api_key_id");--> statement-breakpoint
CREATE INDEX "api_audit_log_user_id_idx" ON "api_audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "api_audit_log_created_at_idx" ON "api_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "api_audit_log_action_idx" ON "api_audit_log" USING btree ("action");
