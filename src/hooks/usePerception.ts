import { useState, useCallback } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'

export interface DetectedElement {
  type: string
  label: string
  confidence: number
  boundingBox: { x: number; y: number; width: number; height: number }
  actionable: boolean
}

export interface SceneUnderstanding {
  gameState: 'menu' | 'playing' | 'paused' | 'level_complete' | 'loading' | 'unknown'
  gamePhase: string
  confidence: number
}

export interface SuggestedAction {
  type: string
  coordinates: { x: number; y: number }
  reasoning: string
  confidence: number
}

export interface PerceptionResult {
  timestamp: string
  screenshotPreview: string
  sceneUnderstanding: SceneUnderstanding
  detectedElements: DetectedElement[]
  screenText: string[]
  suggestedAction: SuggestedAction | null
  processingTimeMs: number
}

export const usePerception = () => {
  const [latestPerception, setLatestPerception] = useState<PerceptionResult | null>(null)
  const [perceptionHistory, setPerceptionHistory] = useState<PerceptionResult[]>([])
  const [isPerceiving, setIsPerceiving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const perceive = useCallback(async (deviceId: string, gameName: string): Promise<PerceptionResult | null> => {
    setIsPerceiving(true)
    setError(null)

    try {
      const { data, error: fnError } = await supabase.functions.invoke('device-automation', {
        body: {
          action: 'perceive',
          payload: { deviceId, gameName }
        }
      })

      if (fnError) throw new Error(fnError.message)

      if (!data.success) {
        throw new Error(data.error || 'Perception failed')
      }

      const result: PerceptionResult = data.perception
      setLatestPerception(result)
      setPerceptionHistory(prev => [result, ...prev].slice(0, 20)) // Keep last 20
      return result
    } catch (err: any) {
      const msg = err?.message || 'Perception failed'
      setError(msg)
      console.error('Perception error:', err)
      return null
    } finally {
      setIsPerceiving(false)
    }
  }, [])

  const clearHistory = useCallback(() => {
    setPerceptionHistory([])
    setLatestPerception(null)
  }, [])

  return {
    latestPerception,
    perceptionHistory,
    isPerceiving,
    error,
    perceive,
    clearHistory,
  }
}
