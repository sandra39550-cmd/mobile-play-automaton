-- Drop existing RLS policies since we removed authentication
DROP POLICY IF EXISTS "Users can manage their own devices" ON public.devices;
DROP POLICY IF EXISTS "Users can manage their own bot sessions" ON public.bot_sessions;
DROP POLICY IF EXISTS "Users can view their own bot actions" ON public.bot_actions;