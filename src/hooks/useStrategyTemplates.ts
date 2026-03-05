import { useState, useCallback } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'

export interface StrategyTemplate {
  id: string
  name: string
  description: string | null
  source_game: string
  game_state: string
  action_pattern: any[]
  preconditions: Record<string, any>
  avg_reward: number
  times_used: number
  times_succeeded: number
  is_transferable: boolean
  tags: string[]
  created_at: string
  updated_at: string
}

export const useStrategyTemplates = () => {
  const [templates, setTemplates] = useState<StrategyTemplate[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isExtracting, setIsExtracting] = useState(false)

  const loadTemplates = useCallback(async (gameName?: string) => {
    setIsLoading(true)
    try {
      let query = supabase
        .from('strategy_templates')
        .select('*')
        .order('avg_reward', { ascending: false })

      if (gameName) {
        // Get templates for this game OR transferable ones
        query = query.or(`source_game.eq.${gameName},is_transferable.eq.true`)
      }

      const { data, error } = await query
      if (error) throw error
      setTemplates((data as any[]) || [])
    } catch (err: any) {
      console.error('Load templates error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const extractTemplate = useCallback(async (gameName: string) => {
    setIsExtracting(true)
    try {
      const { data, error } = await supabase.functions.invoke('device-automation', {
        body: {
          action: 'extract_strategy',
          payload: { gameName }
        }
      })

      if (error) throw new Error(error.message)
      if (!data.success) throw new Error(data.error || 'Extraction failed')

      toast.success(`📋 Extracted ${data.templatesCreated} strategy template(s)`)
      await loadTemplates(gameName)
      return data.templates
    } catch (err: any) {
      console.error('Extract template error:', err)
      toast.error('Failed to extract strategies')
      return []
    } finally {
      setIsExtracting(false)
    }
  }, [loadTemplates])

  const getTransferableTemplates = useCallback(async (targetGame: string, targetState: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('device-automation', {
        body: {
          action: 'transfer_knowledge',
          payload: { targetGame, targetState }
        }
      })

      if (error) throw new Error(error.message)
      if (!data.success) throw new Error(data.error)

      return data.applicableTemplates || []
    } catch (err: any) {
      console.error('Transfer knowledge error:', err)
      return []
    }
  }, [])

  return { templates, isLoading, isExtracting, loadTemplates, extractTemplate, getTransferableTemplates }
}
