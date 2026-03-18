import { useEffect } from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useAuthStore } from './src/store/authStore'
import { connectSocket, disconnectSocket } from './src/services/socket'

// ─── Screens ────────────────────────────────────────────────────────────────
import LoginScreen from './src/screens/LoginScreen'
import MainScreen from './src/screens/MainScreen'
import TaskDetailScreen from './src/screens/TaskDetailScreen'
import SmartCreateScreen from './src/screens/SmartCreateScreen'
import ProfileScreen from './src/screens/ProfileScreen'
import WorkspaceSettingsScreen from './src/screens/WorkspaceSettingsScreen'
import TranscriptsScreen from './src/screens/TranscriptsScreen'
import AITasksPreviewScreen from './src/screens/AITasksPreviewScreen'

import { AuthStackParamList, MainStackParamList } from './src/types'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 5, retry: 1, refetchOnWindowFocus: false },
  },
})

const AuthStack = createNativeStackNavigator<AuthStackParamList>()
const MainStack = createNativeStackNavigator<MainStackParamList>()

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
    </AuthStack.Navigator>
  )
}

function MainNavigator() {
  return (
    <MainStack.Navigator>
      {/* Single main screen — no tabs */}
      <MainStack.Screen
        name="Main"
        component={MainScreen}
        options={{ headerShown: false }}
      />
      <MainStack.Screen
        name="TaskDetail"
        component={TaskDetailScreen}
        options={{ title: 'Task', headerBackTitle: 'Back', headerTintColor: '#6366f1', headerTitleStyle: { fontWeight: '700' } }}
      />
      <MainStack.Screen
        name="SmartCreate"
        component={SmartCreateScreen}
        options={{ presentation: 'modal', headerShown: false }}
      />
      <MainStack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: 'Profile', headerBackTitle: 'Back', headerTintColor: '#6366f1', headerTitleStyle: { fontWeight: '700' } }}
      />
      <MainStack.Screen
        name="WorkspaceSettings"
        component={WorkspaceSettingsScreen}
        options={{ title: 'Settings', headerBackTitle: 'Back', headerTintColor: '#6366f1', headerTitleStyle: { fontWeight: '700' } }}
      />
      <MainStack.Screen
        name="Transcripts"
        component={TranscriptsScreen}
        options={{ title: 'Transcripts', headerBackTitle: 'Back', headerTintColor: '#6366f1', headerTitleStyle: { fontWeight: '700' } }}
      />
      <MainStack.Screen
        name="AITasksPreview"
        component={AITasksPreviewScreen}
        options={{ headerShown: false }}
      />
    </MainStack.Navigator>
  )
}

function RootApp() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const loadStoredAuth = useAuthStore((s) => s.loadStoredAuth)

  useEffect(() => { loadStoredAuth() }, [])

  useEffect(() => {
    if (isAuthenticated) {
      connectSocket().catch(console.error)
    } else {
      disconnectSocket()
      queryClient.clear()
    }
  }, [isAuthenticated])

  return (
    <NavigationContainer>
      <StatusBar style="auto" />
      {isAuthenticated ? <MainNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  )
}

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <RootApp />
      </QueryClientProvider>
    </SafeAreaProvider>
  )
}
