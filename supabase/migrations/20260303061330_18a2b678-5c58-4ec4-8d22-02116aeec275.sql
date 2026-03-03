ALTER TABLE public.agent_experiences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to agent_experiences"
ON public.agent_experiences
FOR ALL
USING (true)
WITH CHECK (true);