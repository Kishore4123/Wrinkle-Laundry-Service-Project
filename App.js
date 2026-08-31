// App.js — Entry point for Wrinkle Laundry Service app
import 'react-native-url-polyfill/auto';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { Provider as PaperProvider } from 'react-native-paper';
import { theme } from './src/theme/theme';
import AppNavigator from './src/navigation/AppNavigator';
import { WebRTCProvider } from './src/services/WebRTCContext';

export default function App() {
  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <WebRTCProvider>
          <NavigationContainer>
            <StatusBar style="auto" />
            <AppNavigator />
          </NavigationContainer>
        </WebRTCProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
