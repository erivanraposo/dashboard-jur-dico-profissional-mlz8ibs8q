import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from './use-auth'

export function useCurrentUser() {
  const { user: authUser, loading: authLoading } = useAuth()
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return

    if (!authUser) {
      setProfile(null)
      setLoading(false)
      return
    }

    const fetchProfile = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authUser.id)
          .single()

        if (data) {
          setProfile({ ...data, email: authUser.email })
        } else {
          setProfile({ id: authUser.id, email: authUser.email, role: 'associado' })
        }
      } catch (error) {
        console.error('Error fetching profile:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [authUser, authLoading])

  const role = profile?.role || 'associado'
  const isOwner = role === 'owner'
  const isSocio = role === 'socio'
  const canApprove = isOwner || isSocio

  return {
    user: profile,
    loading: authLoading || loading,
    role,
    isOwner,
    isSocio,
    canApprove,
  }
}
