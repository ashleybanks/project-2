-- Add stylesheet column to templates (brand_snapshot + overrides).
ALTER TABLE templates
    ADD COLUMN IF NOT EXISTS stylesheet JSONB NOT NULL DEFAULT '{}';

-- Add settings column to users for workspace-level brand rules.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}';
