// App.js — Entry point for College Laundry Services app
import 'react-native-url-polyfill/auto';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { Provider as PaperProvider } from 'react-native-paper';
import { theme } from './src/theme/theme';
import AppNavigator from './src/navigation/AppNavigator';
import { SyncProvider } from './src/services/SyncContext';

export default function App() {
  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <SyncProvider>
          <NavigationContainer>
            <StatusBar style="auto" />
            <AppNavigator />
          </NavigationContainer>
        </SyncProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
