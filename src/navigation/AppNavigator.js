// AppNavigator — Bottom tabs with nested stacks
import React from 'react';
import { StyleSheet, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { appColors } from '../theme/theme';

// Screens
import BillGenerationScreen from '../screens/BillGenerationScreen';
import StudentsScreen from '../screens/StudentsScreen';
import AddStudentScreen from '../screens/AddStudentScreen';
import HistoryScreen from '../screens/HistoryScreen';
import QRScannerScreen from '../screens/QRScannerScreen';

const Tab = createBottomTabNavigator();
const StudentStack = createStackNavigator();

// Shared header styles
const screenOptions = {
  headerStyle: {
    backgroundColor: appColors.surface,
    elevation: 0,
    shadowOpacity: 0,
    borderBottomWidth: 0,
  },
  headerTintColor: appColors.text,
  headerTitleStyle: {
    fontWeight: '700',
    fontSize: 18,
  },
  headerBackTitleVisible: false,
};

// Student stack (list + add form)
function StudentStackNavigator() {
  return (
    <StudentStack.Navigator screenOptions={screenOptions}>
      <StudentStack.Screen
        name="StudentsList"
        component={StudentsScreen}
        options={{ headerShown: false }}
      />
      <StudentStack.Screen
        name="AddStudent"
        component={AddStudentScreen}
        options={{
          title: 'Add Student',
          headerStyle: {
            ...screenOptions.headerStyle,
            backgroundColor: appColors.background,
          },
        }}
      />
    </StudentStack.Navigator>
  );
}

import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function AppNavigator() {
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        ...screenOptions,
        headerShown: false,
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          if (route.name === 'Bills') {
            iconName = focused ? 'receipt' : 'receipt-text-outline';
          } else if (route.name === 'Students') {
            iconName = focused ? 'account-group' : 'account-group-outline';
          } else if (route.name === 'History') {
            iconName = focused ? 'clipboard-text-clock' : 'clipboard-text-clock-outline';
          } else if (route.name === 'Scan') {
            iconName = focused ? 'qrcode-scan' : 'qrcode-scan';
          }
          return <MaterialCommunityIcons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: appColors.primary,
        tabBarInactiveTintColor: appColors.textLight,
        tabBarStyle: [
          styles.tabBar,
          {
            paddingBottom: Platform.OS === 'ios' ? Math.max(28, insets.bottom) : Math.max(12, insets.bottom),
            height: (Platform.OS === 'ios' ? 88 : 64) + insets.bottom,
          }
        ],
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
      })}
      initialRouteName="Bills"
    >
      <Tab.Screen
        name="Bills"
        component={BillGenerationScreen}
        options={{ tabBarLabel: 'New Bill' }}
      />
      <Tab.Screen
        name="Students"
        component={StudentStackNavigator}
        options={{ tabBarLabel: 'Students' }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{ tabBarLabel: 'History' }}
      />
      <Tab.Screen
        name="Scan"
        component={QRScannerScreen}
        options={{ tabBarLabel: 'Scan' }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: appColors.surface,
    borderTopColor: appColors.border,
    borderTopWidth: 1,
    paddingTop: 6,
    elevation: 8,
    shadowColor: appColors.shadow,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  tabItem: {
    paddingTop: 4,
  },
});
