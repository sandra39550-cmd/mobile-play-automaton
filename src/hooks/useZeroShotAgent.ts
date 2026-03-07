import { useState, useCallback, useRef } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import type { PerceptionResult } from './usePerception'
import type { ReasoningPlan, ReasoningStep } from './useReasoning'
import type { StepExecutionResult } from './useActionExecution'

export type ZeroShotPhase = 'idle' | 'analyzing' | 'transferring' | 'planning' | 'executing' | 'evaluating' | 'complete' | 'failed'

export interface ZeroShotAttempt {
  id: string
  gameName: string
  deviceId: string
  phase: ZeroShotPhase
  startedAt: string
  completedAt?: string
  transferredTemplates: number
  stepsExecuted: number
  stepsSucceeded: number
  rewardScore: number | null
  reasoning: string | null
  logs: ZeroShotLogEntry[]
}

export interface ZeroShotLogEntry {
  timestamp: string
  phase: ZeroShotPhase
  type: 'info' | 'success' | 'error' | 'warning'
  message: string
  details?: string
}

export const useZeroShotAgent = (deps: {
  perceive: (deviceId: string, gameName: string) => Promise<PerceptionResult | null>
  executePlan: (
    plan: ReasoningPlan,
    deviceId: string,
    sessionId?: string,
    onStepUpdate?: (stepId: number, status: ReasoningStep['status']) => void,
  ) => Promise<StepExecutionResult[]>
  markStepStatus: (stepId: number, status: ReasoningStep['status']) => void
}) => {
  const [currentAttempt, setCurrentAttempt] = useState<ZeroShotAttempt | null>(null)
  const [attemptHistory, setAttemptHistory] = useState<ZeroShotAttempt[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const abortRef = useRef(false)

  const addLog = useCallback((phase: ZeroShotPhase, type: ZeroShotLogEntry['type'], message: string, details?: string) => {
    const entry: ZeroShotLogEntry = {
      timestamp: new Date().toISOString(),
      phase,
      type,
      message,
      details,
    }
    setCurrentAttempt(prev => prev ? { ...prev, logs: [...prev.logs, entry] } : null)
  }, [])

  const attemptGame = useCallback(async (gameName: string, deviceId: string, maxCycles = 3) => {
    if (isRunning) return
    abortRef.current = false
    setIsRunning(true)

    const attempt: ZeroShotAttempt = {
      id: `zs-${Date.now()}`,
      gameName,
      deviceId,
      phase: 'analyzing',
      startedAt: new Date().toISOString(),
      transferredTemplates: 0,
      stepsExecuted: 0,
      stepsSucceeded: 0,
      rewardScore: null,
      reasoning: null,
      logs: [],
    }
    setCurrentAttempt(attempt)

    try {
      // Phase 1: Perceive the unseen game
      addLog('analyzing', 'info', `🔍 Analyzing unseen game: ${gameName}`)
      const perception = await deps.perceive(deviceId, gameName)
      if (!perception) {
        addLog('analyzing', 'error', 'Failed to perceive game screen')
        throw new Error('Perception failed')
      }
      addLog('analyzing', 'success', `Scene detected: ${perception.sceneUnderstanding.gameState}`, `${perception.detectedElements.length} elements found`)

      if (abortRef.current) throw new Error('Aborted')

      // Phase 2: Transfer knowledge from other games
      setCurrentAttempt(prev => prev ? { ...prev, phase: 'transferring' } : null)
      addLog('transferring', 'info', '🔄 Searching for transferable strategies from known games...')

      const { data: transferData, error: transferError } = await supabase.functions.invoke('device-automation', {
        body: {
          action: 'transfer_knowledge',
          payload: {
            targetGame: gameName,
            targetState: perception.sceneUnderstanding.gameState,
          },
        },
      })

      const templates = transferData?.applicableTemplates || []
      setCurrentAttempt(prev => prev ? { ...prev, transferredTemplates: templates.length } : null)

      if (templates.length > 0) {
        addLog('transferring', 'success', `Found ${templates.length} transferable strategy template(s)`, templates.map((t: any) => `${t.name} (from ${t.source_game})`).join(', '))
      } else {
        addLog('transferring', 'warning', 'No transferable templates found — using pure zero-shot reasoning')
      }

      if (abortRef.current) throw new Error('Aborted')

      // Phase 3: Zero-shot planning using AI + transferred knowledge
      setCurrentAttempt(prev => prev ? { ...prev, phase: 'planning' } : null)
      addLog('planning', 'info', '🧠 Generating zero-shot plan with generalized knowledge...')

      const { data: planData, error: planError } = await supabase.functions.invoke('device-automation', {
        body: {
          action: 'zero_shot_plan',
          payload: {
            perception,
            gameName,
            transferredTemplates: templates,
          },
        },
      })

      if (planError || !planData?.success) {
        addLog('planning', 'error', 'Zero-shot planning failed', planData?.error || planError?.message)
        throw new Error('Planning failed')
      }

      const plan: ReasoningPlan = planData.plan
      addLog('planning', 'success', `Plan: ${plan.steps.length} steps, ${(plan.overallConfidence * 100).toFixed(0)}% confidence`, plan.chainOfThought)

      if (abortRef.current) throw new Error('Aborted')

      // Phase 4: Execute the plan
      setCurrentAttempt(prev => prev ? { ...prev, phase: 'executing' } : null)
      addLog('executing', 'info', `⚡ Executing ${plan.steps.length} zero-shot steps...`)

      const results = await deps.executePlan(plan, deviceId, undefined, deps.markStepStatus)
      const succeeded = results.filter(r => r.status === 'completed').length
      const failed = results.filter(r => r.status === 'failed').length

      setCurrentAttempt(prev => prev ? {
        ...prev,
        stepsExecuted: results.length,
        stepsSucceeded: succeeded,
      } : null)

      addLog('executing', succeeded > 0 ? 'success' : 'warning', `${succeeded}/${results.length} steps completed, ${failed} failed`)

      if (abortRef.current) throw new Error('Aborted')

      // Phase 5: Evaluate performance
      setCurrentAttempt(prev => prev ? { ...prev, phase: 'evaluating' } : null)
      addLog('evaluating', 'info', '📊 Evaluating zero-shot performance...')

      const { data: rewardData } = await supabase.functions.invoke('device-automation', {
        body: {
          action: 'estimate_reward',
          payload: {
            gameName,
            plan,
            executionResults: results,
            perceptionBefore: perception,
            perceptionAfter: null,
            isZeroShot: true,
          },
        },
      })

      const rewardScore = rewardData?.reward?.score ?? null
      const reasoning = rewardData?.reward?.reasoning ?? null

      setCurrentAttempt(prev => prev ? {
        ...prev,
        phase: 'complete',
        completedAt: new Date().toISOString(),
        rewardScore,
        reasoning,
      } : null)

      if (rewardScore !== null) {
        addLog('complete', rewardScore >= 5 ? 'success' : 'warning', `Zero-shot score: ${rewardScore.toFixed(1)}/10`, reasoning || undefined)
      } else {
        addLog('complete', 'info', 'Zero-shot attempt complete (no reward data)')
      }

      toast.success(`🎯 Zero-shot attempt on ${gameName}: ${rewardScore?.toFixed(1) ?? '?'}/10`)

    } catch (err: any) {
      if (err.message !== 'Aborted') {
        addLog('failed', 'error', `Zero-shot attempt failed: ${err.message}`)
        toast.error(`Zero-shot attempt failed: ${err.message}`)
      }
      setCurrentAttempt(prev => prev ? { ...prev, phase: 'failed', completedAt: new Date().toISOString() } : null)
    } finally {
      setIsRunning(false)
      setCurrentAttempt(prev => {
        if (prev) setAttemptHistory(h => [prev, ...h].slice(0, 20))
        return prev
      })
    }
  }, [isRunning, deps, addLog])

  const abort = useCallback(() => {
    abortRef.current = true
  }, [])

  return { currentAttempt, attemptHistory, isRunning, attemptGame, abort }
}
