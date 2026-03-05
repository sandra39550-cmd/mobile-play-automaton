
-- Game Profiles: per-game configuration and learned behaviors
CREATE TABLE public.game_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_name text NOT NULL UNIQUE,
  package_name text,
  category text,
  preferred_strategy text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  learned_behaviors jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_sessions integer NOT NULL DEFAULT 0,
  total_actions integer NOT NULL DEFAULT 0,
  avg_reward numeric NOT NULL DEFAULT 0,
  best_reward numeric NOT NULL DEFAULT 0,
  success_rate numeric NOT NULL DEFAULT 0,
  last_played_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.game_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to game_profiles" ON public.game_profiles FOR ALL USING (true) WITH CHECK (true);

-- Strategy Templates: reusable action patterns extracted from high-reward experiences
CREATE TABLE public.strategy_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  source_game text NOT NULL,
  game_state text NOT NULL DEFAULT 'any',
  action_pattern jsonb NOT NULL DEFAULT '[]'::jsonb,
  preconditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  avg_reward numeric NOT NULL DEFAULT 0,
  times_used integer NOT NULL DEFAULT 0,
  times_succeeded integer NOT NULL DEFAULT 0,
  is_transferable boolean NOT NULL DEFAULT false,
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.strategy_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to strategy_templates" ON public.strategy_templates FOR ALL USING (true) WITH CHECK (true);
