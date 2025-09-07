-- Create tables for real bot automation
CREATE TABLE public.devices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  device_id TEXT UNIQUE NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('android', 'ios')),
  status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'busy')),
  adb_host TEXT,
  adb_port INTEGER,
  screen_width INTEGER,
  screen_height INTEGER,
  android_version TEXT,
  ios_version TEXT,
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE public.bot_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  device_id UUID REFERENCES public.devices(id),
  game_name TEXT NOT NULL,
  package_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'stopped' CHECK (status IN ('running', 'paused', 'stopped', 'error')),
  actions_performed INTEGER DEFAULT 0,
  runtime_minutes INTEGER DEFAULT 0,
  level_progress INTEGER DEFAULT 0,
  currency_earned INTEGER DEFAULT 0,
  error_message TEXT,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE public.bot_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES public.bot_sessions(id),
  action_type TEXT NOT NULL,
  coordinates JSONB,
  screenshot_before TEXT,
  screenshot_after TEXT,
  success BOOLEAN DEFAULT true,
  execution_time_ms INTEGER,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_actions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can manage their own devices" ON public.devices
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own bot sessions" ON public.bot_sessions
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own bot actions" ON public.bot_actions
  FOR SELECT USING (auth.uid() = (
    SELECT bs.user_id FROM public.bot_sessions bs WHERE bs.id = session_id
  ));

-- Create indexes for performance
CREATE INDEX idx_devices_user_id ON public.devices(user_id);
CREATE INDEX idx_devices_status ON public.devices(status);
CREATE INDEX idx_bot_sessions_user_id ON public.bot_sessions(user_id);
CREATE INDEX idx_bot_sessions_device_id ON public.bot_sessions(device_id);
CREATE INDEX idx_bot_actions_session_id ON public.bot_actions(session_id);