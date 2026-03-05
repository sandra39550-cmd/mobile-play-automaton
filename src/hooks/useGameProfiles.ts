import { useState, useCallback } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'

export interface GameProfile {
  id: string
  game_name: string
  package_name: string | null
  category: string | null
  preferred_strategy: string | null
  config: Record<string, any>
  learned_behaviors: any[]
  total_sessions: number
  total_actions: number
  avg_reward: number
  best_reward: number
  success_rate: number
  last_played_at: string | null
  created_at: string
  updated_at: string
}

export const useGameProfiles = () => {
  const [profiles, setProfiles] = useState<GameProfile[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const loadProfiles = useCallback(async () => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('game_profiles')
        .select('*')
        .order('last_played_at', { ascending: false })

      if (error) throw error
      setProfiles((data as any[]) || [])
    } catch (err: any) {
      console.error('Load profiles error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const getOrCreateProfile = useCallback(async (gameName: string, packageName?: string, category?: string): Promise<GameProfile | null> => {
    try {
      const { data: existing } = await supabase
        .from('game_profiles')
        .select('*')
        .eq('game_name', gameName)
        .maybeSingle()

      if (existing) return existing as any

      const { data: created, error } = await supabase
        .from('game_profiles')
        .insert({
          game_name: gameName,
          package_name: packageName || null,
          category: category || null,
        })
        .select()
        .single()

      if (error) throw error
      return created as any
    } catch (err: any) {
      console.error('Get/create profile error:', err)
      return null
    }
  }, [])

  const updateProfileStats = useCallback(async (gameName: string) => {
    try {
      // Aggregate from agent_experiences
      const { data: experiences } = await supabase
        .from('agent_experiences')
        .select('reward_score, success, steps_count')
        .eq('game_name', gameName)

      if (!experiences || experiences.length === 0) return

      const total = experiences.length
      const avgReward = experiences.reduce((s, e) => s + Number(e.reward_score), 0) / total
      const bestReward = Math.max(...experiences.map(e => Number(e.reward_score)))
      const successRate = (experiences.filter(e => e.success).length / total) * 100
      const totalActions = experiences.reduce((s, e) => s + e.steps_count, 0)

      await supabase
        .from('game_profiles')
        .update({
          total_sessions: total,
          total_actions: totalActions,
          avg_reward: Number(avgReward.toFixed(2)),
          best_reward: Number(bestReward.toFixed(2)),
          success_rate: Number(successRate.toFixed(1)),
          last_played_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('game_name', gameName)
    } catch (err: any) {
      console.error('Update profile stats error:', err)
    }
  }, [])

  const updatePreferredStrategy = useCallback(async (gameName: string, strategy: string) => {
    try {
      await supabase
        .from('game_profiles')
        .update({ preferred_strategy: strategy, updated_at: new Date().toISOString() })
        .eq('game_name', gameName)
      toast.success('Strategy updated')
    } catch (err: any) {
      toast.error('Failed to update strategy')
    }
  }, [])

  return { profiles, isLoading, loadProfiles, getOrCreateProfile, updateProfileStats, updatePreferredStrategy }
}
