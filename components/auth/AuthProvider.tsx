'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, User } from 'firebase/auth'
import { auth } from '@/lib/firebase'
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

const GUEST_USER = {
  uid: 'guest',
  displayName: 'Guest',
  email: null,
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
      if (firebaseUser) {
        await upsertUser(firebaseUser).catch(() => {/* ignore Firestore errors */})
      }
      setLoading(false)
    })
    return unsub
  }, [setUser])

  function continueAsGuest() {
    setLocalUser(GUEST_USER)
    setUser(GUEST_USER)
    setIsGuest(true)
    setLoading(false)
  }

  return <AuthContext.Provider value={{ user, loading, isGuest, continueAsGuest }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
