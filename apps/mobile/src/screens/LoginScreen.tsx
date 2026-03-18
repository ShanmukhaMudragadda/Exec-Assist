import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'
import { generatePKCE, generateState } from '../utils/pkce'
import { useAuthStore } from '../store/authStore'
import { authApi } from '../services/api'
import { AuthStackParamList } from '../types'
import { useState } from 'react'

WebBrowser.maybeCompleteAuthSession()

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || ''
const PROXY_REDIRECT_URI = 'https://auth.expo.io/@shanmukha.mudragadda/executive-management'

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'>
}

export default function LoginScreen({ navigation: _ }: Props) {
  const setAuth = useAuthStore((s) => s.setAuth)
  const [loading, setLoading] = useState(false)

  const handleGoogleSignIn = async () => {
    if (!GOOGLE_CLIENT_ID) {
      Alert.alert('Configuration Error', 'Google sign-in is not configured.')
      return
    }
    setLoading(true)
    try {
      const returnUrl = Linking.createURL('expo-auth-session')
      const state = generateState()
      const { codeVerifier, codeChallenge } = generatePKCE()

      const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: PROXY_REDIRECT_URI,
        response_type: 'code',
        scope: 'openid profile email',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state,
      }).toString()}`

      const startUrl = `${PROXY_REDIRECT_URI}/start?${new URLSearchParams({
        authUrl: googleAuthUrl,
        returnUrl,
      }).toString()}`

      const result = await WebBrowser.openAuthSessionAsync(startUrl, returnUrl)

      if (result.type === 'success') {
        const qs = result.url.includes('?') ? result.url.split('?')[1] : ''
        const params = Object.fromEntries(new URLSearchParams(qs))

        if (!params.code) {
          Alert.alert('Sign-In Failed', 'No authorization code received.')
          return
        }

        const res = await authApi.googleAuth({
          code: params.code,
          codeVerifier,
          redirectUri: PROXY_REDIRECT_URI,
        })
        await setAuth(res.data.user, res.data.token)
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      Alert.alert('Sign-In Failed', msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      {/* Logo */}
      <View style={styles.logoWrap}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoLetter}>EA</Text>
        </View>
        <Text style={styles.appName}>EAssist</Text>
        <Text style={styles.tagline}>Executive task management, simplified.</Text>
      </View>

      {/* Card */}
      <View style={styles.card}>
        <Text style={styles.heading}>Welcome</Text>
        <Text style={styles.subheading}>Sign in with your Google account to continue</Text>

        <TouchableOpacity
          style={[styles.googleBtn, loading && styles.disabledBtn]}
          onPress={handleGoogleSignIn}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#374151" size="small" />
          ) : (
            <>
              <View style={styles.googleIconWrap}>
                <Text style={styles.googleIconG}>G</Text>
              </View>
              <Text style={styles.googleBtnText}>Continue with Google</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.terms}>
          By signing in, you agree to our terms of service and privacy policy.
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f3ff',
    justifyContent: 'center',
    padding: 24,
  },
  logoWrap: { alignItems: 'center', marginBottom: 32 },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  logoLetter: { color: 'white', fontSize: 32, fontWeight: '800' },
  appName: { fontSize: 24, fontWeight: '800', color: '#111827', marginBottom: 6 },
  tagline: { fontSize: 14, color: '#6b7280', textAlign: 'center' },
  card: {
    backgroundColor: 'white',
    borderRadius: 24,
    padding: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 5,
    alignItems: 'center',
  },
  heading: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 6 },
  subheading: { fontSize: 14, color: '#6b7280', marginBottom: 28, textAlign: 'center' },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    backgroundColor: 'white',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  disabledBtn: { opacity: 0.6 },
  googleIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  googleIconG: { fontSize: 17, fontWeight: '800', color: '#4285F4' },
  googleBtnText: { fontSize: 16, fontWeight: '600', color: '#374151' },
  terms: {
    fontSize: 11,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 16,
  },
})
