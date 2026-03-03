CREATE TABLE public.agent_experiences (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_name text NOT NULL,
  game_state text NOT NULL DEFAULT 'unknown',
  objective text,
  action_sequence jsonb NOT NULL DEFAULT '[]'::jsonb,
  reward_score numeric(4,2) NOT NULL DEFAULT 0,
  reward_reasoning text,
  outcome text,
  perception_summary jsonb,
  steps_count integer NOT NULL DEFAULT 0,
  total_execution_ms integer NOT NULL DEFAULT 0,
  success boolean NOT NULL DEFAULT false,
  session_id uuid REFERENCES public.bot_sessions(id) ON DELETE SET NULL,
  device_id uuid REFERENCES public.devices(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);