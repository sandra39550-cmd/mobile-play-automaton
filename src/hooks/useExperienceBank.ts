import { useState, useCallback } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import type { PerceptionResult } from './usePerception'
import type { ReasoningPlan } from './useReasoning'
import type { StepExecutionResult } from './useActionExecution'

export interface Experience {
  id: string
  game_name: string
  game_state: string
  objective: string | null
  action_sequence: any[]
  reward_score: number
  reward_reasoning: string | null
  outcome: string | null
  perception_summary: any
  steps_count: number
  total_execution_ms: number
  success: boolean
  session_id: string | null
  device_id: string | null
  created_at: string
}

export interface ExperienceStats {
  total: number
  avgReward: number
  successRate: number
  bestScore: number
}

export const useExperienceBank = () => {
  const [experiences, setExperiences] = useState<Experience[]>([])
  const [stats, setStats] = useState<ExperienceStats>({ total: 0, avgReward: 0, successRate: 0, bestScore: 0 })
  const [isEstimating, setIsEstimating] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [lastReward, setLastReward] = useState<{ score: number; reasoning: string; outcome: string } | null>(null)

  const estimateReward = useCallback(async (
    gameName: string,
    plan: ReasoningPlan,
    executionResults: StepExecutionResult[],
    perceptionBefore: PerceptionResult | null,
    perceptionAfter: PerceptionResult | null,
  ) => {
    setIsEstimating(true)
    try {
      const { data, error } = await supabase.functions.invoke('device-automation', {
        body: {
          action: 'estimate_reward',
          payload: {
            gameName,
            gameState: perceptionBefore?.sceneUnderstanding?.gameState || 'unknown',
            objective: plan.objective,
            actionSequence: plan.steps,
            executionResults,
            perceptionBefore,
            perceptionAfter,
          }
        }
      })

      if (error) throw new Error(error.message)
      if (!data.success) throw new Error(data.error || 'Reward estimation failed')

      const reward = {
        score: data.rewardScore,
        reasoning: data.rewardReasoning,
        outcome: data.outcome,
      }
      setLastReward(reward)
      toast.success(`🏆 Reward: ${data.rewardScore.toFixed(1)}/10 — ${data.outcome}`)
      return reward
    } catch (err: any) {
      console.error('Reward estimation error:', err)
      toast.error('Failed to estimate reward')
      return null
    } finally {
      setIsEstimating(false)
    }
  }, [])

  const loadExperiences = useCallback(async (gameName: string, gameState?: string) => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('device-automation', {
        body: {
          action: 'retrieve_experiences',
          payload: { gameName, gameState, limit: 20 }
        }
      })

      if (error) throw new Error(error.message)
      if (!data.success) throw new Error(data.error)

      setExperiences(data.experiences || [])
      setStats(data.stats || { total: 0, avgReward: 0, successRate: 0, bestScore: 0 })
      return data.experiences
    } catch (err: any) {
      console.error('Load experiences error:', err)
      return []
    } finally {
      setIsLoading(false)
    }
  }, [])

  return {
    experiences,
    stats,
    isEstimating,
    isLoading,
    lastReward,
    estimateReward,
    loadExperiences,
  }
}
