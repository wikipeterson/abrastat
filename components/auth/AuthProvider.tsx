'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, User } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { signInAsGuest } from '@/lib/auth'
import { upsertUser } from '@/lib/firestore'
import { useStore } from '@/lib/store'

interface AuthContextValue {
  user: User | null
  loading: boolean
  isGuest: boolean
  continueAsGuest: () => void
}

const AuthContext = createContext<AuthContextValue>({ user: null, loading: true, isGuest: false, continueAsGuest: () => {} })

const DEV_BYPASS = process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === 'true'

const DEV_USER = {
  uid: 'dev-user',
  displayName: 'Dev User',
  email: 'dev@abrastat.local',
  photoURL: null,
} as unknown as User

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setLocalUser] = useState<User | null>(DEV_BYPASS ? DEV_USER : null)
  const [loading, setLoading] = useState(!DEV_BYPASS)
  const [isGuest, setIsGuest] = useState(false)
  const setUser = useStore(s => s.setUser)

  useEffect(() => {
    if (DEV_BYPASS) {
      setUser(DEV_USER)
      return
    }
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setLocalUser(firebaseUser)
      setUser(firebaseUser)
      setIsGuest(!!firebaseUser?.isAnonymous)
      if (firebaseUser && !firebaseUser.isAnonymous) {
        await upsertUser(firebaseUser).catch(() => {/* ignore Firestore errors */})
      }
      setLoading(false)
    })
    return unsub
  }, [setUser])

  async function continueAsGuest() {
    setLoading(true)
    try {
      await signInAsGuest()
    } catch {
      setLoading(false)
    }
  }

  return <AuthContext.Provider value={{ user, loading, isGuest, continueAsGuest }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
