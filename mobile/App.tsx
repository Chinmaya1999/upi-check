import React, { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ThemeProvider, useTheme } from './src/theme';
import { StoreProvider } from './src/data/store';
import { loadProfile, unlock, type Profile } from './src/data/session';
import { getToken } from './src/data/api';
import { TabBar } from './src/navigation/TabBar';
import { SplashScreen } from './src/screens/SplashScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { TransactionsScreen } from './src/screens/TransactionsScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { DailyScreen } from './src/screens/DailyScreen';
import { BudgetsScreen } from './src/screens/BudgetsScreen';
import { AddTransactionModal } from './src/screens/AddTransactionModal';
import { Button } from './src/components/ui';
import { useStore } from './src/data/store';
import { hasSmsPermission } from './src/data/inbox';
import { AppState } from 'react-native';

const Tab = createBottomTabNavigator();

function Main({ profile, setProfile, signOut }: { profile: Profile; setProfile: (p: Profile) => void; signOut: () => void }) {
  const { colors, isDark } = useTheme();
  const [adding, setAdding] = useState(false);
  const { syncDevice } = useStore();
  // Quietly pull new SMS/notifications on launch and whenever the app returns to the foreground.
  useEffect(() => {
    const run = () => { hasSmsPermission().then((ok) => { if (ok) return syncDevice(); }).catch(() => {}); };
    run();
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') run(); });
    return () => sub.remove();
  }, [syncDevice]);
  // Soft cross-fade whenever the theme flips.
  const fade = useSharedValue(1);
  useEffect(() => { fade.value = 0.55; fade.value = withTiming(1, { duration: 350 }); }, [isDark, fade]);
  const fadeS = useAnimatedStyle(() => ({ opacity: fade.value }));

  return (
    <Animated.View style={[{ flex: 1, backgroundColor: colors.bg }, fadeS]}>
      <NavigationContainer theme={{ ...(isDark ? DarkTheme : DefaultTheme), colors: { ...(isDark ? DarkTheme : DefaultTheme).colors, background: colors.bg, card: colors.card, text: colors.text, border: colors.border, primary: colors.brand } }}>
        <Tab.Navigator tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false, animation: 'shift' }}>
          <Tab.Screen name="Home">{({ navigation }) => <HomeScreen profile={profile} onAdd={() => setAdding(true)} onSeeAll={() => navigation.navigate('Transactions')} />}</Tab.Screen>
          <Tab.Screen name="Transactions" component={TransactionsScreen} />
          <Tab.Screen name="Analytics" component={DailyScreen} />
          <Tab.Screen name="Budgets" component={BudgetsScreen} />
          <Tab.Screen name="Profile">{() => <ProfileScreen profile={profile} onProfile={setProfile} onSignOut={signOut} />}</Tab.Screen>
        </Tab.Navigator>
      </NavigationContainer>
      <AddTransactionModal visible={adding} onClose={() => setAdding(false)} />
    </Animated.View>
  );
}

function Locked({ onUnlock }: { onUnlock: () => void }) {
  const { colors } = useTheme();
  const attempt = useCallback(async () => { if (await unlock()) onUnlock(); }, [onUnlock]);
  useEffect(() => { attempt(); }, [attempt]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 }}>
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800' }}>Paisa is locked</Text>
      <View style={{ width: '100%' }}><Button title="Unlock" onPress={attempt} /></View>
    </View>
  );
}

function Root() {
  const { colors, isDark } = useTheme();
  const [splash, setSplash] = useState(true);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [locked, setLocked] = useState(true);
  // A profile without a server session (e.g. created before accounts existed) must log in once.
  const [needsLogin, setNeedsLogin] = useState(false);

  useEffect(() => {
    (async () => { const p = await loadProfile(); setNeedsLogin(!!p && !(await getToken())); setProfile(p); })();
  }, []);
  const done = useCallback(() => setSplash(false), []);

  let body: React.ReactNode;
  if (splash || profile === undefined) body = <SplashScreen onDone={done} />;
  else if (!profile || needsLogin) body = <OnboardingScreen startAtForm={needsLogin} onDone={(p) => { setProfile(p); setNeedsLogin(false); setLocked(false); }} />;
  else if (profile.biometricLock && locked) body = <Locked onUnlock={() => setLocked(false)} />;
  else body = <Main profile={profile} setProfile={setProfile} signOut={() => { setProfile(null); setLocked(false); }} />;

  return (
    <View style={{ flex: 1, backgroundColor: splash ? '#101827' : colors.bg }}>
      <StatusBar style={splash || isDark ? 'light' : 'dark'} />
      {body}
    </View>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <StoreProvider>
            <Root />
          </StoreProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
