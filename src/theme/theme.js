// Theme configuration for College Laundry Services app
// Uses React Native Paper's MD3 theme system
import { MD3LightTheme } from 'react-native-paper';

const colors = {
  primary: '#4F46E5',       // Deep Indigo
  primaryLight: '#818CF8',  // Light Indigo
  primaryDark: '#3730A3',   // Dark Indigo
  secondary: '#0D9488',     // Teal
  secondaryLight: '#5EEAD4',// Light Teal
  tertiary: '#F59E0B',      // Amber
  tertiaryLight: '#FCD34D', // Light Amber
  surface: '#FFFFFF',
  surfaceVariant: '#F1F5F9',
  background: '#F8FAFC',
  error: '#EF4444',
  errorLight: '#FEE2E2',
  text: '#1E293B',
  textSecondary: '#64748B',
  textLight: '#94A3B8',
  border: '#E2E8F0',
  success: '#10B981',
  successLight: '#D1FAE5',
  card: '#FFFFFF',
  shadow: '#000000',
};

export const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: colors.primary,
    primaryContainer: '#EEF2FF',
    onPrimaryContainer: colors.primaryDark,
    secondary: colors.secondary,
    secondaryContainer: '#CCFBF1',
    onSecondaryContainer: '#134E4A',
    tertiary: colors.tertiary,
    tertiaryContainer: '#FEF3C7',
    onTertiaryContainer: '#92400E',
    surface: colors.surface,
    surfaceVariant: colors.surfaceVariant,
    background: colors.background,
    error: colors.error,
    errorContainer: colors.errorLight,
    outline: colors.border,
    onSurface: colors.text,
    onSurfaceVariant: colors.textSecondary,
    elevation: {
      level0: 'transparent',
      level1: colors.surface,
      level2: colors.surfaceVariant,
      level3: '#E2E8F0',
      level4: '#CBD5E1',
      level5: '#94A3B8',
    },
  },
  roundness: 12,
};

export const appColors = colors;

// Service type constants
export const SERVICE_TYPES = {
  WASH_ONLY: {
    key: 'WASH_ONLY',
    label: 'Washing Only',
    rate: 80,
    icon: 'washing-machine',
    color: colors.primary,
  },
  WASH_AND_IRON: {
    key: 'WASH_AND_IRON',
    label: 'Washing & Ironing',
    rate: 125,
    icon: 'iron',
    color: colors.secondary,
  },
};

export const RATES = {
  WASH_ONLY: 80,
  WASH_AND_IRON: 125,
};
