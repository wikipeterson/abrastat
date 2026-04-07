import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
} from 'firebase/auth'
import { auth } from './firebase'

const provider = new GoogleAuthProvider()

export const signInWithGoogle = () => signInWithPopup(auth, provider)
export const signInAsGuest = () => signInAnonymously(auth)
export const signInWithEmailPassword = (email: string, password: string) =>
  signInWithEmailAndPassword(auth, email, password)
export const signUpWithEmailPassword = (email: string, password: string) =>
  createUserWithEmailAndPassword(auth, email, password)
export const resetPasswordForEmail = (email: string) =>
  sendPasswordResetEmail(auth, email)
export const signOut = () => firebaseSignOut(auth)
