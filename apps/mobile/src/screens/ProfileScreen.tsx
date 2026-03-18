import { useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, Switch, ActivityIndicator, TextInput, Modal,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useAuthStore } from '../store/authStore'
import { userApi, workspacesApi } from '../services/api'
import { disconnectSocket } from '../services/socket'
import { MainStackParamList, Workspace } from '../types'

type Props = {
  navigation: NativeStackNavigationProp<MainStackParamList, 'Profile'>
}

// ─── Edit Profile Sheet ───────────────────────────────────────────────────────

function EditProfileSheet({
  visible, onClose, initialName, onSaved,
}: {
  visible: boolean
  onClose: () => void
  initialName: string
  onSaved: (name: string) => void
}) {
  const [nameInput, setNameInput] = useState(initialName)
  const setUser = useAuthStore((s) => s.setUser)

  const mutation = useMutation({
    mutationFn: (name: string) => userApi.updateProfile({ name }).then((r) => r.data.user),
    onSuccess: (updated) => {
      setUser(updated)
      onSaved(updated.name)
      onClose()
    },
    onError: () => Alert.alert('Error', 'Failed to update profile.'),
  })

  const handleSave = () => {
    if (!nameInput.trim()) { Alert.alert('Validation', 'Name cannot be empty.'); return }
    mutation.mutate(nameInput.trim())
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={sheet.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={sheet.backdrop} onPress={onClose} activeOpacity={1} />
        <View style={sheet.panel}>
          <View style={sheet.handle} />
          <View style={sheet.headerRow}>
            <Text style={sheet.title}>Edit Profile</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color="#9ca3af" />
            </TouchableOpacity>
          </View>

          <View style={sheet.fieldGroup}>
            <Text style={sheet.fieldLabel}>Display Name</Text>
            <TextInput
              style={sheet.fieldInput}
              value={nameInput}
              onChangeText={setNameInput}
              placeholder="Your full name"
              placeholderTextColor="#4b5563"
              autoFocus
              autoCapitalize="words"
            />
          </View>

          <TouchableOpacity
            style={[sheet.saveBtn, mutation.isPending && sheet.saveBtnDisabled]}
            onPress={handleSave}
            disabled={mutation.isPending}
          >
            {mutation.isPending
              ? <ActivityIndicator color="white" />
              : <Text style={sheet.saveBtnText}>Save Changes</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ─── Change Password Modal ─────────────────────────────────────────────────────

function ChangePasswordModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')

  const mutation = useMutation({
    mutationFn: () => userApi.changePassword(current, next),
    onSuccess: () => {
      Alert.alert('Success', 'Password changed successfully.')
      setCurrent(''); setNext(''); setConfirm('')
      onClose()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to change password.'
      Alert.alert('Error', msg)
    },
  })

  const handleSubmit = () => {
    if (!current || !next || !confirm) { Alert.alert('Validation', 'Fill in all fields.'); return }
    if (next.length < 8) { Alert.alert('Validation', 'New password must be at least 8 characters.'); return }
    if (next !== confirm) { Alert.alert('Validation', 'Passwords do not match.'); return }
    mutation.mutate()
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={sheet.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={sheet.backdrop} onPress={onClose} activeOpacity={1} />
        <View style={sheet.panel}>
          <View style={sheet.handle} />
          <View style={sheet.headerRow}>
            <Text style={sheet.title}>Change Password</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color="#9ca3af" /></TouchableOpacity>
          </View>
          {[
            { label: 'Current Password', val: current, set: setCurrent },
            { label: 'New Password', val: next, set: setNext },
            { label: 'Confirm New Password', val: confirm, set: setConfirm },
          ].map(({ label, val, set }) => (
            <View key={label} style={sheet.fieldGroup}>
              <Text style={sheet.fieldLabel}>{label}</Text>
              <TextInput style={sheet.fieldInput} value={val} onChangeText={set} secureTextEntry placeholderTextColor="#4b5563" placeholder="••••••••" />
            </View>
          ))}
          <TouchableOpacity style={[sheet.saveBtn, mutation.isPending && sheet.saveBtnDisabled]} onPress={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? <ActivityIndicator color="white" /> : <Text style={sheet.saveBtnText}>Update Password</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ─── Setting Row ───────────────────────────────────────────────────────────────

function SettingRow({
  icon, iconBg, label, hint, labelColor, onPress, right,
}: {
  icon: keyof typeof Ionicons.glyphMap
  iconBg: string
  label: string
  hint?: string
  labelColor?: string
  onPress?: () => void
  right?: React.ReactNode
}) {
  const inner = (
    <View style={s.settingRow}>
      <View style={[s.settingIconWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={18} color="white" />
      </View>
      <View style={s.settingTextWrap}>
        <Text style={[s.settingLabel, labelColor ? { color: labelColor } : undefined]}>{label}</Text>
        {hint ? <Text style={s.settingHint}>{hint}</Text> : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={16} color="#4b5563" /> : null)}
    </View>
  )
  if (right) return <View>{inner}</View>
  if (onPress) return <TouchableOpacity onPress={onPress} activeOpacity={0.7}>{inner}</TouchableOpacity>
  return inner
}

// ─── Main Screen ───────────────────────────────────────────────────────────────

export default function ProfileScreen({ navigation }: Props) {
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const logout = useAuthStore((s) => s.logout)
  const queryClient = useQueryClient()

  const [showEditProfile, setShowEditProfile] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [wsExpanded, setWsExpanded] = useState(false)
  const [createWsOpen, setCreateWsOpen] = useState(false)
  const [newWsName, setNewWsName] = useState('')
  const [newWsDesc, setNewWsDesc] = useState('')
  const [notificationsEnabled, setNotificationsEnabled] = useState(user?.emailNotifications ?? false)
  const [displayName, setDisplayName] = useState(user?.name ?? '')

  const { data: wsData } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => workspacesApi.list().then((r) => r.data),
  })
  const workspaces: Workspace[] = (wsData as { workspaces?: Workspace[] })?.workspaces ?? []

  const updateMutation = useMutation({
    mutationFn: (data: { emailNotifications?: boolean }) =>
      userApi.updateProfile(data).then((r) => r.data.user),
    onSuccess: (updated) => setUser(updated),
    onError: () => Alert.alert('Error', 'Failed to update profile.'),
  })

  const createWsMutation = useMutation({
    mutationFn: () => workspacesApi.create(newWsName.trim(), newWsDesc.trim() || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
      setCreateWsOpen(false)
      setNewWsName('')
      setNewWsDesc('')
    },
    onError: () => Alert.alert('Error', 'Failed to create workspace.'),
  })

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => { disconnectSocket(); await logout() } },
    ])
  }

  const handleNotificationsToggle = (val: boolean) => {
    setNotificationsEnabled(val)
    updateMutation.mutate({ emailNotifications: val })
  }

  const goToWorkspaceSettings = () => {
    const wsId = workspaces[0]?.id
    if (!wsId) { Alert.alert('No workspace', 'Create a workspace first.'); return }
    navigation.navigate('WorkspaceSettings', { workspaceId: wsId })
  }

  const goToTranscripts = () => {
    const wsId = workspaces[0]?.id
    if (!wsId) { Alert.alert('No workspace', 'Create a workspace first.'); return }
    navigation.navigate('Transcripts', { workspaceId: wsId })
  }

  const initials = displayName.split(' ').map((w) => w.charAt(0).toUpperCase()).slice(0, 2).join('') || 'U'
  const firstName = displayName.split(' ')[0] || 'there'

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>

      {/* Top bar */}
      <View style={s.topBar}>
        <Text style={s.topEmail}>{user?.email}</Text>
        <TouchableOpacity style={s.closeBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={18} color="#9ca3af" />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* Avatar */}
        <View style={s.avatarSection}>
          <TouchableOpacity style={s.avatarCircle} onPress={() => setShowEditProfile(true)}>
            <Text style={s.avatarInitials}>{initials}</Text>
            <View style={s.avatarEditBadge}>
              <Ionicons name="pencil" size={10} color="white" />
            </View>
          </TouchableOpacity>
          <Text style={s.greeting}>Hi, {firstName}!</Text>
          <View style={s.rolePill}>
            <Text style={s.rolePillText}>{user?.role?.toUpperCase() ?? 'USER'}</Text>
          </View>
          {user?.emailVerified ? (
            <View style={s.badge}><Ionicons name="checkmark-circle" size={13} color="#22c55e" /><Text style={s.verifiedText}>Email verified</Text></View>
          ) : (
            <View style={s.badge}><Ionicons name="warning-outline" size={13} color="#f59e0b" /><Text style={s.unverifiedText}>Email not verified</Text></View>
          )}
        </View>

        {/* Workspace switcher */}
        <View style={s.card}>
          <TouchableOpacity style={s.wsHeaderRow} onPress={() => setWsExpanded((v) => !v)} activeOpacity={0.7}>
            <Text style={s.wsHeaderLabel}>Switch workspace</Text>
            <View style={s.wsAvatarStack}>
              {workspaces.slice(0, 3).map((ws, i) => (
                <View key={ws.id} style={[s.wsSmAvatar, { marginLeft: i === 0 ? 0 : -8, zIndex: 3 - i }]}>
                  <Text style={s.wsSmAvatarText}>{ws.name.charAt(0).toUpperCase()}</Text>
                </View>
              ))}
            </View>
            <Ionicons name={wsExpanded ? 'chevron-up' : 'chevron-down'} size={16} color="#6b7280" style={{ marginLeft: 8 }} />
          </TouchableOpacity>

          {wsExpanded && workspaces.map((ws) => (
            <View key={ws.id}>
              <View style={s.rowDivider} />
              <View style={s.wsRow}>
                <View style={s.wsAvatar}>
                  <Text style={s.wsAvatarText}>{ws.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.wsName}>{ws.name}</Text>
                  {ws.description ? <Text style={s.wsDesc} numberOfLines={1}>{ws.description}</Text> : null}
                </View>
                <Text style={s.wsRole}>{ws.memberRole ?? 'member'}</Text>
              </View>
            </View>
          ))}
          {wsExpanded && (
            <View>
              <View style={s.rowDivider} />
              <TouchableOpacity style={s.wsNewRow} onPress={() => setCreateWsOpen(true)} activeOpacity={0.7}>
                <View style={s.wsNewIcon}>
                  <Ionicons name="add" size={18} color="#6366f1" />
                </View>
                <Text style={s.wsNewLabel}>New Workspace</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Settings */}
        <Text style={s.sectionLabel}>More from this app</Text>
        <View style={s.card}>
          <SettingRow
            icon="person-outline"
            iconBg="#6366f1"
            label="Your Profile"
            hint={`Display name: ${displayName}`}
            onPress={() => setShowEditProfile(true)}
          />
          <View style={s.rowDivider} />
          <SettingRow
            icon="settings-outline"
            iconBg="#334155"
            label="Workspace Settings"
            hint="Manage members & details"
            onPress={goToWorkspaceSettings}
          />
          <View style={s.rowDivider} />
          <SettingRow
            icon="document-text-outline"
            iconBg="#334155"
            label="Transcripts"
            hint="Meeting notes & AI summaries"
            onPress={goToTranscripts}
          />
          <View style={s.rowDivider} />
          <SettingRow
            icon="notifications-outline"
            iconBg="#334155"
            label="Email Notifications"
            hint="Receive task update emails"
            right={
              <Switch
                value={notificationsEnabled}
                onValueChange={handleNotificationsToggle}
                trackColor={{ false: '#334155', true: '#4f46e5' }}
                thumbColor={notificationsEnabled ? '#818cf8' : '#6b7280'}
                disabled={updateMutation.isPending}
              />
            }
          />
          <View style={s.rowDivider} />
          <SettingRow
            icon="lock-closed-outline"
            iconBg="#334155"
            label="Change Password"
            hint="Update your account password"
            onPress={() => setShowPasswordModal(true)}
          />
          <View style={s.rowDivider} />
          <SettingRow
            icon="log-out-outline"
            iconBg="#7f1d1d"
            label="Sign Out"
            labelColor="#ef4444"
            onPress={handleLogout}
          />
        </View>

        <Text style={s.version}>EAssist v1.0.0</Text>
        <Text style={s.footer}>Privacy Policy  ·  Terms of Service</Text>
      </ScrollView>

      <EditProfileSheet
        visible={showEditProfile}
        onClose={() => setShowEditProfile(false)}
        initialName={displayName}
        onSaved={(name) => setDisplayName(name)}
      />
      <ChangePasswordModal visible={showPasswordModal} onClose={() => setShowPasswordModal(false)} />

      {/* Create Workspace sheet */}
      <Modal visible={createWsOpen} transparent animationType="slide" onRequestClose={() => setCreateWsOpen(false)}>
        <KeyboardAvoidingView style={sheet.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={sheet.backdrop} onPress={() => setCreateWsOpen(false)} activeOpacity={1} />
          <View style={sheet.panel}>
            <View style={sheet.handle} />
            <View style={sheet.headerRow}>
              <Text style={sheet.title}>New Workspace</Text>
              <TouchableOpacity onPress={() => setCreateWsOpen(false)}>
                <Ionicons name="close" size={22} color="#9ca3af" />
              </TouchableOpacity>
            </View>
            <View style={sheet.fieldGroup}>
              <Text style={sheet.fieldLabel}>Name *</Text>
              <TextInput
                style={sheet.fieldInput}
                value={newWsName}
                onChangeText={setNewWsName}
                placeholder="e.g. Product Team"
                placeholderTextColor="#4b5563"
                autoFocus
                autoCapitalize="words"
              />
            </View>
            <View style={sheet.fieldGroup}>
              <Text style={sheet.fieldLabel}>Description (optional)</Text>
              <TextInput
                style={[sheet.fieldInput, { minHeight: 68, textAlignVertical: 'top', paddingTop: 10 }]}
                value={newWsDesc}
                onChangeText={setNewWsDesc}
                placeholder="What is this workspace for?"
                placeholderTextColor="#4b5563"
                multiline
              />
            </View>
            <TouchableOpacity
              style={[sheet.saveBtn, (!newWsName.trim() || createWsMutation.isPending) && sheet.saveBtnDisabled]}
              onPress={() => { if (newWsName.trim()) createWsMutation.mutate() }}
              disabled={!newWsName.trim() || createWsMutation.isPending}
            >
              {createWsMutation.isPending
                ? <ActivityIndicator color="white" />
                : <Text style={sheet.saveBtnText}>Create Workspace</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  )
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 14 },
  topEmail: { flex: 1, textAlign: 'center', fontSize: 13, color: '#9ca3af', fontWeight: '500' },
  closeBtn: { position: 'absolute', right: 16, width: 30, height: 30, borderRadius: 15, backgroundColor: '#1e293b', justifyContent: 'center', alignItems: 'center' },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },

  avatarSection: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  avatarCircle: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: '#6366f1',
    justifyContent: 'center', alignItems: 'center', marginBottom: 4,
    shadowColor: '#6366f1', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 12, elevation: 8,
  },
  avatarInitials: { fontSize: 34, fontWeight: '800', color: 'white' },
  avatarEditBadge: {
    position: 'absolute', bottom: 2, right: 2,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#334155', justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#0f172a',
  },
  greeting: { fontSize: 24, fontWeight: '800', color: 'white' },
  rolePill: { backgroundColor: '#1e3a5f', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  rolePillText: { fontSize: 11, color: '#60a5fa', fontWeight: '700', letterSpacing: 0.8 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  verifiedText: { fontSize: 12, color: '#22c55e', fontWeight: '600' },
  unverifiedText: { fontSize: 12, color: '#f59e0b', fontWeight: '600' },

  card: { backgroundColor: '#1e293b', borderRadius: 16, overflow: 'hidden', marginBottom: 16 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 4, paddingHorizontal: 4 },

  wsHeaderRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16 },
  wsHeaderLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: 'white' },
  wsAvatarStack: { flexDirection: 'row', alignItems: 'center' },
  wsSmAvatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#6366f1', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#1e293b' },
  wsSmAvatarText: { fontSize: 10, fontWeight: '700', color: 'white' },
  wsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  wsAvatar: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#6366f1', justifyContent: 'center', alignItems: 'center' },
  wsAvatarText: { fontSize: 14, fontWeight: '700', color: 'white' },
  wsName: { fontSize: 14, fontWeight: '600', color: 'white' },
  wsDesc: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  wsRole: { fontSize: 11, color: '#6b7280', fontWeight: '600', textTransform: 'capitalize' },
  wsNewRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13 },
  wsNewIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#1e3a5f', justifyContent: 'center', alignItems: 'center' },
  wsNewLabel: { fontSize: 14, fontWeight: '600', color: '#818cf8' },

  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  settingIconWrap: { width: 34, height: 34, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  settingTextWrap: { flex: 1 },
  settingLabel: { fontSize: 15, fontWeight: '500', color: 'white' },
  settingHint: { fontSize: 12, color: '#475569', marginTop: 1 },
  rowDivider: { height: 1, backgroundColor: '#0f172a', marginHorizontal: 16 },

  version: { textAlign: 'center', fontSize: 12, color: '#334155', marginTop: 8, marginBottom: 4 },
  footer: { textAlign: 'center', fontSize: 12, color: '#334155', marginBottom: 8 },
})

// ─── Sheet Styles (shared by all bottom sheets) ────────────────────────────────

const sheet = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  panel: { backgroundColor: '#1e293b', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#374151', alignSelf: 'center', marginBottom: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  title: { fontSize: 18, fontWeight: '700', color: 'white' },
  subtitle: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  fieldGroup: { marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#9ca3af', marginBottom: 6 },
  fieldInput: { borderWidth: 1.5, borderColor: '#374151', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: 'white', backgroundColor: '#0f172a' },
  saveBtn: { backgroundColor: '#6366f1', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  saveBtnDisabled: { backgroundColor: '#3730a3' },
  saveBtnText: { color: 'white', fontSize: 16, fontWeight: '700' },
  // Time picker rows
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 4, borderRadius: 10 },
  timeRowActive: { backgroundColor: '#1e3a5f' },
  timeIcon: { width: 34, height: 34, borderRadius: 8, backgroundColor: '#334155', justifyContent: 'center', alignItems: 'center' },
  timeIconActive: { backgroundColor: '#1e3a8a' },
  timeLabel: { flex: 1, fontSize: 15, color: '#d1d5db', fontWeight: '500' },
  timeLabelActive: { color: '#818cf8', fontWeight: '700' },
})
