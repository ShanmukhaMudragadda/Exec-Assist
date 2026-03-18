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
import { RouteProp } from '@react-navigation/native'
import { authApi } from '../services/api'
import { AuthStackParamList } from '../types'

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'ResetPassword'>
  route: RouteProp<AuthStackParamList, 'ResetPassword'>
}

export default function ResetPasswordScreen({ navigation, route }: Props) {
  const tokenFromRoute = route.params?.token || ''
  const [token, setToken] = useState(tokenFromRoute)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const handleReset = async () => {
    if (!token.trim()) {
      Alert.alert('Validation Error', 'Please enter the reset token from your email.')
      return
    }
    if (password.length < 8) {
      Alert.alert('Validation Error', 'Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      Alert.alert('Validation Error', 'Passwords do not match.')
      return
    }
    setLoading(true)
    try {
      await authApi.resetPassword(token.trim(), password)
      setDone(true)
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to reset password. The link may have expired.'
      Alert.alert('Error', msg)
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
          {done ? (
            <>
              <View style={styles.successIcon}>
                <Text style={styles.successEmoji}>✅</Text>
              </View>
              <Text style={styles.heading}>Password reset!</Text>
              <Text style={styles.subheading}>
                Your password has been updated. You can now sign in with your new password.
              </Text>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => navigation.navigate('Login')}
              >
                <Text style={styles.primaryBtnText}>Sign In</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.heading}>Reset password</Text>
              <Text style={styles.subheading}>
                Enter the token from your email and choose a new password.
              </Text>

              {!tokenFromRoute && (
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Reset Token</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Paste token from email"
                    value={token}
                    onChangeText={setToken}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholderTextColor="#9ca3af"
                  />
                </View>
              )}

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>New Password</Text>
                <View style={styles.passwordRow}>
                  <TextInput
                    style={[styles.input, styles.passwordInput]}
                    placeholder="At least 8 characters"
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

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Confirm Password</Text>
                <TextInput
                  style={[styles.input, confirm && confirm !== password && styles.inputError]}
                  placeholder="Repeat new password"
                  value={confirm}
                  onChangeText={setConfirm}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  placeholderTextColor="#9ca3af"
                />
                {confirm.length > 0 && confirm !== password && (
                  <Text style={styles.errorText}>Passwords do not match</Text>
                )}
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, loading && styles.disabledBtn]}
                onPress={handleReset}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.primaryBtnText}>Reset Password</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.backBtn}
                onPress={() => navigation.navigate('Login')}
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
  errorText: { fontSize: 12, color: '#ef4444', marginTop: 4 },
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
    marginTop: 4,
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
