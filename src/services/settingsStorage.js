// Settings Storage Service — Admin-configurable pricing
// Persists category-based service rates to AsyncStorage
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_CATEGORIES_PRICING } from '../theme/theme';

const SETTINGS_KEY = '@laundry_category_settings';

export const SettingsService = {
  /**
   * Get all categories and their pricing. Returns saved data merged with defaults
   */
  async getCategories() {
    try {
      const data = await AsyncStorage.getItem(SETTINGS_KEY);
      if (data) {
        const saved = JSON.parse(data);
        return { ...DEFAULT_CATEGORIES_PRICING, ...saved };
      }
      return { ...DEFAULT_CATEGORIES_PRICING };
    } catch (error) {
      console.error('Error getting settings:', error);
      return { ...DEFAULT_CATEGORIES_PRICING };
    }
  },

  /**
   * Save updated categories pricing.
   */
  async saveCategories(categories) {
    try {
      const data = await AsyncStorage.getItem(SETTINGS_KEY);
      const current = data ? JSON.parse(data) : {};
      const updated = { ...DEFAULT_CATEGORIES_PRICING, ...current, ...categories };
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
      return updated;
    } catch (error) {
      console.error('Error saving settings:', error);
      throw error;
    }
  },
};
