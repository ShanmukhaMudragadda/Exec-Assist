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
import { authApi } from '../services/api'
import { AuthStackParamList } from '../types'

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'ForgotPassword'>
}

export default function ForgotPasswordScreen({ navigation }: Props) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async () => {
    if (!email.trim()) {
      Alert.alert('Validation Error', 'Please enter your email address.')
      return
    }
    setLoading(true)
    try {
      await authApi.requestPasswordReset(email.trim().toLowerCase())
      setSent(true)
    } catch {
      // Always show success to avoid email enumeration
      setSent(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.logoWrap}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoLetter}>E</Text>
          </View>
          <Text style={styles.appName}>ExecManage</Text>
        </View>

        <View style={styles.card}>
          {sent ? (
            <>
              <View style={styles.successIcon}>
                <Text style={styles.successEmoji}>✉️</Text>
              </View>
              <Text style={styles.heading}>Check your inbox</Text>
              <Text style={styles.subheading}>
                If an account exists for{' '}
                <Text style={styles.emailHighlight}>{email}</Text>, you'll receive a
                password reset link shortly.
              </Text>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => navigation.navigate('Login')}
              >
                <Text style={styles.primaryBtnText}>Back to Sign In</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.heading}>Forgot password?</Text>
              <Text style={styles.subheading}>
                Enter your email and we'll send you a reset link.
              </Text>

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
                  autoFocus
                />
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, (!email.trim() || loading) && styles.disabledBtn]}
                onPress={handleSubmit}
                disabled={!email.trim() || loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.primaryBtnText}>Send Reset Link</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.backBtn}
                onPress={() => navigation.goBack()}
              >
                <Text style={styles.backBtnText}>← Back to Sign In</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f5f3ff' },
  container: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logoWrap: { alignItems: 'center', marginBottom: 32 },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: 16,
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
  logoLetter: { color: 'white', fontSize: 28, fontWeight: '800' },
  appName: { fontSize: 22, fontWeight: '800', color: '#111827' },
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
  successIcon: { alignItems: 'center', marginBottom: 16 },
  successEmoji: { fontSize: 48 },
  heading: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 8 },
  subheading: { fontSize: 14, color: '#6b7280', marginBottom: 24, lineHeight: 20 },
  emailHighlight: { color: '#6366f1', fontWeight: '600' },
  fieldGroup: { marginBottom: 20 },
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
  primaryBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  disabledBtn: { opacity: 0.5 },
  primaryBtnText: { color: 'white', fontSize: 16, fontWeight: '700' },
  backBtn: { alignItems: 'center' },
  backBtnText: { fontSize: 14, color: '#6366f1', fontWeight: '600' },
})
