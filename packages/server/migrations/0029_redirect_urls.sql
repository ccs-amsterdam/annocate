-- Deployment settings (docs/plans/design.md §4): per name, the URL end items
-- with that `redirectSetting` send coders to (e.g. a panel's return link).
ALTER TABLE jobs ADD COLUMN redirect_urls JSONB NOT NULL DEFAULT '{}';
