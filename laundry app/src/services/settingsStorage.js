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

  /**
   * Overwrite the local cache with what the shared config says. Used by the
   * Firestore listener — unlike saveCategories this does NOT merge in the
   * built-in defaults, otherwise a category deleted on another device would
   * reappear here whenever it happened to match a default.
   */
  async cacheCategories(categories) {
    try {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(categories));
      return categories;
    } catch (error) {
      console.error('Error caching settings:', error);
      throw error;
    }
  },
};

// ── Item catalog helpers ───────────────────────────────────────────────────
//
// Item NAMES are shared across every category (a "Saree" is the same garment
// whichever customer brings it in), while PRICES are per category. So adding,
// renaming or removing an item applies to all categories; editing a price
// touches only the one being edited.

export function addItemEverywhere(categories, serviceKey, itemName, price) {
  const next = JSON.parse(JSON.stringify(categories));
  for (const cat of Object.keys(next)) {
    if (!next[cat].pieceRates) next[cat].pieceRates = {};
    if (!next[cat].pieceRates[serviceKey]) next[cat].pieceRates[serviceKey] = {};
    if (next[cat].pieceRates[serviceKey][itemName] === undefined) {
      next[cat].pieceRates[serviceKey][itemName] = Number(price) || 0;
    }
  }
  return next;
}

export function renameItemEverywhere(categories, serviceKey, oldName, newName) {
  const next = JSON.parse(JSON.stringify(categories));
  for (const cat of Object.keys(next)) {
    const rates = next[cat].pieceRates?.[serviceKey];
    if (!rates || rates[oldName] === undefined) continue;
    // Rebuild the object so the renamed item keeps its position in the list
    // rather than jumping to the end.
    next[cat].pieceRates[serviceKey] = Object.fromEntries(
      Object.entries(rates).map(([k, v]) => (k === oldName ? [newName, v] : [k, v]))
    );
  }
  return next;
}

export function removeItemEverywhere(categories, serviceKey, itemName) {
  const next = JSON.parse(JSON.stringify(categories));
  for (const cat of Object.keys(next)) {
    const rates = next[cat].pieceRates?.[serviceKey];
    if (rates) delete rates[itemName];
  }
  return next;
}
