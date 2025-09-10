import { useAuth } from '@/hooks/useAuth'
import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'

interface AuthWrapperProps {
  children: React.ReactNode
}

export const AuthWrapper = ({ children }: AuthWrapperProps) => {
  const { user, loading, isAuthenticated } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate('/auth')
    }
  }, [loading, isAuthenticated, navigate])

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-neon-purple" />
          <span className="text-xl text-muted-foreground">Loading...</span>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null // Navigation to /auth will happen via useEffect
  }

  return <>{children}</>
}