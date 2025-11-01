-- Add connection_type column to devices table to track USB vs wireless connection
ALTER TABLE devices ADD COLUMN IF NOT EXISTS connection_type TEXT DEFAULT 'unknown';

-- Add comment for clarity
COMMENT ON COLUMN devices.connection_type IS 'Type of ADB connection: usb, wireless, or unknown';