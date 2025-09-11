-- Disable RLS on devices table since we removed authentication
ALTER TABLE public.devices DISABLE ROW LEVEL SECURITY;

-- Disable RLS on bot_sessions table since we removed authentication  
ALTER TABLE public.bot_sessions DISABLE ROW LEVEL SECURITY;

-- Disable RLS on bot_actions table since we removed authentication
ALTER TABLE public.bot_actions DISABLE ROW LEVEL SECURITY;