-- 10B1: непрозрачная ревизия черновика, отдельно от formatVersion и снапшотов.
-- Старые документы, даты, ID и ссылки остаются нетронутыми.
ALTER TABLE projects ADD COLUMN revision TEXT NOT NULL DEFAULT '';
UPDATE projects SET revision = lower(hex(randomblob(16)));
