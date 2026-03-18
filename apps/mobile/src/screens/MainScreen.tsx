import { useState, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, RefreshControl, ScrollView,
  Alert, Modal, KeyboardAvoidingView, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { tasksApi, workspacesApi } from '../services/api'
import TaskCard from '../components/TaskCard'
import { MainStackParamList, Task, Workspace } from '../types'
import { useAuthStore } from '../store/authStore'

type Props = {
  navigation: NativeStackNavigationProp<MainStackParamList, 'Main'>
}

interface ScopeFilter {
  id: string
  scope: 'name' | 'tag' | 'category' | 'status' | 'all'
  value: string
  label: string
}

export default function MainScreen({ navigation }: Props) {
  const { user, logout } = useAuthStore()
  const queryClient = useQueryClient()

  const [selectedWsId, setSelectedWsId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [wsDropdownOpen, setWsDropdownOpen] = useState(false)
  const [scopeFilters, setScopeFilters] = useState<ScopeFilter[]>([])
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false)
  const [addSheetOpen, setAddSheetOpen] = useState(false)
  const [createWsOpen, setCreateWsOpen] = useState(false)
  const [wsName, setWsName] = useState('')
  const [wsDesc, setWsDesc] = useState('')

  // Workspaces
  const { data: wsData, isLoading: wsLoading } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => workspacesApi.list().then((r) => r.data),
  })
  const workspaces: Workspace[] = (wsData as { workspaces?: Workspace[] })?.workspaces || []
  const activeWsId = selectedWsId || workspaces[0]?.id || null
  const activeWs = workspaces.find((w) => w.id === activeWsId)

  // Tasks — fetch all, filter client-side
  const { data: tasksData, isLoading: tasksLoading, refetch, isFetching } = useQuery({
    queryKey: ['tasks', activeWsId],
    queryFn: () => tasksApi.list(activeWsId!, { limit: '500' }).then((r) => r.data),
    enabled: !!activeWsId,
  })
  const allTasks: Task[] = (tasksData as { tasks?: Task[] })?.tasks || []

  // Client-side filtering
  const now = new Date()
  const filteredTasks = allTasks.filter((task) => {
    const passesScoped = scopeFilters.length === 0 || scopeFilters.every((f) => {
      const q = f.value.toLowerCase()
      switch (f.scope) {
        case 'name': return task.title.toLowerCase().includes(q)
        case 'tag': return task.tags?.some((t) => t.toLowerCase().includes(q))
        case 'category': return (task.category || '').toLowerCase().includes(q)
        case 'status': return task.status === f.value
        case 'all':
          return task.title.toLowerCase().includes(q) ||
            (task.description || '').toLowerCase().includes(q) ||
            task.tags?.some((t) => t.toLowerCase().includes(q))
        default: return true
      }
    })
    return passesScoped
  })

  // Stats — reflect current search/filter results
  const stats = {
    total: filteredTasks.length,
    inProgress: filteredTasks.filter((t) => t.status === 'in-progress').length,
    completed: filteredTasks.filter((t) => t.status === 'completed').length,
    overdue: filteredTasks.filter((t) => t.dueDate && new Date(t.dueDate) < now && t.status !== 'completed').length,
  }

  const handleTaskPress = useCallback((task: Task) => {
    navigation.push('TaskDetail', { taskId: task.id, workspaceId: task.workspaceId })
  }, [navigation])

  const handleAddTask = () => {
    if (!activeWsId) return
    setAddSheetOpen(true)
  }

  const handleProfile = () => navigation.push('Profile')

  const createWsMutation = useMutation({
    mutationFn: () => workspacesApi.create(wsName.trim(), wsDesc.trim() || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
      setCreateWsOpen(false)
      setWsName('')
      setWsDesc('')
    },
    onError: () => Alert.alert('Error', 'Failed to create workspace.'),
  })

  const isLoading = wsLoading || tasksLoading

  return (
    <SafeAreaView style={styles.container} edges={['top']}>

      {/* ── Header ────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.wsSelector}
          onPress={() => workspaces.length > 1 && setWsDropdownOpen((v) => !v)}
        >
          <View style={styles.wsAvatar}>
            <Text style={styles.wsAvatarText}>{activeWs?.name?.charAt(0).toUpperCase() || 'W'}</Text>
          </View>
          <Text style={styles.wsName} numberOfLines={1}>{activeWs?.name || 'Loading...'}</Text>
          {workspaces.length > 1 && <Ionicons name="chevron-down" size={16} color="#9ca3af" />}
        </TouchableOpacity>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.newTaskBtn}
            onPress={() => {
              if (activeWsId) navigation.push('SmartCreate', { workspaceId: activeWsId, initialMode: 'manual' })
            }}
          >
            <Ionicons name="add" size={16} color="white" />
            <Text style={styles.newTaskBtnText}>New Task</Text>
          </TouchableOpacity>
          <View style={styles.micSplit}>
            <TouchableOpacity
              style={styles.micBtnMain}
              onPress={() => {
                if (activeWsId) navigation.push('SmartCreate', { workspaceId: activeWsId, initialMode: 'live' })
              }}
            >
              <Ionicons name="mic" size={18} color="#ef4444" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.micBtnChevron} onPress={handleAddTask}>
              <Ionicons name="chevron-down" size={13} color="#6b7280" />
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.avatarBtn} onPress={handleProfile}>
            <Text style={styles.avatarText}>{user?.name?.charAt(0).toUpperCase()}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Workspace dropdown */}
      {wsDropdownOpen && workspaces.length > 1 && (
        <View style={styles.wsDropdown}>
          {workspaces.map((ws) => (
            <TouchableOpacity
              key={ws.id}
              style={styles.wsDropdownItem}
              onPress={() => { setSelectedWsId(ws.id); setWsDropdownOpen(false) }}
            >
              <View style={[styles.wsAvatar, { width: 28, height: 28 }]}>
                <Text style={styles.wsAvatarText}>{ws.name.charAt(0).toUpperCase()}</Text>
              </View>
              <Text style={styles.wsDropdownName}>{ws.name}</Text>
              {ws.id === activeWsId && <Ionicons name="checkmark" size={16} color="#6366f1" />}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── Stat cards ──────────────────────────────────────────────── */}
      <View style={styles.statsRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.statsContent}
        >
          <StatChip label="Total" value={stats.total} color="#6366f1" bg="#ede9fe" />
          <StatChip label="In Progress" value={stats.inProgress} color="#3b82f6" bg="#dbeafe" />
          <StatChip label="Completed" value={stats.completed} color="#22c55e" bg="#dcfce7" />
          <StatChip label="Overdue" value={stats.overdue} color="#ef4444" bg="#fee2e2" />
        </ScrollView>
      </View>

      {/* ── Smart Search ──────────────────────────────────────────────── */}
      <View style={styles.searchContainer}>
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={16} color="#9ca3af" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search tasks…"
            value={search}
            onChangeText={(text) => {
              setSearch(text)
              setSearchDropdownOpen(text.length > 0)
            }}
            placeholderTextColor="#c4c9d4"
            returnKeyType="search"
            onBlur={() => setTimeout(() => setSearchDropdownOpen(false), 200)}
          />
          {search.length > 0 && (
            <TouchableOpacity
              onPress={() => { setSearch(''); setSearchDropdownOpen(false) }}
              style={styles.searchClearBtn}
            >
              <Ionicons name="close" size={13} color="#9ca3af" />
            </TouchableOpacity>
          )}
        </View>

        {/* Suggestions dropdown */}
        {searchDropdownOpen && search.length > 0 && (
          <View style={styles.suggestionsBox}>
            {/* Scope section */}
            <View style={styles.suggestionSection}>
              <Text style={styles.suggestionSectionLabel}>Search scope</Text>
              {[
                { scope: 'all' as const, label: 'Everywhere', desc: search, iconName: 'search-outline' },
                { scope: 'name' as const, label: 'Task name', desc: search, iconName: 'text-outline' },
                { scope: 'tag' as const, label: 'Tag', desc: search, iconName: 'pricetag-outline' },
                { scope: 'category' as const, label: 'Category', desc: search, iconName: 'folder-outline' },
              ].map((s) => (
                <TouchableOpacity
                  key={s.scope}
                  style={styles.suggestionRow}
                  onPress={() => {
                    setScopeFilters((prev) => [...prev, { id: `${s.scope}-${Date.now()}`, scope: s.scope, value: search, label: `${s.label}: ${search}` }])
                    setSearch('')
                    setSearchDropdownOpen(false)
                  }}
                >
                  <View style={styles.suggestionIconWrap}>
                    <Ionicons name={s.iconName as any} size={14} color="#6366f1" />
                  </View>
                  <Text style={styles.suggestionLabel}>{s.label}</Text>
                  <Text style={styles.suggestionDesc} numberOfLines={1}>"{s.desc}"</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Status matches */}
            {['todo', 'in-progress', 'in-review', 'completed', 'cancelled'].filter((s) => s.includes(search.toLowerCase())).length > 0 && (
              <View style={[styles.suggestionSection, styles.suggestionSectionBorder]}>
                <Text style={styles.suggestionSectionLabel}>Status</Text>
                {(['todo', 'in-progress', 'in-review', 'completed', 'cancelled'] as const)
                  .filter((s) => s.includes(search.toLowerCase()))
                  .map((status) => {
                    const dotColors: Record<string, string> = { todo: '#9ca3af', 'in-progress': '#3b82f6', 'in-review': '#a855f7', completed: '#22c55e', cancelled: '#6b7280' }
                    return (
                      <TouchableOpacity
                        key={status}
                        style={styles.suggestionRow}
                        onPress={() => {
                          setScopeFilters((prev) => [...prev, { id: `status-${status}-${Date.now()}`, scope: 'status', value: status, label: `Status: ${status}` }])
                          setSearch('')
                          setSearchDropdownOpen(false)
                        }}
                      >
                        <View style={styles.suggestionIconWrap}>
                          <View style={[styles.statusDot, { backgroundColor: dotColors[status] || '#9ca3af' }]} />
                        </View>
                        <Text style={styles.suggestionLabel}>{status.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</Text>
                      </TouchableOpacity>
                    )
                  })}
              </View>
            )}
          </View>
        )}

        {/* Active filter chips */}
        {scopeFilters.length > 0 && (
          <View style={styles.chipsRow}>
            <Text style={styles.chipsLabel}>Filters:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsContent}>
              {scopeFilters.map((f) => (
                <View key={f.id} style={styles.filterChip}>
                  <Text style={styles.filterChipText}>{f.label}</Text>
                  <TouchableOpacity
                    onPress={() => setScopeFilters((prev) => prev.filter((x) => x.id !== f.id))}
                    style={styles.filterChipRemove}
                  >
                    <Ionicons name="close" size={10} color="#6366f1" />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity onPress={() => setScopeFilters([])} style={styles.clearChipsBtn}>
                <Text style={styles.clearChipsText}>Clear</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}
      </View>

      {/* ── Task list ───────────────────────────────────────────────── */}
      {!activeWsId ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="folder-open-outline" size={60} color="#d1d5db" />
          <Text style={styles.emptyTitle}>No workspace yet</Text>
          <Text style={styles.emptyText}>Create a workspace to get started.</Text>
          <TouchableOpacity style={styles.emptyAddBtn} onPress={() => setCreateWsOpen(true)}>
            <Ionicons name="add" size={20} color="white" />
            <Text style={styles.emptyAddBtnText}>Create Workspace</Text>
          </TouchableOpacity>
        </View>
      ) : isLoading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color="#6366f1" />
        </View>
      ) : filteredTasks.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="clipboard-outline" size={60} color="#d1d5db" />
          <Text style={styles.emptyTitle}>No tasks</Text>
          <Text style={styles.emptyText}>
            {scopeFilters.length > 0 ? 'Try adjusting your filters.' : 'Tap + to create your first task.'}
          </Text>
          {scopeFilters.length === 0 && (
            <TouchableOpacity style={styles.emptyAddBtn} onPress={handleAddTask}>
              <Ionicons name="add" size={20} color="white" />
              <Text style={styles.emptyAddBtnText}>Add Task</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={filteredTasks}
          keyExtractor={(t) => t.id}
          renderItem={({ item }) => <TaskCard task={item} onPress={() => handleTaskPress(item)} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor="#6366f1" />}
          ListHeaderComponent={
            <Text style={styles.taskCount}>
              {filteredTasks.length} {filteredTasks.length === 1 ? 'task' : 'tasks'}
              {scopeFilters.length > 0 ? ` · filtered from ${allTasks.length}` : ''}
            </Text>
          }
        />
      )}

      {/* ── Add Task Bottom Sheet ─────────────────────────────────────── */}
      <Modal
        visible={addSheetOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setAddSheetOpen(false)}
      >
        <View style={styles.sheetContainer}>
          {/* Backdrop — tap to dismiss */}
          <TouchableOpacity
            style={styles.sheetBackdrop}
            activeOpacity={1}
            onPress={() => setAddSheetOpen(false)}
          />
          {/* Sheet panel */}
          <View style={styles.sheetPanel}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>AI Create</Text>
            <Text style={styles.sheetSubtitle}>Generate tasks from audio or transcript</Text>

            {/* From Transcript */}
            <TouchableOpacity
              style={styles.sheetOption}
              activeOpacity={0.7}
              onPress={() => {
                setAddSheetOpen(false)
                if (activeWsId)
                  navigation.push('SmartCreate', { workspaceId: activeWsId, initialMode: 'transcript' })
              }}
            >
              <View style={[styles.sheetOptionIcon, { backgroundColor: '#ede9fe' }]}>
                <Ionicons name="document-text-outline" size={26} color="#6366f1" />
              </View>
              <View style={styles.sheetOptionText}>
                <Text style={styles.sheetOptionLabel}>From Transcript</Text>
                <Text style={styles.sheetOptionHint}>Paste or import an existing transcript</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
            </TouchableOpacity>

            <View style={styles.sheetDivider} />

            {/* Upload Audio */}
            <TouchableOpacity
              style={styles.sheetOption}
              activeOpacity={0.7}
              onPress={() => {
                setAddSheetOpen(false)
                if (activeWsId)
                  navigation.push('SmartCreate', { workspaceId: activeWsId, initialMode: 'audio' })
              }}
            >
              <View style={[styles.sheetOptionIcon, { backgroundColor: '#dbeafe' }]}>
                <Ionicons name="cloud-upload-outline" size={26} color="#3b82f6" />
              </View>
              <View style={styles.sheetOptionText}>
                <Text style={styles.sheetOptionLabel}>Upload Audio</Text>
                <Text style={styles.sheetOptionHint}>Upload an audio file to transcribe</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
            </TouchableOpacity>

            <View style={styles.sheetDivider} />

            {/* Import Excel / CSV */}
            <TouchableOpacity
              style={styles.sheetOption}
              activeOpacity={0.7}
              onPress={() => {
                setAddSheetOpen(false)
                if (activeWsId)
                  navigation.push('SmartCreate', { workspaceId: activeWsId, initialMode: 'excel' })
              }}
            >
              <View style={[styles.sheetOptionIcon, { backgroundColor: '#d1fae5' }]}>
                <Ionicons name="grid-outline" size={26} color="#10b981" />
              </View>
              <View style={styles.sheetOptionText}>
                <Text style={styles.sheetOptionLabel}>Import Excel / CSV</Text>
                <Text style={styles.sheetOptionHint}>Upload a spreadsheet to extract tasks</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
            </TouchableOpacity>

          </View>
        </View>
      </Modal>

      {/* ── Create Workspace Sheet ────────────────────────────────────── */}
      <Modal
        visible={createWsOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setCreateWsOpen(false)}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.sheetContainer}>
            <TouchableOpacity
              style={styles.sheetBackdrop}
              activeOpacity={1}
              onPress={() => setCreateWsOpen(false)}
            />
            <View style={styles.sheetPanel}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>New Workspace</Text>
              <Text style={styles.sheetSubtitle}>Create a space to organise your tasks</Text>

              <Text style={styles.wsFieldLabel}>Workspace Name *</Text>
              <TextInput
                style={styles.wsInput}
                placeholder="e.g. Product Team, Q2 Projects"
                value={wsName}
                onChangeText={setWsName}
                placeholderTextColor="#9ca3af"
                autoFocus
              />

              <Text style={styles.wsFieldLabel}>Description (optional)</Text>
              <TextInput
                style={[styles.wsInput, styles.wsInputMulti]}
                placeholder="What is this workspace for?"
                value={wsDesc}
                onChangeText={setWsDesc}
                placeholderTextColor="#9ca3af"
                multiline
                textAlignVertical="top"
              />

              <TouchableOpacity
                style={[styles.footerBtn, (!wsName.trim() || createWsMutation.isPending) && styles.footerBtnDisabled]}
                onPress={() => { if (wsName.trim()) createWsMutation.mutate() }}
                disabled={!wsName.trim() || createWsMutation.isPending}
              >
                {createWsMutation.isPending
                  ? <ActivityIndicator color="white" size="small" />
                  : <Text style={styles.footerBtnText}>Create Workspace</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatChip({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <View style={[styles.statChip, { backgroundColor: bg }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={[styles.statLabel, { color }]}>{label}</Text>
    </View>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f3ff' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  wsSelector: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginRight: 12 },
  wsAvatar: { width: 36, height: 36, borderRadius: 9, backgroundColor: '#6366f1', justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  wsAvatarText: { color: 'white', fontWeight: '700', fontSize: 15 },
  wsName: { fontSize: 16, fontWeight: '700', color: '#111827', flex: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  newTaskBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#6366f1',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  newTaskBtnText: { color: 'white', fontSize: 13, fontWeight: '700' },
  micBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: '#fef2f2', justifyContent: 'center', alignItems: 'center' },
  micSplit: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, overflow: 'hidden', borderWidth: 1.5, borderColor: '#e5e7eb' },
  micBtnMain: { paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#fef2f2', justifyContent: 'center', alignItems: 'center' },
  micBtnChevron: { paddingHorizontal: 7, paddingVertical: 8, backgroundColor: '#f9fafb', justifyContent: 'center', alignItems: 'center', borderLeftWidth: 1, borderLeftColor: '#e5e7eb' },
  avatarBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#e0e7ff', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#6366f1', fontWeight: '700', fontSize: 15 },

  // Workspace dropdown
  wsDropdown: { backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingVertical: 4 },
  wsDropdownItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  wsDropdownName: { flex: 1, fontSize: 15, color: '#111827', fontWeight: '500' },

  // Stats
  statsRow: { backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  statsContent: { paddingHorizontal: 14, paddingVertical: 12, gap: 8, flexDirection: 'row' },
  statChip: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14, alignItems: 'center', minWidth: 92 },
  statValue: { fontSize: 24, fontWeight: '800', lineHeight: 28 },
  statLabel: { fontSize: 12, fontWeight: '600', marginTop: 2, opacity: 0.8 },

  // Smart Search
  searchContainer: {
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    zIndex: 100,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f4f5f7',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e9eaed',
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#111827', paddingVertical: 10 },
  searchClearBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#d1d5db',
    justifyContent: 'center',
    alignItems: 'center',
  },
  suggestionsBox: {
    position: 'absolute',
    top: 52,
    left: 0,
    right: 0,
    backgroundColor: 'white',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 12,
    zIndex: 200,
    overflow: 'hidden',
  },
  suggestionSection: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 },
  suggestionSectionBorder: { borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  suggestionSectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 8,
    gap: 10,
  },
  suggestionIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#f0f0ff',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  suggestionLabel: { fontSize: 13, fontWeight: '600', color: '#111827' },
  suggestionDesc: { fontSize: 12, color: '#9ca3af', flex: 1, marginLeft: 4 },
  chipsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  chipsLabel: { fontSize: 11, fontWeight: '600', color: '#9ca3af', marginRight: 6, flexShrink: 0 },
  chipsContent: { columnGap: 6, flexDirection: 'row', alignItems: 'center' },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#eef2ff',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  filterChipText: { fontSize: 11, color: '#4f46e5', fontWeight: '600' },
  filterChipRemove: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#c7d2fe',
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearChipsBtn: { paddingHorizontal: 10, paddingVertical: 5 },
  clearChipsText: { fontSize: 11, color: '#9ca3af', fontWeight: '600' },

  // Task list
  listContent: { padding: 14, paddingBottom: 40 },
  taskCount: { fontSize: 13, color: '#9ca3af', fontWeight: '500', marginBottom: 10 },

  // Empty states
  loaderWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 19, fontWeight: '700', color: '#374151', marginTop: 12 },
  emptyText: { fontSize: 14, color: '#9ca3af', textAlign: 'center' },
  emptyAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, backgroundColor: '#6366f1', paddingHorizontal: 22, paddingVertical: 13, borderRadius: 12 },
  emptyAddBtnText: { color: 'white', fontWeight: '700', fontSize: 15 },

  // Add task bottom sheet
  sheetContainer: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheetPanel: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 12,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e5e7eb',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 4 },
  sheetSubtitle: { fontSize: 14, color: '#9ca3af', marginBottom: 20 },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    gap: 16,
  },
  sheetOptionIcon: {
    width: 52,
    height: 52,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  sheetOptionText: { flex: 1 },
  sheetOptionLabel: { fontSize: 16, fontWeight: '600', color: '#111827' },
  sheetOptionHint: { fontSize: 13, color: '#9ca3af', marginTop: 2 },
  sheetDivider: { height: 1, backgroundColor: '#f3f4f6' },

  // Create workspace form
  wsFieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 16 },
  wsInput: { borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#111827', backgroundColor: '#f9fafb', marginBottom: 4 },
  wsInputMulti: { minHeight: 72, paddingTop: 11, textAlignVertical: 'top' },
  footerBtn: { backgroundColor: '#6366f1', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  footerBtnDisabled: { backgroundColor: '#c7d2fe' },
  footerBtnText: { color: 'white', fontSize: 15, fontWeight: '700' },
})
