import { useState, useCallback, useRef } from 'react'
import { supabase } from '@/integrations/supabase/client'
import type { ReasoningPlan, ReasoningStep } from './useReasoning'

export interface StepExecutionResult {
  stepId: number
  status: 'completed' | 'failed'
  executionTimeMs: number
  verificationScreenshot?: string
  verificationResult?: string
  error?: string
}

export interface ExecutionState {
  isExecuting: boolean
  currentStepId: number | null
  results: StepExecutionResult[]
  overallStatus: 'idle' | 'running' | 'completed' | 'failed' | 'paused'
  startedAt: string | null
  completedAt: string | null
}

export const useActionExecution = () => {
  const [executionState, setExecutionState] = useState<ExecutionState>({
    isExecuting: false,
    currentStepId: null,
    results: [],
    overallStatus: 'idle',
    startedAt: null,
    completedAt: null,
  })
  const abortRef = useRef(false)

  const executeStep = useCallback(async (
    step: ReasoningStep,
    deviceId: string,
    sessionId?: string,
  ): Promise<StepExecutionResult> => {
    const startTime = Date.now()

    try {
      const { data, error } = await supabase.functions.invoke('device-automation', {
        body: {
          action: 'execute_step',
          payload: { step, deviceId, sessionId }
        }
      })

      if (error) throw new Error(error.message)
      if (!data.success) throw new Error(data.error || 'Step execution failed')

      return {
        stepId: step.id,
        status: 'completed',
        executionTimeMs: Date.now() - startTime,
        verificationScreenshot: data.verificationScreenshot,
        verificationResult: data.verificationResult,
      }
    } catch (err: any) {
      return {
        stepId: step.id,
        status: 'failed',
        executionTimeMs: Date.now() - startTime,
        error: err?.message || 'Unknown error',
      }
    }
  }, [])

  const executePlan = useCallback(async (
    plan: ReasoningPlan,
    deviceId: string,
    sessionId?: string,
    onStepUpdate?: (stepId: number, status: ReasoningStep['status']) => void,
  ) => {
    abortRef.current = false
    setExecutionState({
      isExecuting: true,
      currentStepId: null,
      results: [],
      overallStatus: 'running',
      startedAt: new Date().toISOString(),
      completedAt: null,
    })

    const results: StepExecutionResult[] = []
    let failed = false

    for (const step of plan.steps) {
      if (abortRef.current) {
        // Mark remaining steps as skipped
        onStepUpdate?.(step.id, 'skipped')
        continue
      }

      setExecutionState(prev => ({ ...prev, currentStepId: step.id }))
      onStepUpdate?.(step.id, 'executing')

      // Handle wait actions client-side
      if (step.action?.type === 'wait') {
        const duration = step.action.duration || 500
        await new Promise(r => setTimeout(r, duration))
        const result: StepExecutionResult = {
          stepId: step.id,
          status: 'completed',
          executionTimeMs: duration,
        }
        results.push(result)
        onStepUpdate?.(step.id, 'completed')
        setExecutionState(prev => ({ ...prev, results: [...prev.results, result] }))
        continue
      }

      // Skip steps with no action
      if (!step.action) {
        onStepUpdate?.(step.id, 'completed')
        results.push({ stepId: step.id, status: 'completed', executionTimeMs: 0 })
        continue
      }

      const result = await executeStep(step, deviceId, sessionId)
      results.push(result)
      setExecutionState(prev => ({ ...prev, results: [...prev.results, result] }))

      if (result.status === 'failed') {
        onStepUpdate?.(step.id, 'failed')
        failed = true
        // Don't break — mark rest as skipped
        abortRef.current = true
        continue
      }

      onStepUpdate?.(step.id, 'completed')

      // Brief delay between steps for device to settle
      await new Promise(r => setTimeout(r, 300))
    }

    setExecutionState(prev => ({
      ...prev,
      isExecuting: false,
      currentStepId: null,
      overallStatus: failed ? 'failed' : abortRef.current ? 'paused' : 'completed',
      completedAt: new Date().toISOString(),
    }))

    return results
  }, [executeStep])

  const abortExecution = useCallback(() => {
    abortRef.current = true
  }, [])

  const resetExecution = useCallback(() => {
    abortRef.current = false
    setExecutionState({
      isExecuting: false,
      currentStepId: null,
      results: [],
      overallStatus: 'idle',
      startedAt: null,
      completedAt: null,
    })
  }, [])

  return {
    executionState,
    executePlan,
    abortExecution,
    resetExecution,
  }
}
