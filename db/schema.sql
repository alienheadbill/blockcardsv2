-- Kitchen Blockcards — PostgreSQL schema (Phase 3 target)
-- Migration 0001_initial. Apply with: psql "$DATABASE_URL" -f db/schema.sql
--
-- Every row belongs to a workspace. Authorization is enforced in the data-access
-- layer AND by row-level security (see bottom) so a bug in one cannot leak data.
-- Resident-identifying tables (resident_*) are only created/used in facility mode
-- on an approved deployment. Demo mode never writes them.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- ───────────── identity & tenancy ─────────────
CREATE TABLE organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         citext UNIQUE,              -- provided by the identity provider
  display_name  text NOT NULL,
  initials      text NOT NULL,
  disabled_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE workspace_kind AS ENUM ('institution', 'food_truck', 'home');
CREATE TYPE workspace_mode AS ENUM ('demo', 'facility');

CREATE TABLE workspaces (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id),
  kind             workspace_kind NOT NULL,
  mode             workspace_mode NOT NULL DEFAULT 'demo',
  name             text NOT NULL,
  settings         jsonb NOT NULL DEFAULT '{}',  -- identifier type, serving times, default count mode
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workspace_themes (
  workspace_id  uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  primary_color text NOT NULL,
  accent_color  text NOT NULL,
  background    text NOT NULL,
  logo_url      text,                -- only with documented permission to use the logo
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE workspace_role AS ENUM ('owner', 'manager', 'cook', 'viewer');

CREATE TABLE workspace_memberships (
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id),
  role          workspace_role NOT NULL,
  -- fine-grained grants, e.g. {"requests.verify": true, "menu.edit_master": false}
  permissions   jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

-- ───────────── menus ─────────────
CREATE TABLE menu_seasons (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id),
  slug          text NOT NULL,              -- 'fall-winter'
  name          text NOT NULL,
  cycle_weeks   int  NOT NULL CHECK (cycle_weeks BETWEEN 1 AND 8),
  source_note   text NOT NULL,
  UNIQUE (workspace_id, slug)
);

CREATE TABLE menu_rotations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES workspaces(id),
  season_id      uuid NOT NULL REFERENCES menu_seasons(id),
  week1_start    date NOT NULL CHECK (extract(dow FROM week1_start) = 0), -- Sunday
  effective_from date NOT NULL,
  confirmed_by   uuid REFERENCES users(id),   -- NULL = not facility-confirmed
  confirmed_at   timestamptz,
  note           text NOT NULL DEFAULT ''
);

CREATE TABLE menu_weeks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id  uuid NOT NULL REFERENCES menu_seasons(id) ON DELETE CASCADE,
  week_no    int  NOT NULL,
  source     text NOT NULL,
  flag       text,
  UNIQUE (season_id, week_no)
);

CREATE TABLE menu_days (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id      uuid NOT NULL REFERENCES menu_weeks(id) ON DELETE CASCADE,
  day_of_week  int  NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  UNIQUE (week_id, day_of_week)
);

CREATE TYPE meal_service AS ENUM ('breakfast', 'lunch', 'dinner');
CREATE TYPE menu_item_kind AS ENUM ('main', 'alt', 'soup', 'side', 'salad', 'dessert', 'fruit');

CREATE TABLE meal_services (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day_id   uuid NOT NULL REFERENCES menu_days(id) ON DELETE CASCADE,
  meal     meal_service NOT NULL,
  UNIQUE (day_id, meal)
);

-- menu_items are versioned: corrections insert a new version row, never update text in place.
CREATE TABLE menu_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_service_id uuid NOT NULL REFERENCES meal_services(id) ON DELETE CASCADE,
  stable_key      text NOT NULL,              -- e.g. fw-w2-d1-dinner-1
  position        int  NOT NULL,
  version         int  NOT NULL DEFAULT 1,
  kind            menu_item_kind NOT NULL,
  printed_label   text NOT NULL DEFAULT '',
  text            text NOT NULL,
  review_flag     text,                       -- transcription uncertainty
  reviewed_by     uuid REFERENCES users(id),
  reviewed_at     timestamptz,
  created_by      uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  is_current      boolean NOT NULL DEFAULT true,
  UNIQUE (stable_key, version)
);
CREATE UNIQUE INDEX menu_items_current ON menu_items (stable_key) WHERE is_current;

CREATE TABLE menu_overrides (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id),
  service_date  date NOT NULL,
  meal          meal_service NOT NULL,
  items         jsonb NOT NULL,              -- [{kind, text}]
  reason        text NOT NULL CHECK (length(trim(reason)) > 0),
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, service_date, meal)
);

-- ───────────── counting (append-only) ─────────────
CREATE TYPE count_status AS ENUM ('counting', 'complete');

CREATE TABLE count_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id),
  service_date    date NOT NULL,
  meal            meal_service NOT NULL,
  mode            text NOT NULL CHECK (mode IN ('quick', 'detailed')),
  options         jsonb NOT NULL,            -- snapshot of panels at start
  extras          jsonb NOT NULL,
  expected_slips  int CHECK (expected_slips >= 0),
  status          count_status NOT NULL DEFAULT 'counting',
  created_by      uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, service_date, meal)
);

CREATE TYPE count_event_type AS ENUM ('slip', 'item', 'undo', 'resolve', 'correction', 'complete', 'reopen');

-- Clients send a UUID per tap (client_event_id) so retries over flaky Wi-Fi are
-- idempotent: the unique constraint turns a duplicate POST into a no-op.
CREATE TABLE count_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       uuid NOT NULL REFERENCES count_sessions(id),
  client_event_id  uuid NOT NULL,
  seq              int  NOT NULL,
  type             count_event_type NOT NULL,
  payload          jsonb NOT NULL,           -- choice / itemKey / targetId / delta / reason
  user_id          uuid REFERENCES users(id),
  at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, client_event_id),
  UNIQUE (session_id, seq)
);
-- Append-only: no UPDATE/DELETE privileges are granted on count_events (see grants).

-- Derived, rebuildable cache for reports.
CREATE TABLE production_item_counts (
  session_id  uuid NOT NULL REFERENCES count_sessions(id) ON DELETE CASCADE,
  item_key    text NOT NULL,
  label       text NOT NULL,
  is_meal     boolean NOT NULL,             -- true = resident meal choice, false = add-on item
  quantity    int NOT NULL,
  PRIMARY KEY (session_id, item_key)
);

-- ───────────── requests ─────────────
CREATE TYPE production_status AS ENUM ('not_started', 'preparing', 'ready', 'served', 'cancelled');
CREATE TYPE verification_status AS ENUM ('unverified', 'verified', 'flagged');

CREATE TABLE special_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES workspaces(id),
  service_date     date NOT NULL,
  meal             meal_service NOT NULL,
  identifier       text NOT NULL,           -- room or name (facility mode: encrypted column)
  item             text NOT NULL,
  quantity         int  NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  notes            text NOT NULL DEFAULT '',
  verification     verification_status NOT NULL DEFAULT 'unverified',
  verified_by      uuid REFERENCES users(id),
  verified_at      timestamptz,
  flag_reason      text,
  status           production_status NOT NULL DEFAULT 'not_started',
  count_session_id uuid REFERENCES count_sessions(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT (verification = 'flagged' AND status IN ('ready', 'served')))
);

-- ───────────── prep ─────────────
CREATE TABLE prep_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id),
  name          text NOT NULL,
  tasks         jsonb NOT NULL
);

CREATE TABLE prep_tasks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES workspaces(id),
  task_date        date NOT NULL,
  meal             meal_service,
  title            text NOT NULL,
  notes            text NOT NULL DEFAULT '',
  start_time       time,
  holding_reminder text NOT NULL DEFAULT '',
  recipe_id        uuid,
  source           text NOT NULL CHECK (source IN ('manual', 'suggested', 'template')),
  suggestion_key   text,
  done_at          timestamptz,
  done_by          uuid REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX prep_tasks_by_date ON prep_tasks (workspace_id, task_date);

-- ───────────── recipes ─────────────
CREATE TABLE recipes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES workspaces(id),
  current_version_id  uuid,
  facility_approved   boolean NOT NULL DEFAULT false,
  source              text NOT NULL CHECK (source IN ('starter', 'user')),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE recipe_versions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id          uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  version            int  NOT NULL,
  name               text NOT NULL,
  category           text NOT NULL,
  yield_portions     numeric NOT NULL CHECK (yield_portions > 0),
  portion_size       text NOT NULL,
  steps              jsonb NOT NULL,
  equipment          jsonb NOT NULL,
  active_minutes     int NOT NULL,
  total_minutes      int NOT NULL,
  ahead_notes        text NOT NULL DEFAULT '',
  safety_checkpoints jsonb NOT NULL,
  allergens          jsonb NOT NULL,
  allergens_verified boolean NOT NULL DEFAULT false,
  cost_per_batch     numeric,
  change_note        text NOT NULL DEFAULT '',
  created_by         uuid REFERENCES users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recipe_id, version)
);
ALTER TABLE recipes ADD CONSTRAINT recipes_current_version_fk FOREIGN KEY (current_version_id) REFERENCES recipe_versions(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE prep_tasks ADD CONSTRAINT prep_tasks_recipe_fk FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE SET NULL;

CREATE TABLE recipe_ingredients (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_version_id  uuid NOT NULL REFERENCES recipe_versions(id) ON DELETE CASCADE,
  position           int  NOT NULL,
  quantity           numeric NOT NULL CHECK (quantity >= 0),
  unit               text NOT NULL,
  name               text NOT NULL,
  note               text
);

-- ───────────── inventory & food truck ─────────────
CREATE TABLE inventory_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id),
  name          text NOT NULL,
  quantity      numeric NOT NULL CHECK (quantity >= 0),
  unit          text NOT NULL,
  par           numeric NOT NULL CHECK (par >= 0),
  unit_cost     numeric,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE truck_menu_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id),
  name          text NOT NULL,
  price         numeric(8,2) NOT NULL CHECK (price >= 0),
  recipe_id     uuid REFERENCES recipes(id),
  active        boolean NOT NULL DEFAULT true
);

CREATE TABLE truck_tickets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id),
  service_date  date NOT NULL,
  number        int  NOT NULL,
  lines         jsonb NOT NULL,
  note          text NOT NULL DEFAULT '',
  status        text NOT NULL CHECK (status IN ('open', 'preparing', 'ready', 'served', 'cancelled')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, service_date, number)
);

-- ───────────── audit ─────────────
CREATE TABLE audit_events (
  id            bigserial PRIMARY KEY,
  workspace_id  uuid NOT NULL REFERENCES workspaces(id),
  user_id       uuid REFERENCES users(id),
  action        text NOT NULL,
  entity        text NOT NULL,
  entity_id     text,
  detail        jsonb NOT NULL DEFAULT '{}',  -- never raw diet/allergy text
  ip_hash       text,
  at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_by_workspace ON audit_events (workspace_id, at DESC);

-- ───────────── row-level security ─────────────
-- The API sets: SET LOCAL app.user_id = '<uuid>' inside each transaction.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['menu_seasons','menu_rotations','menu_overrides','count_sessions','special_requests',
                           'prep_templates','prep_tasks','recipes','inventory_items','truck_menu_items','truck_tickets','audit_events']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY member_only ON %I USING (
      workspace_id IN (SELECT workspace_id FROM workspace_memberships WHERE user_id = current_setting('app.user_id')::uuid)
    )$p$, t);
  END LOOP;
END $$;

COMMIT;
