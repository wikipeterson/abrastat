import { signInAnonymously, signInWithPopup, GoogleAuthProvider, signOut as firebaseSignOut } from 'firebase/auth'
import { auth } from './firebase'

const provider = new GoogleAuthProvider()

export const signInWithGoogle = () => signInWithPopup(auth, provider)
export const signInAsGuest = () => signInAnonymously(auth)
export const signOut = () => firebaseSignOut(auth)
