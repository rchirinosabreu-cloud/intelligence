-- Create a partial unique index to prevent duplicate active ContentPlans per client/period
CREATE UNIQUE INDEX content_plan_active_unique_period
ON "ContentPlan" ("clientId", "month", "year")
WHERE "deletedAt" IS NULL;
