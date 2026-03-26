'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, User } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { upsertUser } from '@/lib/firestore'
import { useStore } from '@/lib/store'

interface AuthContextValue {
  user: User | null
  loading: boolean
}

const AuthContext = createContext<AuthContextValue>({ user: null, loading: true })

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setLocalUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const setUser = useStore(s => s.setUser)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setLocalUser(firebaseUser)
      setUser(firebaseUser)
      if (firebaseUser) {
        await upsertUser(firebaseUser).catch(console.error)
      }
      setLoading(false)
    })
    return unsub
  }, [setUser])

  return <AuthContext.Provider value={{ user, loading }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
