import { useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { CompositeNavigationProp } from '@react-navigation/native'
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs'
import { workspacesApi } from '../services/api'
import { MainStackParamList, TabParamList, Workspace } from '../types'
import { useAuthStore } from '../store/authStore'

type Props = {
  navigation: CompositeNavigationProp<
    BottomTabNavigationProp<TabParamList, 'Workspaces'>,
    NativeStackNavigationProp<MainStackParamList>
  >
}

const WORKSPACE_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#06b6d4', '#10b981',
  '#f59e0b', '#ef4444', '#3b82f6',
]

function getWorkspaceColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return WORKSPACE_COLORS[Math.abs(hash) % WORKSPACE_COLORS.length]
}

// ─── Create Modal ─────────────────────────────────────────────────────────────

function CreateWorkspaceModal({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const queryClient = useQueryClient()
  const [wsName, setWsName] = useState('')
  const [wsDesc, setWsDesc] = useState('')

  const createMutation = useMutation({
    mutationFn: () =>
      workspacesApi.create(wsName.trim(), wsDesc.trim() || undefined).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
      setWsName('')
      setWsDesc('')
      onCreated()
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to create workspace.'
      Alert.alert('Error', msg)
    },
  })

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableOpacity style={styles.modalBackdrop} onPress={onClose} activeOpacity={1} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeaderRow}>
            <Text style={styles.modalTitle}>New Workspace</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>
              Name <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="e.g. Product Team"
              value={wsName}
              onChangeText={setWsName}
              placeholderTextColor="#9ca3af"
              maxLength={80}
              autoFocus
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput
              style={[styles.fieldInput, styles.fieldTextarea]}
              placeholder="What is this workspace for?"
              value={wsDesc}
              onChangeText={setWsDesc}
              placeholderTextColor="#9ca3af"
              multiline
              maxLength={500}
              textAlignVertical="top"
            />
          </View>

          <TouchableOpacity
            style={[
              styles.createBtn,
              (!wsName.trim() || createMutation.isPending) && styles.createBtnDisabled,
            ]}
            onPress={() => createMutation.mutate()}
            disabled={!wsName.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.createBtnText}>Create Workspace</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ─── Workspace Card ───────────────────────────────────────────────────────────

function WorkspaceCard({
  workspace,
  onPress,
}: {
  workspace: Workspace
  onPress: () => void
}) {
  const color = getWorkspaceColor(workspace.name)
  const taskCount = workspace._count?.tasks ?? 0
  const memberCount = workspace._count?.members ?? 0

  return (
    <TouchableOpacity style={styles.wsCard} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.wsIconWrap, { backgroundColor: color + '18' }]}>
        <Text style={[styles.wsInitial, { color }]}>
          {workspace.name.charAt(0).toUpperCase()}
        </Text>
      </View>

      <View style={styles.wsInfo}>
        <View style={styles.wsNameRow}>
          <Text style={styles.wsName} numberOfLines={1}>
            {workspace.name}
          </Text>
          {workspace.memberRole && (
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>{workspace.memberRole}</Text>
            </View>
          )}
        </View>
        {workspace.description ? (
          <Text style={styles.wsDesc} numberOfLines={1}>
            {workspace.description}
          </Text>
        ) : null}
        <View style={styles.wsStats}>
          <View style={styles.wsStat}>
            <Ionicons name="checkmark-done-outline" size={13} color="#9ca3af" />
            <Text style={styles.wsStatText}>{taskCount} tasks</Text>
          </View>
          <View style={styles.wsStat}>
            <Ionicons name="people-outline" size={13} color="#9ca3af" />
            <Text style={styles.wsStatText}>{memberCount} members</Text>
          </View>
        </View>
      </View>

      <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
    </TouchableOpacity>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function WorkspacesScreen({ navigation }: Props) {
  const [showModal, setShowModal] = useState(false)
  const user = useAuthStore((s) => s.user)

  const {
    data,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => workspacesApi.list().then((r) => r.data),
  })

  const workspaces: Workspace[] = data?.workspaces ?? []

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.screenTitle}>Workspaces</Text>
          <Text style={styles.screenSub}>{workspaces.length} workspace{workspaces.length !== 1 ? 's' : ''}</Text>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setShowModal(true)}
        >
          <Ionicons name="add" size={22} color="white" />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color="#6366f1" />
        </View>
      ) : workspaces.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIcon}>
            <Ionicons name="folder-open-outline" size={44} color="#6366f1" />
          </View>
          <Text style={styles.emptyTitle}>No workspaces yet</Text>
          <Text style={styles.emptyText}>
            Create your first workspace to start organizing tasks and collaborating with your team.
          </Text>
          <TouchableOpacity
            style={styles.emptyCreateBtn}
            onPress={() => setShowModal(true)}
          >
            <Ionicons name="add" size={18} color="white" />
            <Text style={styles.emptyCreateBtnText}>Create Workspace</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={workspaces}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isFetching}
              onRefresh={refetch}
              tintColor="#6366f1"
            />
          }
          renderItem={({ item }) => (
            <WorkspaceCard
              workspace={item}
              onPress={() =>
                navigation.navigate('Tasks', { workspaceId: item.id })
              }
            />
          )}
          ListFooterComponent={
            <TouchableOpacity
              style={styles.footerCreateBtn}
              onPress={() => setShowModal(true)}
            >
              <Ionicons name="add-circle-outline" size={18} color="#6366f1" />
              <Text style={styles.footerCreateBtnText}>New Workspace</Text>
            </TouchableOpacity>
          }
        />
      )}

      <CreateWorkspaceModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        onCreated={() => setShowModal(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f3ff' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  screenTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  screenSub: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  addBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loaderWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 16, paddingBottom: 40 },
  wsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    gap: 12,
  },
  wsIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  wsInitial: { fontSize: 20, fontWeight: '800' },
  wsInfo: { flex: 1 },
  wsNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 3,
  },
  wsName: { fontSize: 15, fontWeight: '700', color: '#111827', flex: 1 },
  roleBadge: {
    backgroundColor: '#ede9fe',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  roleBadgeText: { fontSize: 10, color: '#6366f1', fontWeight: '700', textTransform: 'capitalize' },
  wsDesc: { fontSize: 12, color: '#6b7280', marginBottom: 6 },
  wsStats: { flexDirection: 'row', gap: 12 },
  wsStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  wsStatText: { fontSize: 11, color: '#9ca3af' },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    gap: 8,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: '#ede9fe',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 8,
  },
  emptyCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366f1',
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 6,
    marginTop: 8,
  },
  emptyCreateBtnText: { color: 'white', fontWeight: '700', fontSize: 15 },
  footerCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#c7d2fe',
    borderRadius: 14,
    marginTop: 4,
  },
  footerCreateBtnText: { fontSize: 14, color: '#6366f1', fontWeight: '600' },
  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalSheet: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e5e7eb',
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  fieldGroup: { marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  required: { color: '#ef4444' },
  fieldInput: {
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#f9fafb',
  },
  fieldTextarea: { minHeight: 80, textAlignVertical: 'top', paddingTop: 12 },
  createBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  createBtnDisabled: { backgroundColor: '#c7d2fe' },
  createBtnText: { color: 'white', fontSize: 16, fontWeight: '700' },
})
