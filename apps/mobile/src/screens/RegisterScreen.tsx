import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'
import { generatePKCE, generateState } from '../utils/pkce'
import { useAuthStore } from '../store/authStore'
import { authApi } from '../services/api'
import { AuthStackParamList } from '../types'

WebBrowser.maybeCompleteAuthSession()

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || ''
const PROXY_REDIRECT_URI = 'https://auth.expo.io/@shanmukha.mudragadda/executive-management'

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Register'>
}

export default function RegisterScreen({ navigation }: Props) {
  const setAuth = useAuthStore((s) => s.setAuth)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleGoogleSignIn = async () => {
    if (!GOOGLE_CLIENT_ID) {
      Alert.alert('Configuration Error', 'Google sign-in is not configured.')
      return
    }
    setGoogleLoading(true)
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
      console.error('Google sign-in error:', msg)
      Alert.alert('Sign-In Failed', msg)
    } finally {
      setGoogleLoading(false)
    }
  }

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !password) {
      Alert.alert('Validation Error', 'Please fill in all fields.')
      return
    }
    if (password.length < 8) {
      Alert.alert('Validation Error', 'Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      Alert.alert('Validation Error', 'Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      const res = await authApi.register(name.trim(), email.trim().toLowerCase(), password)
      await setAuth(res.data.user, res.data.token)
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Registration failed. Please try again.'
      Alert.alert('Registration Failed', msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back link */}
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backText}>← Back to Sign in</Text>
        </TouchableOpacity>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoLetter}>E</Text>
          </View>
          <Text style={styles.heading}>Create account</Text>
          <Text style={styles.subheading}>Get started with ExecManage for free</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          {/* Google Sign-Up */}
          <TouchableOpacity
            style={styles.googleBtn}
            onPress={handleGoogleSignIn}
            disabled={googleLoading || loading}
            activeOpacity={0.85}
          >
            {googleLoading ? (
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

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or sign up with email</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Name */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Full Name</Text>
            <TextInput
              style={styles.input}
              placeholder="John Smith"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              placeholderTextColor="#9ca3af"
            />
          </View>

          {/* Email */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="you@company.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              placeholderTextColor="#9ca3af"
            />
          </View>

          {/* Password */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                placeholder="Minimum 8 characters"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                placeholderTextColor="#9ca3af"
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowPassword((v) => !v)}
              >
                <Text style={styles.eyeText}>{showPassword ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Confirm Password */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Confirm Password</Text>
            <TextInput
              style={[
                styles.input,
                confirmPassword.length > 0 && password !== confirmPassword
                  ? styles.inputError
                  : null,
              ]}
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              placeholderTextColor="#9ca3af"
            />
            {confirmPassword.length > 0 && password !== confirmPassword && (
              <Text style={styles.errorHint}>Passwords do not match</Text>
            )}
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, loading && styles.disabledBtn]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.primaryBtnText}>Create Account</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.termsText}>
            By creating an account you agree to our{' '}
            <Text style={styles.termsLink}>Terms of Service</Text> and{' '}
            <Text style={styles.termsLink}>Privacy Policy</Text>.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f5f3ff' },
  container: { flexGrow: 1, padding: 24, paddingBottom: 40 },
  backBtn: { marginBottom: 24, marginTop: 8 },
  backText: { fontSize: 14, color: '#6366f1', fontWeight: '600' },
  header: { alignItems: 'center', marginBottom: 28 },
  logoCircle: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  logoLetter: { color: 'white', fontSize: 24, fontWeight: '800' },
  heading: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 4 },
  subheading: { fontSize: 14, color: '#6b7280' },
  card: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingVertical: 12,
    backgroundColor: 'white',
    marginBottom: 4,
  },
  googleIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  googleIconG: { fontSize: 16, fontWeight: '700', color: '#4285F4', lineHeight: 20 },
  googleBtnText: { fontSize: 15, fontWeight: '600', color: '#374151' },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 18,
    gap: 10,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#e5e7eb' },
  dividerText: { fontSize: 12, color: '#9ca3af', flexShrink: 0 },
  fieldGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: {
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#f9fafb',
  },
  inputError: { borderColor: '#ef4444' },
  errorHint: { fontSize: 12, color: '#ef4444', marginTop: 4 },
  passwordRow: { position: 'relative' },
  passwordInput: { paddingRight: 58 },
  eyeBtn: {
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  eyeText: { fontSize: 13, color: '#6366f1', fontWeight: '600' },
  primaryBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  disabledBtn: { opacity: 0.7 },
  primaryBtnText: { color: 'white', fontSize: 16, fontWeight: '700' },
  termsText: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
  },
  termsLink: { color: '#6366f1', fontWeight: '600' },
})
