import { Pressable, StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import CreatorScreen from "./src/screens/CreatorScreen";
import ChatScreen from "./src/screens/ChatScreen";
import CharWallScreen from "./src/screens/CharWallScreen";
import type { RootStackParamList } from "./src/navigation/types";
import { ThemeProvider, useTheme } from "./src/ThemeContext";
import { AuthProvider } from "./src/AuthContext";

const Stack = createNativeStackNavigator<RootStackParamList>();

function DarkModeButton() {
  const { colors, darkMode, toggleDarkMode } = useTheme();
  return (
    <Pressable
      onPress={toggleDarkMode}
      hitSlop={8}
      android_ripple={{ color: colors.secondaryContainer, borderless: true, radius: 18 }}
      style={styles.headerButton}
      accessibilityLabel={darkMode ? "Switch to light mode" : "Switch to dark mode"}
    >
      <Ionicons name={darkMode ? "sunny-outline" : "moon-outline"} size={20} color={colors.text} />
    </Pressable>
  );
}

function AppNavigator() {
  const { colors, darkMode } = useTheme();
  const navTheme = {
    ...DefaultTheme,
    dark: darkMode,
    colors: {
      ...DefaultTheme.colors,
      background: colors.background,
      card: colors.background,
      text: colors.text,
      border: colors.outline,
      primary: colors.primary,
    },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style={darkMode ? "light" : "dark"} />
      <Stack.Navigator
        initialRouteName="Creator"
        screenOptions={{ headerTitleAlign: "center", headerRight: () => <DarkModeButton /> }}
      >
        <Stack.Screen
          name="Creator"
          component={CreatorScreen}
          options={{ title: "New Character" }}
        />
        <Stack.Screen
          name="CharWall"
          component={CharWallScreen}
          options={{ title: "Character Wall" }}
        />
        <Stack.Screen
          name="Chat"
          component={ChatScreen}
          // headerTitle (bigger, tappable avatar + name) is set by ChatScreen itself via
          // navigation.setOptions, so it can share this screen's own lightbox state.
          options={({ route }) => ({ title: route.params.bot.name })}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <AppNavigator />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  headerButton: { padding: 6, marginRight: 4 },
});
