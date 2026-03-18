import { useState, useCallback } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { CompositeNavigationProp, RouteProp } from '@react-navigation/native'
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs'
import { tasksApi, workspacesApi } from '../services/api'
import { MainStackParamList, TabParamList, Task, TaskStatus, TaskPriority, Workspace } from '../types'
import TaskCard, { PRIORITY_COLORS } from '../components/TaskCard'

type Props = {
  navigation: CompositeNavigationProp<
    BottomTabNavigationProp<TabParamList, 'Tasks'>,
    NativeStackNavigationProp<MainStackParamList>
  >
  route: RouteProp<TabParamList, 'Tasks'>
}

const STATUS_FILTERS: { label: string; value: TaskStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'To Do', value: 'todo' },
  { label: 'In Progress', value: 'in-progress' },
  { label: 'Review', value: 'review' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
]

const PRIORITY_FILTERS: { label: string; value: TaskPriority | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Urgent', value: 'urgent' },
  { label: 'High', value: 'high' },
  { label: 'Medium', value: 'medium' },
  { label: 'Low', value: 'low' },
]

export default function TaskListScreen({ navigation, route }: Props) {
  const routeWorkspaceId = route.params?.workspaceId

  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
    routeWorkspaceId ?? null
  )
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all')
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'all'>('all')
  const [searchText, setSearchText] = useState('')

  // Workspaces
  const { data: workspacesData, isLoading: wsLoading } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => workspacesApi.list().then((r) => r.data),
  })
  const workspaces: Workspace[] = workspacesData?.workspaces ?? []
  const activeWsId = selectedWorkspaceId ?? workspaces[0]?.id ?? null

  // Build query params
  const params: Record<string, string> = { limit: '100' }
  if (statusFilter !== 'all') params.status = statusFilter
  if (priorityFilter !== 'all') params.priority = priorityFilter
  if (searchText.trim()) params.search = searchText.trim()

  const {
    data: tasksData,
    isLoading: tasksLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['tasks', activeWsId, statusFilter, priorityFilter, searchText],
    queryFn: () => tasksApi.list(activeWsId!, params).then((r) => r.data),
    enabled: !!activeWsId,
  })

  const tasks: Task[] = tasksData?.tasks ?? []
  const total = tasksData?.pagination.total ?? 0

  const handleTaskPress = (task: Task) => {
    navigation.navigate('TaskDetail', {
      taskId: task.id,
      workspaceId: task.workspaceId,
    })
  }

  const renderTask = useCallback(
    ({ item }: { item: Task }) => (
      <TaskCard task={item} onPress={() => handleTaskPress(item)} />
    ),
    []
  )

  const isLoading = wsLoading || tasksLoading

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.screenTitle}>Tasks</Text>
        {activeWsId && (
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => {
              Alert.alert(
                'Create Task',
                'How would you like to create tasks?',
                [
                  { text: 'From Transcript', onPress: () => navigation.navigate('SmartCreate', { workspaceId: activeWsId, initialMode: 'transcript' }) },
                  { text: 'Upload Audio', onPress: () => navigation.navigate('SmartCreate', { workspaceId: activeWsId, initialMode: 'audio' }) },
                  { text: 'Live Recording', onPress: () => navigation.navigate('SmartCreate', { workspaceId: activeWsId, initialMode: 'live' }) },
                  { text: 'Import Excel / CSV', onPress: () => navigation.navigate('SmartCreate', { workspaceId: activeWsId, initialMode: 'excel' }) },
                  { text: 'Manual Entry', onPress: () => navigation.navigate('SmartCreate', { workspaceId: activeWsId, initialMode: 'manual' }) },
                  { text: 'Cancel', style: 'cancel' },
                ]
              )
            }}
          >
            <Ionicons name="add" size={22} color="white" />
          </TouchableOpacity>
        )}
      </View>

      {/* Workspace selector */}
      {workspaces.length > 1 && (
        <View style={styles.wsSelectorWrap}>
          <FlatList
            horizontal
            data={workspaces}
            keyExtractor={(w) => w.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.wsChipList}
            renderItem={({ item: ws }) => (
              <TouchableOpacity
                style={[styles.wsChip, ws.id === activeWsId && styles.wsChipActive]}
                onPress={() => setSelectedWorkspaceId(ws.id)}
              >
                <Text
                  style={[
                    styles.wsChipText,
                    ws.id === activeWsId && styles.wsChipTextActive,
                  ]}
                >
                  {ws.name}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {/* Search */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={16} color="#9ca3af" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search tasks..."
          value={searchText}
          onChangeText={setSearchText}
          placeholderTextColor="#9ca3af"
          returnKeyType="search"
        />
        {searchText.length > 0 && (
          <TouchableOpacity onPress={() => setSearchText('')} style={styles.clearBtn}>
            <Ionicons name="close-circle" size={16} color="#9ca3af" />
          </TouchableOpacity>
        )}
      </View>

      {/* Status filters */}
      <View style={styles.filterSection}>
        <FlatList
          horizontal
          data={STATUS_FILTERS}
          keyExtractor={(f) => f.value}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterList}
          renderItem={({ item: f }) => (
            <TouchableOpacity
              style={[styles.filterChip, statusFilter === f.value && styles.filterChipActive]}
              onPress={() => setStatusFilter(f.value as TaskStatus | 'all')}
            >
              <Text
                style={[
                  styles.filterChipText,
                  statusFilter === f.value && styles.filterChipTextActive,
                ]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Priority filters */}
      <View style={styles.filterSection}>
        <FlatList
          horizontal
          data={PRIORITY_FILTERS}
          keyExtractor={(f) => f.value}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterList}
          renderItem={({ item: f }) => {
            const dotColor =
              f.value !== 'all' ? PRIORITY_COLORS[f.value as TaskPriority] : '#6b7280'
            return (
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  priorityFilter === f.value && styles.filterChipActive,
                ]}
                onPress={() => setPriorityFilter(f.value as TaskPriority | 'all')}
              >
                {f.value !== 'all' && (
                  <View style={[styles.priorityDot, { backgroundColor: dotColor }]} />
                )}
                <Text
                  style={[
                    styles.filterChipText,
                    priorityFilter === f.value && styles.filterChipTextActive,
                  ]}
                >
                  {f.label}
                </Text>
              </TouchableOpacity>
            )
          }}
        />
      </View>

      {/* Result count */}
      {!isLoading && (
        <View style={styles.resultCount}>
          <Text style={styles.resultCountText}>
            {total} task{total !== 1 ? 's' : ''}
          </Text>
          {isFetching && <ActivityIndicator size="small" color="#6366f1" style={{ marginLeft: 8 }} />}
        </View>
      )}

      {/* Task list */}
      {isLoading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color="#6366f1" />
        </View>
      ) : tasks.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="clipboard-outline" size={48} color="#d1d5db" />
          <Text style={styles.emptyTitle}>No tasks found</Text>
          <Text style={styles.emptyText}>
            {searchText || statusFilter !== 'all' || priorityFilter !== 'all'
              ? 'Try adjusting your filters.'
              : 'Create your first task to get started.'}
          </Text>
          {activeWsId && !searchText && statusFilter === 'all' && priorityFilter === 'all' && (
            <TouchableOpacity
              style={styles.emptyCreateBtn}
              onPress={() => navigation.navigate('SmartCreate', { workspaceId: activeWsId })}
            >
              <Text style={styles.emptyCreateBtnText}>+ Create Task</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(item) => item.id}
          renderItem={renderTask}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor="#6366f1" />
          }
        />
      )}
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
  addBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  wsSelectorWrap: { backgroundColor: 'white', paddingBottom: 10 },
  wsChipList: { paddingHorizontal: 20, gap: 8 },
  wsChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  wsChipActive: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  wsChipText: { fontSize: 12, color: '#374151', fontWeight: '500' },
  wsChipTextActive: { color: 'white', fontWeight: '700' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
    paddingVertical: 10,
  },
  clearBtn: { padding: 4 },
  filterSection: { marginBottom: 2 },
  filterList: { paddingHorizontal: 16, gap: 6 },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'white',
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    gap: 4,
  },
  filterChipActive: { backgroundColor: '#ede9fe', borderColor: '#6366f1' },
  filterChipText: { fontSize: 12, color: '#6b7280', fontWeight: '500' },
  filterChipTextActive: { color: '#6366f1', fontWeight: '700' },
  priorityDot: { width: 7, height: 7, borderRadius: 3.5 },
  resultCount: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  resultCountText: { fontSize: 12, color: '#9ca3af', fontWeight: '500' },
  loaderWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 16, paddingBottom: 40 },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    gap: 8,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#374151', marginTop: 8 },
  emptyText: { fontSize: 14, color: '#9ca3af', textAlign: 'center', lineHeight: 20 },
  emptyCreateBtn: {
    marginTop: 12,
    backgroundColor: '#6366f1',
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  emptyCreateBtnText: { color: 'white', fontWeight: '700', fontSize: 14 },
})
