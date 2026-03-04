import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Monitor, RefreshCw, Loader2, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { useDeviceAutomation } from "@/hooks/useDeviceAutomation";

interface LiveScreenPreviewProps {
  deviceId?: string;
  autoRefresh?: boolean;
  refreshIntervalMs?: number;
}

export const LiveScreenPreview = ({
  deviceId,
  autoRefresh = false,
  refreshIntervalMs = 5000,
}: LiveScreenPreviewProps) => {
  const { getDeviceScreenshot } = useDeviceAutomation();
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const capture = useCallback(async () => {
    if (!deviceId || isLoading) return;
    setIsLoading(true);
    try {
      const data = await getDeviceScreenshot(deviceId);
      if (data) {
        setScreenshot(data);
        setLastUpdated(new Date());
      }
    } catch (e) {
      console.error('Screenshot error:', e);
    } finally {
      setIsLoading(false);
    }
  }, [deviceId, getDeviceScreenshot, isLoading]);

  useEffect(() => {
    if (autoRefresh && deviceId) {
      capture();
      intervalRef.current = setInterval(capture, refreshIntervalMs);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, deviceId, refreshIntervalMs]);

  return (
    <>
      <Card className={`border-gaming-border bg-gaming-card overflow-hidden ${isFullscreen ? 'fixed inset-4 z-50' : ''}`}>
        <div className="p-3 border-b border-gaming-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Monitor className="w-4 h-4 text-neon-blue" />
              <span className="text-sm font-bold">Live Screen</span>
              {autoRefresh && (
                <Badge variant="outline" className="text-xs text-neon-green border-neon-green">
                  <span className="w-1.5 h-1.5 rounded-full bg-neon-green mr-1 animate-pulse inline-block" />
                  Live
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} className="h-7 w-7 p-0">
                <ZoomOut className="w-3.5 h-3.5" />
              </Button>
              <span className="text-xs font-mono text-muted-foreground w-8 text-center">{(zoom * 100).toFixed(0)}%</span>
              <Button variant="ghost" size="sm" onClick={() => setZoom(z => Math.min(2, z + 0.25))} className="h-7 w-7 p-0">
                <ZoomIn className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setIsFullscreen(!isFullscreen)} className="h-7 w-7 p-0">
                <Maximize2 className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={capture}
                disabled={isLoading || !deviceId}
                className="h-7 gap-1 text-xs"
              >
                {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </div>
        </div>

        <div className={`flex items-center justify-center bg-black/20 overflow-auto ${isFullscreen ? 'flex-1' : 'max-h-[400px]'}`}>
          {screenshot ? (
            <img
              src={`data:image/png;base64,${screenshot}`}
              alt="Device screen"
              className="transition-transform"
              style={{ transform: `scale(${zoom})`, transformOrigin: 'center', maxWidth: '100%' }}
            />
          ) : (
            <div className="py-12 text-center text-muted-foreground">
              <Monitor className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">{deviceId ? "Click refresh to capture screen" : "No device selected"}</p>
            </div>
          )}
        </div>

        {lastUpdated && (
          <div className="px-3 py-1.5 border-t border-gaming-border">
            <span className="text-xs text-muted-foreground">Last updated: {lastUpdated.toLocaleTimeString()}</span>
          </div>
        )}
      </Card>

      {/* Fullscreen overlay */}
      {isFullscreen && (
        <div className="fixed inset-0 bg-black/60 z-40" onClick={() => setIsFullscreen(false)} />
      )}
    </>
  );
};
