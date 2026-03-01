import { useState, useCallback } from 'react'
import { supabase } from '@/integrations/supabase/client'
import type { PerceptionResult } from './usePerception'

export interface ReasoningStep {
  id: number
  thought: string
  action: {
    type: 'tap' | 'swipe' | 'wait' | 'dismiss'
    coordinates?: { x: number; y: number }
    swipeDirection?: string
    duration?: number
  } | null
  expectedOutcome: string
  confidence: number
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'skipped'
}

export interface ReasoningPlan {
  timestamp: string
  objective: string
  chainOfThought: string
  currentAssessment: string
  steps: ReasoningStep[]
  overallConfidence: number
  estimatedDurationMs: number
  alternativeStrategy: string | null
  processingTimeMs: number
}

export interface ActionHistoryEntry {
  action: string
  coordinates?: { x: number; y: number }
  success: boolean
  timestamp: string
}

export const useReasoning = () => {
  const [currentPlan, setCurrentPlan] = useState<ReasoningPlan | null>(null)
  const [planHistory, setPlanHistory] = useState<ReasoningPlan[]>([])
  const [isReasoning, setIsReasoning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionHistory, setActionHistory] = useState<ActionHistoryEntry[]>([])

  const reason = useCallback(async (
    perception: PerceptionResult,
    gameName: string,
    objective?: string,
  ): Promise<ReasoningPlan | null> => {
    setIsReasoning(true)
    setError(null)

    try {
      const { data, error: fnError } = await supabase.functions.invoke('device-automation', {
        body: {
          action: 'reason',
          payload: {
            perception,
            gameName,
            objective: objective || 'Play the game optimally and progress through levels',
            actionHistory: actionHistory.slice(-10), // Last 10 actions for context
          }
        }
      })

      if (fnError) throw new Error(fnError.message)
      if (!data.success) throw new Error(data.error || 'Reasoning failed')

      const plan: ReasoningPlan = data.plan
      setCurrentPlan(plan)
      setPlanHistory(prev => [plan, ...prev].slice(0, 10))
      return plan
    } catch (err: any) {
      const msg = err?.message || 'Reasoning failed'
      setError(msg)
      console.error('Reasoning error:', err)
      return null
    } finally {
      setIsReasoning(false)
    }
  }, [actionHistory])

  const markStepStatus = useCallback((stepId: number, status: ReasoningStep['status']) => {
    setCurrentPlan(prev => {
      if (!prev) return null
      return {
        ...prev,
        steps: prev.steps.map(s => s.id === stepId ? { ...s, status } : s)
      }
    })
  }, [])

  const recordAction = useCallback((entry: ActionHistoryEntry) => {
    setActionHistory(prev => [...prev, entry].slice(-50))
  }, [])

  const clearPlan = useCallback(() => {
    setCurrentPlan(null)
    setError(null)
  }, [])

  return {
    currentPlan,
    planHistory,
    isReasoning,
    error,
    actionHistory,
    reason,
    markStepStatus,
    recordAction,
    clearPlan,
  }
}
