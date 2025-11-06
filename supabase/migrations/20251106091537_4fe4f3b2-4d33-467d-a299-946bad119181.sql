-- Create table to store ADB server configuration
CREATE TABLE IF NOT EXISTS public.adb_server_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_url TEXT NOT NULL,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT now(),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.adb_server_config ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read the active server URL (needed for device automation)
CREATE POLICY "Anyone can read active ADB server config"
  ON public.adb_server_config
  FOR SELECT
  USING (is_active = true);

-- Allow inserts and updates without auth (for ADB server to report its URL)
CREATE POLICY "Allow ADB server to update config"
  ON public.adb_server_config
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_adb_server_config_active 
  ON public.adb_server_config(is_active) 
  WHERE is_active = true;

-- Insert a placeholder record (will be updated by ADB server)
INSERT INTO public.adb_server_config (server_url, is_active)
VALUES ('https://unfeoffed-unadorably-matha.ngrok-free.dev', true)
ON CONFLICT DO NOTHING;