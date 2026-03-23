import { useState, useEffect, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView,
  Platform, Switch, Modal, Animated, Pressable,
} from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RouteProp } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { workspacesApi } from '../services/api'
import { MainStackParamList, Workspace, WorkspaceMember, WorkspaceMemberRole } from '../types'
import { useAuthStore } from '../store/authStore'

type Props = {
  navigation: NativeStackNavigationProp<MainStackParamList, 'WorkspaceSettings'>
  route: RouteProp<MainStackParamList, 'WorkspaceSettings'>
}

const ROLE_LABELS: Record<WorkspaceMemberRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
}

const ROLE_COLORS: Record<WorkspaceMemberRole, { bg: string; text: string }> = {
  owner: { bg: '#fef3c7', text: '#d97706' },
  admin: { bg: '#dbeafe', text: '#2563eb' },
  member: { bg: '#f3f4f6', text: '#6b7280' },
}

const DEPARTMENTS = ['Sales', 'Engineering', 'Pre-Sales', 'Delivery', 'Product']

function avatarInitials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
}

// ── Bottom Sheet ──────────────────────────────────────────────────────────────
function BottomSheet({
  visible,
  onClose,
  children,
  title,
}: {
  visible: boolean
  onClose: () => void
  children: React.ReactNode
  title: string
}) {
  const slideAnim = useRef(new Animated.Value(400)).current

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 180,
      }).start()
    } else {
      Animated.timing(slideAnim, {
        toValue: 400,
        duration: 200,
        useNativeDriver: true,
      }).start()
    }
  }, [visible])

  if (!visible) return null

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.sheetOverlay} onPress={onClose}>
        <Animated.View
          style={[styles.sheetContainer, { transform: [{ translateY: slideAnim }] }]}
        >
          <Pressable onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{title}</Text>
              <TouchableOpacity onPress={onClose} style={styles.sheetClose}>
                <Ionicons name="close" size={20} color="#6b7280" />
              </TouchableOpacity>
            </View>
            {children}
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  )
}

export default function WorkspaceSettingsScreen({ navigation, route }: Props) {
  const { workspaceId } = route.params
  const queryClient = useQueryClient()
  const { user } = useAuthStore()

  // ── State ────────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'general' | 'members' | 'notifications' | 'daily'>('general')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [showAddMember, setShowAddMember] = useState(false)
  const [addEmail, setAddEmail] = useState('')
  const [addRole, setAddRole] = useState<'admin' | 'member'>('member')
  const [addProfile, setAddProfile] = useState('')

  // Member edit sheet
  const [editMember, setEditMember] = useState<WorkspaceMember | null>(null)
  const [editRole, setEditRole] = useState<'admin' | 'member'>('member')
  const [editDept, setEditDept] = useState('')

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: () => workspacesApi.get(workspaceId).then((r) => r.data),
  })
  const workspace: Workspace | undefined = (data as { workspace?: Workspace })?.workspace

  useEffect(() => {
    if (workspace) {
      setName(workspace.name)
      setDescription(workspace.description || '')
    }
  }, [workspace?.id])

  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => workspacesApi.getMembers(workspaceId).then((r) => r.data),
  })
  const members: WorkspaceMember[] = (membersData as { members?: WorkspaceMember[] })?.members ?? []
  const myRole = members.find((m) => m.userId === user?.id)?.role
  const isOwner = myRole === 'owner'
  const isOwnerOrAdmin = myRole === 'owner' || myRole === 'admin'

  const { data: emailSettingsData, isLoading: emailSettingsLoading } = useQuery({
    queryKey: ['workspace-email-settings', workspaceId],
    queryFn: () => (workspacesApi as any).getEmailSettings(workspaceId).then((r: any) => r.data.settings),
    enabled: isOwnerOrAdmin,
  })
  const emailSettings: (Record<string, boolean> & { dailyReportEnabled?: boolean; dailyReportTime?: string }) | undefined = emailSettingsData ?? undefined

  // ── Mutations ────────────────────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: () => workspacesApi.update(workspaceId, { name: name.trim(), description: description.trim() || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
      queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] })
      Alert.alert('Saved', 'Workspace settings updated.')
    },
    onError: () => Alert.alert('Error', 'Failed to update workspace.'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => workspacesApi.delete(workspaceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
      navigation.navigate('Main' as any)
    },
    onError: () => Alert.alert('Error', 'Failed to delete workspace.'),
  })

  const addMemberMutation = useMutation({
    mutationFn: () =>
      workspacesApi.addMember(workspaceId, {
        email: addEmail.trim(),
        role: addRole,
        ...(addProfile ? { profile: addProfile } : {}),
      }),
    onSuccess: (res: { data?: { message?: string } }) => {
      queryClient.invalidateQueries({ queryKey: ['workspace-members', workspaceId] })
      Alert.alert('Member Added!', 'User has been added and an email notification has been sent.')
      setAddEmail('')
      setAddRole('member')
      setAddProfile('')
      setShowAddMember(false)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to add member.'
      Alert.alert('Error', msg)
    },
  })

  const updateMemberMutation = useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: { role?: string; profile?: string } }) =>
      (workspacesApi as any).updateMember(workspaceId, userId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-members', workspaceId] })
      setEditMember(null)
    },
    onError: () => Alert.alert('Error', 'Failed to update member.'),
  })

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => workspacesApi.removeMember(workspaceId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-members', workspaceId] })
    },
    onError: () => Alert.alert('Error', 'Failed to remove member.'),
  })

  const updateEmailSettingsMutation = useMutation({
    mutationFn: (settings: Record<string, boolean | string>) =>
      (workspacesApi as any).updateEmailSettings(workspaceId, settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-email-settings', workspaceId] })
    },
    onError: () => Alert.alert('Error', 'Failed to update email settings.'),
  })

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const openEditMember = (member: WorkspaceMember) => {
    setEditMember(member)
    setEditRole(member.role as 'admin' | 'member')
    setEditDept((member as any).profile || '')
  }

  const saveEditMember = () => {
    if (!editMember) return
    updateMemberMutation.mutate({
      userId: editMember.userId,
      data: { role: editRole, profile: editDept || '' },
    })
  }

  const handleRemoveMember = (member: WorkspaceMember) => {
    Alert.alert('Remove member', `Remove ${member.user.name} from this workspace?`, [
      { text: 'Remove', style: 'destructive', onPress: () => removeMemberMutation.mutate(member.userId) },
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  const handleDeleteWorkspace = () => {
    Alert.alert(
      'Delete Workspace',
      `Are you sure you want to delete "${workspace?.name}"? This cannot be undone.`,
      [
        { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate() },
        { text: 'Cancel', style: 'cancel' },
      ]
    )
  }

  const TABS = [
    { key: 'general', icon: 'settings-outline', label: 'General' },
    { key: 'members', icon: 'people-outline', label: 'Members' },
    ...(isOwnerOrAdmin
      ? [{ key: 'notifications', icon: 'mail-outline', label: 'Notify' }]
      : []),
    ...(isOwner ? [{ key: 'daily', icon: 'time-outline', label: 'Report' }] : []),
  ] as const

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#6366f1" />
      </View>
    )
  }

  // ── Tab content renderers ─────────────────────────────────────────────────────
  const renderGeneral = () => (
    <View style={styles.tabContent}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Workspace Info</Text>
        {isOwnerOrAdmin ? (
          <>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Name</Text>
              <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Workspace name" />
            </View>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Description</Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={description}
                onChangeText={setDescription}
                placeholder="Optional description"
                multiline
                textAlignVertical="top"
              />
            </View>
            <TouchableOpacity
              style={[styles.primaryBtn, (!name.trim() || updateMutation.isPending) && styles.btnDisabled]}
              onPress={() => updateMutation.mutate()}
              disabled={!name.trim() || updateMutation.isPending}
            >
              {updateMutation.isPending
                ? <ActivityIndicator color="white" size="small" />
                : <Text style={styles.primaryBtnText}>Save Changes</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Name</Text>
              <Text style={styles.infoValue}>{workspace?.name}</Text>
            </View>
            {workspace?.description ? (
              <View style={[styles.infoItem, { marginTop: 12 }]}>
                <Text style={styles.infoLabel}>Description</Text>
                <Text style={styles.infoValue}>{workspace.description}</Text>
              </View>
            ) : null}
          </>
        )}
      </View>

      {isOwner && (
        <View style={[styles.card, styles.dangerCard]}>
          <Text style={styles.dangerTitle}>Danger Zone</Text>
          <Text style={styles.dangerDesc}>This action is irreversible.</Text>
          <TouchableOpacity
            style={[styles.dangerBtn, deleteMutation.isPending && styles.btnDisabled]}
            onPress={handleDeleteWorkspace}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending
              ? <ActivityIndicator color="white" size="small" />
              : (
                <View style={styles.btnRow}>
                  <Ionicons name="trash-outline" size={15} color="white" style={{ marginRight: 6 }} />
                  <Text style={styles.dangerBtnText}>Delete Workspace</Text>
                </View>
              )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  )

  const renderMembers = () => (
    <View style={styles.tabContent}>
      {/* Header row */}
      <View style={styles.sectionMeta}>
        <Text style={styles.sectionMetaText}>
          {members.length} member{members.length !== 1 ? 's' : ''}
        </Text>
        {membersLoading && <ActivityIndicator color="#6366f1" size="small" />}
        {isOwnerOrAdmin && (
          <TouchableOpacity style={styles.addMemberBtn} onPress={() => setShowAddMember(true)}>
            <Ionicons name="person-add-outline" size={14} color="#6366f1" />
            <Text style={styles.addMemberBtnText}>Add Member</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Member list as one block — inner rowGap handles spacing */}
      <View style={{ rowGap: 10 }}>
        {members.map((member) => {
          const roleColor = ROLE_COLORS[member.role] || ROLE_COLORS.member
          return (
            <View key={member.userId} style={styles.memberCard}>
              <View style={styles.memberAvatar}>
                <Text style={styles.memberAvatarText}>{avatarInitials(member.user.name)}</Text>
              </View>

              <View style={styles.memberBody}>
                <Text style={styles.memberName} numberOfLines={1}>{member.user.name}</Text>
                <Text style={styles.memberEmail} numberOfLines={1}>{member.user.email}</Text>
                <View style={styles.memberBadges}>
                  <View style={[styles.badge, { backgroundColor: roleColor.bg }]}>
                    <Text style={[styles.badgeText, { color: roleColor.text }]}>
                      {ROLE_LABELS[member.role]}
                    </Text>
                  </View>
                  {(member as any).profile ? (
                    <View style={styles.deptBadge}>
                      <Text style={styles.deptBadgeText}>{(member as any).profile}</Text>
                    </View>
                  ) : null}
                </View>
              </View>

              {isOwnerOrAdmin && member.role !== 'owner' && member.userId !== user?.id && (
                <View style={styles.memberActions}>
                  <TouchableOpacity style={styles.editBtn} onPress={() => openEditMember(member)}>
                    <Ionicons name="pencil-outline" size={14} color="#6366f1" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => handleRemoveMember(member)}
                    disabled={removeMemberMutation.isPending}
                  >
                    <Ionicons name="close" size={13} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )
        })}
        {members.length === 0 && !membersLoading && (
          <Text style={styles.emptyText}>No members found.</Text>
        )}
      </View>
    </View>
  )

  const renderNotifications = () => {
    const rows = [
      { key: 'notifyOnTaskCreate', label: 'Task Created', desc: 'When a new task is created' },
      { key: 'notifyOnTaskAssign', label: 'Task Assigned', desc: 'When a task is assigned' },
      { key: 'notifyOnTaskComplete', label: 'Task Completed', desc: 'When a task is marked done' },
      { key: 'notifyOnComment', label: 'New Update', desc: 'When an update is posted' },
      { key: 'notifyOnDueDate', label: 'Due Date Reminder', desc: 'When a task is due soon' },
    ]
    return (
      <View style={styles.tabContent}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Email Notifications</Text>
          {emailSettingsLoading ? (
            <ActivityIndicator color="#6366f1" style={{ paddingVertical: 16 }} />
          ) : (
            <View>
              {rows.map(({ key, label, desc }, i) => (
                <View
                  key={key}
                  style={[styles.notifRow, i < rows.length - 1 && styles.notifRowBorder]}
                >
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={styles.notifLabel}>{label}</Text>
                    <Text style={styles.notifDesc}>{desc}</Text>
                  </View>
                  <Switch
                    value={!!(emailSettings as Record<string, boolean> | undefined)?.[key]}
                    onValueChange={(val) => updateEmailSettingsMutation.mutate({ [key]: val })}
                    trackColor={{ false: '#e5e7eb', true: '#a5b4fc' }}
                    thumbColor={(emailSettings as Record<string, boolean> | undefined)?.[key] ? '#6366f1' : '#f9fafb'}
                    disabled={updateEmailSettingsMutation.isPending}
                  />
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    )
  }

  const renderDaily = () => (
    <View style={styles.tabContent}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Daily Report</Text>
        <Text style={styles.cardDesc}>Send a workspace-wide summary email to all members each day.</Text>

        <View style={styles.notifRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.notifLabel}>Enable Daily Report</Text>
            <Text style={styles.notifDesc}>Workspace-wide digest email</Text>
          </View>
          <Switch
            value={emailSettings?.dailyReportEnabled ?? false}
            onValueChange={(val) => updateEmailSettingsMutation.mutate({ dailyReportEnabled: val })}
            trackColor={{ false: '#e5e7eb', true: '#6366f1' }}
            thumbColor="white"
          />
        </View>

        {emailSettings?.dailyReportEnabled && (
          <>
            <View style={styles.divider} />
            <Text style={[styles.fieldLabel, { marginBottom: 10 }]}>Report Time</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsRow}>
              {['06:00','07:00','08:00','09:00','10:00','12:00','18:00','20:00'].map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.pill, (emailSettings?.dailyReportTime || '08:00') === t && styles.pillActive]}
                  onPress={() => updateEmailSettingsMutation.mutate({ dailyReportTime: t })}
                >
                  <Text style={[styles.pillText, (emailSettings?.dailyReportTime || '08:00') === t && styles.pillTextActive]}>
                    {t}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}
      </View>
    </View>
  )

  const tabContent: Record<string, () => React.JSX.Element> = {
    general: renderGeneral,
    members: renderMembers,
    notifications: renderNotifications,
    daily: renderDaily,
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        {/* Tab bar */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabBar}
          contentContainerStyle={styles.tabBarContent}
        >
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => setActiveTab(tab.key as typeof activeTab)}
            >
              <Ionicons
                name={tab.icon as any}
                size={15}
                color={activeTab === tab.key ? '#6366f1' : '#9ca3af'}
              />
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Content */}
        <ScrollView style={styles.scrollArea} contentContainerStyle={{ paddingBottom: 60 }}>
          {(tabContent[activeTab] ?? tabContent.general)()}
        </ScrollView>
      </View>

      {/* Add Member Sheet */}
      <BottomSheet visible={showAddMember} onClose={() => setShowAddMember(false)} title="Add Member">
        <View style={styles.sheetBody}>
          <Text style={styles.sheetFieldLabel}>Email Address</Text>
          <TextInput
            style={[styles.input, { marginBottom: 16 }]}
            value={addEmail}
            onChangeText={setAddEmail}
            placeholder="colleague@company.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoFocus
          />

          <Text style={styles.sheetFieldLabel}>Role</Text>
          <View style={[styles.toggleRow, { marginBottom: 16 }]}>
            {(['admin', 'member'] as const).map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.toggleBtn, addRole === r && styles.toggleBtnActive]}
                onPress={() => setAddRole(r)}
              >
                <Text style={[styles.toggleBtnText, addRole === r && styles.toggleBtnTextActive]}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sheetFieldLabel}>Department (optional)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.pillsRow, { marginBottom: 16 }]}>
            <TouchableOpacity
              style={[styles.pill, addProfile === '' && styles.pillActive]}
              onPress={() => setAddProfile('')}
            >
              <Text style={[styles.pillText, addProfile === '' && styles.pillTextActive]}>None</Text>
            </TouchableOpacity>
            {DEPARTMENTS.map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.pill, addProfile === p && styles.pillActive]}
                onPress={() => setAddProfile(addProfile === p ? '' : p)}
              >
                <Text style={[styles.pillText, addProfile === p && styles.pillTextActive]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <TouchableOpacity
            style={[styles.primaryBtn, (!addEmail.trim() || addMemberMutation.isPending) && styles.btnDisabled]}
            onPress={() => { if (addEmail.trim()) addMemberMutation.mutate() }}
            disabled={!addEmail.trim() || addMemberMutation.isPending}
          >
            {addMemberMutation.isPending
              ? <ActivityIndicator color="white" size="small" />
              : <Text style={styles.primaryBtnText}>Add to Workspace</Text>}
          </TouchableOpacity>
        </View>
      </BottomSheet>

      {/* Member Edit Sheet */}
      <BottomSheet
        visible={!!editMember}
        onClose={() => setEditMember(null)}
        title={`Edit ${editMember?.user.name || 'Member'}`}
      >
        <View style={styles.sheetBody}>
          {/* Role */}
          <Text style={styles.sheetFieldLabel}>Role</Text>
          <View style={styles.toggleRow}>
            {(['admin', 'member'] as const).map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.toggleBtn, editRole === r && styles.toggleBtnActive]}
                onPress={() => setEditRole(r)}
              >
                <Text style={[styles.toggleBtnText, editRole === r && styles.toggleBtnTextActive]}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Department */}
          <Text style={[styles.sheetFieldLabel, { marginTop: 18 }]}>Department</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsRow}>
            <TouchableOpacity
              style={[styles.pill, editDept === '' && styles.pillActive]}
              onPress={() => setEditDept('')}
            >
              <Text style={[styles.pillText, editDept === '' && styles.pillTextActive]}>None</Text>
            </TouchableOpacity>
            {DEPARTMENTS.map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.pill, editDept === p && styles.pillActive]}
                onPress={() => setEditDept(editDept === p ? '' : p)}
              >
                <Text style={[styles.pillText, editDept === p && styles.pillTextActive]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Save */}
          <TouchableOpacity
            style={[styles.primaryBtn, { marginTop: 24 }, updateMemberMutation.isPending && styles.btnDisabled]}
            onPress={saveEditMember}
            disabled={updateMemberMutation.isPending}
          >
            {updateMemberMutation.isPending
              ? <ActivityIndicator color="white" size="small" />
              : <Text style={styles.primaryBtnText}>Save Changes</Text>}
          </TouchableOpacity>
        </View>
      </BottomSheet>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f3ff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Tab bar
  tabBar: {
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    maxHeight: 60,
  },
  tabBarContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
  },
  tabActive: {
    backgroundColor: '#eef2ff',
  },
  tabText: { fontSize: 13, fontWeight: '600', color: '#9ca3af' },
  tabTextActive: { color: '#6366f1' },

  // Scroll area
  scrollArea: { flex: 1 },
  tabContent: { padding: 16, flexDirection: 'column', rowGap: 14 },

  // Cards
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 14,
  },
  cardDesc: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: -8,
    marginBottom: 16,
    lineHeight: 18,
  },
  dangerCard: {
    borderWidth: 1,
    borderColor: '#fee2e2',
    backgroundColor: '#fff5f5',
  },
  dangerTitle: { fontSize: 14, fontWeight: '700', color: '#ef4444', marginBottom: 4 },
  dangerDesc: { fontSize: 13, color: '#9ca3af', marginBottom: 14 },

  // Fields
  field: { marginBottom: 14 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6b7280',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: '#111827',
    backgroundColor: 'white',
  },
  multiline: { minHeight: 80, paddingTop: 12 },

  // Info display
  infoItem: {},
  infoLabel: {
    fontSize: 11,
    color: '#9ca3af',
    marginBottom: 3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  infoValue: { fontSize: 15, fontWeight: '500', color: '#111827' },

  // Buttons
  primaryBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  primaryBtnText: { color: 'white', fontSize: 15, fontWeight: '700' },
  secondaryBtn: {
    backgroundColor: 'white',
    borderWidth: 1.5,
    borderColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  secondaryBtnText: { color: '#6366f1', fontSize: 15, fontWeight: '700' },
  dangerBtn: {
    backgroundColor: '#ef4444',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerBtnText: { color: 'white', fontSize: 14, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },
  btnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },

  // Role toggle
  toggleRow: { flexDirection: 'row', columnGap: 8 },
  toggleBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
  },
  toggleBtnActive: { borderColor: '#6366f1', backgroundColor: '#eef2ff' },
  toggleBtnText: { fontSize: 14, fontWeight: '600', color: '#9ca3af' },
  toggleBtnTextActive: { color: '#6366f1' },

  // Pills (department)
  pillsRow: { flexDirection: 'row', columnGap: 8, paddingVertical: 4 },
  pill: {
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: { borderColor: '#6366f1', backgroundColor: '#eef2ff' },
  pillText: { fontSize: 13, fontWeight: '600', color: '#9ca3af' },
  pillTextActive: { color: '#6366f1' },

  // Section meta (above members)
  sectionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  sectionMetaText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
  },
  addMemberBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 5,
    backgroundColor: '#eef2ff',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  addMemberBtnText: { fontSize: 12, fontWeight: '700', color: '#6366f1' },

  // Member cards
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 14,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ede9fe',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  memberAvatarText: { fontSize: 15, fontWeight: '700', color: '#6366f1' },
  memberBody: { flex: 1, marginRight: 8, minWidth: 0 },
  memberName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  memberEmail: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  memberBadges: { flexDirection: 'row', alignItems: 'center', columnGap: 5, marginTop: 6, flexWrap: 'wrap' },
  badge: { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  deptBadge: { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3, backgroundColor: '#f3e8ff' },
  deptBadgeText: { fontSize: 11, fontWeight: '600', color: '#7c3aed' },
  memberActions: { flexDirection: 'row', alignItems: 'center', columnGap: 6, flexShrink: 0 },
  editBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#eef2ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fee2e2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: { fontSize: 14, color: '#9ca3af', textAlign: 'center', paddingVertical: 16 },

  // Notification rows
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
  },
  notifRowBorder: { borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  notifLabel: { fontSize: 14, fontWeight: '600', color: '#111827' },
  notifDesc: { fontSize: 12, color: '#9ca3af', marginTop: 3 },

  divider: { height: 1, backgroundColor: '#f3f4f6', marginVertical: 12 },

  // Bottom sheet
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: Platform.OS === 'ios' ? 34 : 24,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#d1d5db',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  sheetClose: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
  sheetBody: { padding: 20 },
  sheetFieldLabel: { fontSize: 12, fontWeight: '700', color: '#6b7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
})
