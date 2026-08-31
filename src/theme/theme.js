// Theme configuration for Wrinkle Release Laundry Service app
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
  orange: '#F97316',
  orangeLight: '#FED7AA',
  purple: '#8B5CF6',
  purpleLight: '#DDD6FE',
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

// Service type constants (rates are loaded dynamically from SettingsService)
export const SERVICE_TYPES = {
  WASH_ONLY: {
    key: 'WASH_ONLY',
    label: 'Washing Only',
    defaultRate: 80,
    icon: 'washing-machine',
    color: colors.primary,
    bgColor: '#EEF2FF',
  },
  WASH_AND_IRON: {
    key: 'WASH_AND_IRON',
    label: 'Wash & Iron',
    defaultRate: 125,
    icon: 'iron',
    color: colors.secondary,
    bgColor: '#CCFBF1',
  },
  IRON_STEAM: {
    key: 'IRON_STEAM',
    label: 'Steam Ironing',
    defaultRate: 60,
    icon: 'weather-fog',
    color: colors.orange,
    bgColor: '#FED7AA',
  },
};

// Default dynamic category pricing
export const DEFAULT_CATEGORIES_PRICING = {
  Student: {
    kgRates: {
      WASH_ONLY: 80,
      WASH_AND_IRON: 125,
    },
    pieceRates: {
      WASH_ONLY: {
        'Dhoti': 30, 'Dhoti (Starch)': 40, 'White Shirt': 30, 'White Shirt (Starch)': 40,
        'Pant': 30, 'Blouse': 15, 'Chudidhar Set': 40, 'Saree': 30, 'Saree (Starch)': 40,
        'Bed Cover (Single)': 60, 'Bed Cover (Double)': 100, 'Blanket (Single)': 175,
        'Blanket (Queen)': 200, 'Blanket (King)': 250, 'Quilt (Single)': 150,
        'Quilt (double)': 225, 'Pillow Cover': 15, 'Towel (Cotton)': 15,
        'Towel (Turkey)': 25, 'Mat (Small)': 50, 'Mat (Big)': 100
      },
      WASH_AND_IRON: {
        'Dhoti': 30, 'Dhoti (Starch)': 40, 'White Shirt': 30, 'White Shirt (Starch)': 40,
        'Pant': 30, 'Blouse': 15, 'Chudidhar Set': 40, 'Saree': 30, 'Saree (Starch)': 40,
        'Bed Cover (Single)': 60, 'Bed Cover (Double)': 100, 'Blanket (Single)': 175,
        'Blanket (Queen)': 200, 'Blanket (King)': 250, 'Quilt (Single)': 150,
        'Quilt (double)': 225, 'Pillow Cover': 15, 'Towel (Cotton)': 15,
        'Towel (Turkey)': 25, 'Mat (Small)': 50, 'Mat (Big)': 100
      },
      IRON_STEAM: {
        'Dhoti': 15, 'Dhoti (Starch)': 20, 'Shirt': 15, 'Shirt (Starch)': 20,
        'Pant': 15, 'Blouse': 10, 'Chudidhar Top': 15, 'Chudidhar Bottom': 15, 'Shawl': 10,
        'Saree': 30, 'Saree (Starch)': 40, 'Fancy/Silk': 40
      }
    }
  },
  Public: {
    kgRates: {
      WASH_ONLY: 100,
      WASH_AND_IRON: 150,
    },
    pieceRates: {
      WASH_ONLY: {
        'Dhoti': 30, 'Dhoti (Starch)': 40, 'White Shirt': 30, 'White Shirt (Starch)': 40,
        'Pant': 30, 'Blouse': 15, 'Chudidhar Set': 40, 'Saree': 30, 'Saree (Starch)': 40,
        'Bed Cover (Single)': 60, 'Bed Cover (Double)': 100, 'Blanket (Single)': 175,
        'Blanket (Queen)': 200, 'Blanket (King)': 250, 'Quilt (Single)': 150,
        'Quilt (double)': 225, 'Pillow Cover': 15, 'Towel (Cotton)': 15,
        'Towel (Turkey)': 25, 'Mat (Small)': 50, 'Mat (Big)': 100
      },
      WASH_AND_IRON: {
        'Dhoti': 30, 'Dhoti (Starch)': 40, 'White Shirt': 30, 'White Shirt (Starch)': 40,
        'Pant': 30, 'Blouse': 15, 'Chudidhar Set': 40, 'Saree': 30, 'Saree (Starch)': 40,
        'Bed Cover (Single)': 60, 'Bed Cover (Double)': 100, 'Blanket (Single)': 175,
        'Blanket (Queen)': 200, 'Blanket (King)': 250, 'Quilt (Single)': 150,
        'Quilt (double)': 225, 'Pillow Cover': 15, 'Towel (Cotton)': 15,
        'Towel (Turkey)': 25, 'Mat (Small)': 50, 'Mat (Big)': 100
      },
      IRON_STEAM: {
        'Dhoti': 15, 'Dhoti (Starch)': 20, 'Shirt': 15, 'Shirt (Starch)': 20,
        'Pant': 15, 'Blouse': 10, 'Chudidhar Top': 15, 'Chudidhar Bottom': 15, 'Shawl': 10,
        'Saree': 30, 'Saree (Starch)': 40, 'Fancy/Silk': 40
      }
    }
  }
};

// Clothing categories for itemized breakdown
// NOTE: Innerwear, undergarments, and inner vests are explicitly EXCLUDED
export const CLOTHING_CATEGORIES = [
  { key: 'shirt', label: 'Shirt', icon: 'tshirt-crew' },
  { key: 'tshirt', label: 'T-Shirt', icon: 'tshirt-crew-outline' },
  { key: 'pants', label: 'Pants / Trousers', icon: 'roller-skate-off' },
  { key: 'jeans', label: 'Jeans', icon: 'roller-skate-off' },
  { key: 'shorts', label: 'Shorts', icon: 'roller-skate-off' },
  { key: 'saree', label: 'Saree', icon: 'hanger' },
  { key: 'kurta', label: 'Kurta / Kurti', icon: 'hanger' },
  { key: 'dress', label: 'Dress', icon: 'hanger' },
  { key: 'jacket', label: 'Jacket / Hoodie', icon: 'coat-rack' },
  { key: 'towel', label: 'Towel', icon: 'paper-roll-outline' },
  { key: 'bedsheet', label: 'Bedsheet', icon: 'bed-outline' },
  { key: 'blanket', label: 'Blanket', icon: 'bed-outline' },
  { key: 'curtain', label: 'Curtain', icon: 'curtains' },
  { key: 'pillow_cover', label: 'Pillow Cover', icon: 'rectangle-outline' },
  { key: 'other', label: 'Other', icon: 'dots-horizontal-circle-outline' },
];
