ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to devices" ON public.devices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to bot_sessions" ON public.bot_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to bot_actions" ON public.bot_actions FOR ALL USING (true) WITH CHECK (true);