import { useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  FlatList,
} from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { CompositeNavigationProp } from '@react-navigation/native'
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs'
import { useAuthStore } from '../store/authStore'
import { workspacesApi, tasksApi } from '../services/api'
import { MainStackParamList, TabParamList, Workspace, Task } from '../types'
import TaskCard from '../components/TaskCard'

type Props = {
  navigation: CompositeNavigationProp<
    BottomTabNavigationProp<TabParamList, 'Home'>,
    NativeStackNavigationProp<MainStackParamList>
  >
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
  icon,
}: {
  label: string
  value: number
  color: string
  icon: keyof typeof Ionicons.glyphMap
}) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <View style={[styles.statIconWrap, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

export default function HomeScreen({ navigation }: Props) {
  const user = useAuthStore((s) => s.user)
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null)

  // Workspaces list
  const {
    data: workspacesData,
    isLoading: wsLoading,
    refetch: refetchWorkspaces,
  } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => workspacesApi.list().then((r) => r.data),
  })

  const workspaces = workspacesData?.workspaces ?? []
  const activeWorkspaceId = selectedWorkspaceId ?? workspaces[0]?.id ?? null

  // Auto-select first workspace
  useEffect(() => {
    if (!selectedWorkspaceId && workspaces.length > 0) {
      setSelectedWorkspaceId(workspaces[0].id)
    }
  }, [workspaces])

  // Analytics for active workspace
  const {
    data: analytics,
    isLoading: analyticsLoading,
    refetch: refetchAnalytics,
  } = useQuery({
    queryKey: ['analytics', activeWorkspaceId],
    queryFn: () =>
      workspacesApi.getAnalytics(activeWorkspaceId!).then((r) => r.data),
    enabled: !!activeWorkspaceId,
  })

  // Recent tasks (first 5)
  const {
    data: tasksData,
    isLoading: tasksLoading,
    refetch: refetchTasks,
  } = useQuery({
    queryKey: ['tasks', activeWorkspaceId, 'recent'],
    queryFn: () =>
      tasksApi.list(activeWorkspaceId!, { limit: '5' }).then((r) => r.data),
    enabled: !!activeWorkspaceId,
  })

  const recentTasks = tasksData?.tasks ?? []
  const overview = analytics?.overview

  const isRefreshing = wsLoading || analyticsLoading || tasksLoading
  const handleRefresh = () => {
    refetchWorkspaces()
    refetchAnalytics()
    refetchTasks()
  }

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#6366f1" />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{greeting()},</Text>
          <Text style={styles.userName}>{user?.name ?? 'there'} 👋</Text>
        </View>
        <TouchableOpacity
          style={styles.createBtn}
          onPress={() =>
            activeWorkspaceId &&
            navigation.navigate('CreateTask', { workspaceId: activeWorkspaceId })
          }
          disabled={!activeWorkspaceId}
        >
          <Ionicons name="add" size={22} color="white" />
        </TouchableOpacity>
      </View>

      {/* Workspace selector */}
      {workspaces.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Workspace</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.wsScroll}>
            {workspaces.map((ws: Workspace) => (
              <TouchableOpacity
                key={ws.id}
                style={[
                  styles.wsChip,
                  ws.id === activeWorkspaceId && styles.wsChipActive,
                ]}
                onPress={() => setSelectedWorkspaceId(ws.id)}
              >
                <Text
                  style={[
                    styles.wsChipText,
                    ws.id === activeWorkspaceId && styles.wsChipTextActive,
                  ]}
                >
                  {ws.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Stats grid */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Overview</Text>
        {analyticsLoading ? (
          <ActivityIndicator color="#6366f1" style={{ marginTop: 20 }} />
        ) : overview ? (
          <>
            <View style={styles.statsGrid}>
              <StatCard label="Total" value={overview.total} color="#6366f1" icon="layers-outline" />
              <StatCard label="Completed" value={overview.completed} color="#22c55e" icon="checkmark-circle-outline" />
              <StatCard label="In Progress" value={overview.inProgress} color="#3b82f6" icon="time-outline" />
              <StatCard label="Overdue" value={overview.overdue} color="#ef4444" icon="alert-circle-outline" />
            </View>

            {/* Completion rate bar */}
            <View style={styles.progressCard}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressLabel}>Completion Rate</Text>
                <Text style={styles.progressPct}>{overview.completionRate}%</Text>
              </View>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${overview.completionRate}%` },
                  ]}
                />
              </View>
            </View>
          </>
        ) : (
          !wsLoading && (
            <View style={styles.emptyState}>
              <Ionicons name="analytics-outline" size={36} color="#d1d5db" />
              <Text style={styles.emptyText}>No analytics available yet.</Text>
            </View>
          )
        )}
      </View>

      {/* Recent tasks */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Tasks</Text>
          {activeWorkspaceId && (
            <TouchableOpacity
              onPress={() =>
                navigation.navigate('Tasks', { workspaceId: activeWorkspaceId })
              }
            >
              <Text style={styles.seeAll}>See all →</Text>
            </TouchableOpacity>
          )}
        </View>

        {tasksLoading ? (
          <ActivityIndicator color="#6366f1" style={{ marginTop: 12 }} />
        ) : recentTasks.length > 0 ? (
          recentTasks.map((task: Task) => (
            <TaskCard
              key={task.id}
              task={task}
              onPress={() =>
                navigation.navigate('TaskDetail', {
                  taskId: task.id,
                  workspaceId: task.workspaceId,
                })
              }
            />
          ))
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-done-outline" size={36} color="#d1d5db" />
            <Text style={styles.emptyText}>No tasks yet. Create your first task!</Text>
          </View>
        )}
      </View>

      {/* No workspaces CTA */}
      {!wsLoading && workspaces.length === 0 && (
        <View style={styles.noWorkspaceCard}>
          <Ionicons name="folder-open-outline" size={40} color="#6366f1" />
          <Text style={styles.noWorkspaceTitle}>No workspaces yet</Text>
          <Text style={styles.noWorkspaceText}>
            Create a workspace to start organizing your tasks and collaborating.
          </Text>
          <TouchableOpacity
            style={styles.noWorkspaceBtn}
            onPress={() => navigation.navigate('Workspaces')}
          >
            <Text style={styles.noWorkspaceBtnText}>Go to Workspaces</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f3ff' },
  content: { padding: 20, paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
    marginTop: 8,
  },
  greeting: { fontSize: 14, color: '#6b7280', marginBottom: 2 },
  userName: { fontSize: 22, fontWeight: '700', color: '#111827' },
  createBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  section: { marginBottom: 28 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 12 },
  seeAll: { fontSize: 13, color: '#6366f1', fontWeight: '600' },
  wsScroll: { flexDirection: 'row' },
  wsChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'white',
    marginRight: 8,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
  },
  wsChipActive: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  wsChipText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  wsChipTextActive: { color: 'white', fontWeight: '700' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  statIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  statValue: { fontSize: 26, fontWeight: '800', color: '#111827', marginBottom: 2 },
  statLabel: { fontSize: 12, color: '#6b7280', fontWeight: '500' },
  progressCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  progressLabel: { fontSize: 13, color: '#374151', fontWeight: '600' },
  progressPct: { fontSize: 13, color: '#6366f1', fontWeight: '700' },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e5e7eb',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#6366f1',
  },
  emptyState: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  emptyText: { fontSize: 14, color: '#9ca3af', textAlign: 'center' },
  noWorkspaceCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  noWorkspaceTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginTop: 8 },
  noWorkspaceText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  noWorkspaceBtn: {
    marginTop: 12,
    backgroundColor: '#6366f1',
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  noWorkspaceBtnText: { color: 'white', fontWeight: '700', fontSize: 14 },
})
