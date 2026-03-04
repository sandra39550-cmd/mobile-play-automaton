import { useState, useCallback, useRef, useEffect } from 'react'
import type { PerceptionResult } from './usePerception'
import type { ReasoningPlan, ReasoningStep } from './useReasoning'
import type { StepExecutionResult } from './useActionExecution'

export type AutoPilotPhase = 'idle' | 'perceiving' | 'reasoning' | 'executing' | 'rewarding' | 'cooldown'

export interface AutoPilotLogEntry {
  id: string
  timestamp: string
  phase: AutoPilotPhase
  type: 'info' | 'success' | 'error' | 'warning'
  message: string
  details?: string
}

export interface AutoPilotState {
  isRunning: boolean
  currentPhase: AutoPilotPhase
  cycleCount: number
  totalActions: number
  startedAt: string | null
  lastCycleAt: string | null
  avgCycleTimeMs: number
  logs: AutoPilotLogEntry[]
  speed: 'slow' | 'normal' | 'fast'
}

interface AutoPilotDeps {
  perceive: (deviceId: string, gameName: string) => Promise<PerceptionResult | null>
  reason: (perception: PerceptionResult, gameName: string, objective?: string) => Promise<ReasoningPlan | null>
  executePlan: (
    plan: ReasoningPlan,
    deviceId: string,
    sessionId?: string,
    onStepUpdate?: (stepId: number, status: ReasoningStep['status']) => void,
  ) => Promise<StepExecutionResult[]>
  estimateReward: (
    gameName: string,
    plan: ReasoningPlan,
    results: StepExecutionResult[],
    perceptionBefore: PerceptionResult | null,
    perceptionAfter: PerceptionResult | null,
  ) => Promise<any>
  markStepStatus: (stepId: number, status: ReasoningStep['status']) => void
  recordAction: (entry: any) => void
  loadExperiences: (gameName: string) => Promise<any>
}

const SPEED_DELAYS: Record<string, number> = {
  slow: 5000,
  normal: 2000,
  fast: 500,
}

let logIdCounter = 0

export const useAutoPilot = (deps: AutoPilotDeps) => {
  const [state, setState] = useState<AutoPilotState>({
    isRunning: false,
    currentPhase: 'idle',
    cycleCount: 0,
    totalActions: 0,
    startedAt: null,
    lastCycleAt: null,
    avgCycleTimeMs: 0,
    logs: [],
    speed: 'normal',
  })

  const abortRef = useRef(false)
  const runningRef = useRef(false)
  const cycleTimes = useRef<number[]>([])

  const addLog = useCallback((phase: AutoPilotPhase, type: AutoPilotLogEntry['type'], message: string, details?: string) => {
    const entry: AutoPilotLogEntry = {
      id: `log-${Date.now()}-${logIdCounter++}`,
      timestamp: new Date().toISOString(),
      phase,
      type,
      message,
      details,
    }
    setState(prev => ({
      ...prev,
      logs: [entry, ...prev.logs].slice(0, 100),
    }))
  }, [])

  const setPhase = useCallback((phase: AutoPilotPhase) => {
    setState(prev => ({ ...prev, currentPhase: phase }))
  }, [])

  const runCycle = useCallback(async (deviceId: string, gameName: string, objective?: string) => {
    const cycleStart = Date.now()

    // 1. PERCEIVE
    setPhase('perceiving')
    addLog('perceiving', 'info', 'Capturing & analyzing screen...')
    const perception = await deps.perceive(deviceId, gameName)
    if (!perception) {
      addLog('perceiving', 'error', 'Perception failed — skipping cycle')
      return false
    }
    addLog('perceiving', 'success', `Scene: ${perception.sceneUnderstanding.gameState} (${(perception.sceneUnderstanding.confidence * 100).toFixed(0)}%)`, `${perception.detectedElements.length} elements detected`)
    if (abortRef.current) return false

    // 2. REASON
    setPhase('reasoning')
    addLog('reasoning', 'info', 'Generating action plan...')
    const plan = await deps.reason(perception, gameName, objective)
    if (!plan) {
      addLog('reasoning', 'error', 'Reasoning failed — skipping cycle')
      return false
    }
    addLog('reasoning', 'success', `Plan: ${plan.steps.length} steps, ${(plan.overallConfidence * 100).toFixed(0)}% confidence`, plan.currentAssessment)
    if (abortRef.current) return false

    // 3. EXECUTE
    setPhase('executing')
    addLog('executing', 'info', `Executing ${plan.steps.length} steps...`)
    const results = await deps.executePlan(plan, deviceId, undefined, deps.markStepStatus)

    // Record actions
    for (const r of results) {
      const step = plan.steps.find(s => s.id === r.stepId)
      if (step?.action) {
        deps.recordAction({
          action: step.action.type,
          coordinates: step.action.coordinates,
          success: r.status === 'completed',
          timestamp: new Date().toISOString(),
        })
      }
    }

    const completed = results.filter(r => r.status === 'completed').length
    const failed = results.filter(r => r.status === 'failed').length
    setState(prev => ({ ...prev, totalActions: prev.totalActions + completed }))

    if (failed > 0) {
      addLog('executing', 'warning', `${completed}/${plan.steps.length} steps completed, ${failed} failed`)
    } else {
      addLog('executing', 'success', `All ${completed} steps completed`)
    }
    if (abortRef.current) return false

    // 4. REWARD
    setPhase('rewarding')
    addLog('rewarding', 'info', 'Estimating reward...')
    const reward = await deps.estimateReward(gameName, plan, results, perception, null)
    if (reward) {
      addLog('rewarding', 'success', `Reward: ${reward.score.toFixed(1)}/10 — ${reward.outcome}`, reward.reasoning)
    } else {
      addLog('rewarding', 'warning', 'Reward estimation skipped')
    }

    // Refresh experience bank
    await deps.loadExperiences(gameName)

    const cycleTime = Date.now() - cycleStart
    cycleTimes.current = [...cycleTimes.current.slice(-19), cycleTime]
    const avgTime = cycleTimes.current.reduce((a, b) => a + b, 0) / cycleTimes.current.length

    setState(prev => ({
      ...prev,
      cycleCount: prev.cycleCount + 1,
      lastCycleAt: new Date().toISOString(),
      avgCycleTimeMs: Math.round(avgTime),
    }))

    return true
  }, [deps, addLog, setPhase])

  const start = useCallback(async (deviceId: string, gameName: string, objective?: string) => {
    if (runningRef.current) return
    abortRef.current = false
    runningRef.current = true

    setState(prev => ({
      ...prev,
      isRunning: true,
      currentPhase: 'idle',
      startedAt: new Date().toISOString(),
      logs: [],
      cycleCount: 0,
      totalActions: 0,
    }))

    addLog('idle', 'info', `🚀 Auto-Pilot started for ${gameName}`)

    while (!abortRef.current) {
      await runCycle(deviceId, gameName, objective)
      if (abortRef.current) break

      setPhase('cooldown')
      const delay = SPEED_DELAYS[state.speed] || 2000
      addLog('cooldown', 'info', `Waiting ${delay / 1000}s before next cycle...`)
      await new Promise(r => setTimeout(r, delay))
    }

    runningRef.current = false
    setPhase('idle')
    setState(prev => ({ ...prev, isRunning: false }))
    addLog('idle', 'info', '⏹️ Auto-Pilot stopped')
  }, [runCycle, addLog, setPhase, state.speed])

  const stop = useCallback(() => {
    abortRef.current = true
    addLog('idle', 'warning', 'Stopping Auto-Pilot...')
  }, [addLog])

  const setSpeed = useCallback((speed: 'slow' | 'normal' | 'fast') => {
    setState(prev => ({ ...prev, speed }))
  }, [])

  const clearLogs = useCallback(() => {
    setState(prev => ({ ...prev, logs: [] }))
  }, [])

  return { state, start, stop, setSpeed, clearLogs }
}
