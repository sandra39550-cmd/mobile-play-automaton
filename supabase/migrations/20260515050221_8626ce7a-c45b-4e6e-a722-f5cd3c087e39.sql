CREATE TABLE IF NOT EXISTS public.agent_instructions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  instruction TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_at TIMESTAMPTZ
);
ALTER TABLE public.agent_instructions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to agent_instructions"
  ON public.agent_instructions FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_agent_instructions_session_pending
  ON public.agent_instructions(session_id, status, created_at DESC);
ALTER TABLE public.agent_instructions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_instructions;