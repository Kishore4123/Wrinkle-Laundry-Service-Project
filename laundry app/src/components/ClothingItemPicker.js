// ClothingItemPicker — Reusable component for itemized clothing entry
// Renders a grid of clothing categories with +/- stepper controls
// Innerwear/undergarments and inner vests are explicitly EXCLUDED
import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CLOTHING_CATEGORIES, appColors } from '../theme/theme';

export default function ClothingItemPicker({ items, onItemsChange }) {
  // items is an array of { key, label, count }
  // We merge with CLOTHING_CATEGORIES to always show the full list

  const getCount = (key) => {
    const found = items.find((i) => i.key === key);
    return found ? found.count : 0;
  };

  const updateCount = (category, delta) => {
    const currentCount = getCount(category.key);
    const newCount = Math.max(0, currentCount + delta);

    let newItems;
    if (newCount === 0) {
      // Remove from items array
      newItems = items.filter((i) => i.key !== category.key);
    } else {
      const existing = items.find((i) => i.key === category.key);
      if (existing) {
        newItems = items.map((i) =>
          i.key === category.key ? { ...i, count: newCount } : i
        );
      } else {
        newItems = [
          ...items,
          { key: category.key, label: category.label, category: category.label, count: newCount },
        ];
      }
    }
    onItemsChange(newItems);
  };

  const totalItems = items.reduce((sum, i) => sum + i.count, 0);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.headerLabel}>
          <MaterialCommunityIcons name="tshirt-crew-outline" size={15} color={appColors.primary} />
          {'  '}Clothing Items
        </Text>
        {totalItems > 0 && (
          <View style={styles.totalBadge}>
            <Text style={styles.totalBadgeText}>{totalItems} items</Text>
          </View>
        )}
      </View>

      <View style={styles.grid}>
        {CLOTHING_CATEGORIES.map((cat) => {
          const count = getCount(cat.key);
          const isActive = count > 0;
          return (
            <View
              key={cat.key}
              style={[styles.itemCard, isActive && styles.itemCardActive]}
            >
              <View style={styles.itemHeader}>
                <MaterialCommunityIcons
                  name={cat.icon}
                  size={18}
                  color={isActive ? appColors.primary : appColors.textLight}
                />
                <Text
                  style={[styles.itemLabel, isActive && styles.itemLabelActive]}
                  numberOfLines={1}
                >
                  {cat.label}
                </Text>
              </View>
              <View style={styles.stepper}>
                <TouchableOpacity
                  style={[styles.stepBtn, !isActive && styles.stepBtnDisabled]}
                  onPress={() => updateCount(cat, -1)}
                  disabled={count === 0}
                  activeOpacity={0.6}
                >
                  <MaterialCommunityIcons
                    name="minus"
                    size={16}
                    color={isActive ? appColors.primary : appColors.textLight}
                  />
                </TouchableOpacity>
                <Text style={[styles.countText, isActive && styles.countTextActive]}>
                  {count}
                </Text>
                <TouchableOpacity
                  style={styles.stepBtn}
                  onPress={() => updateCount(cat, 1)}
                  activeOpacity={0.6}
                >
                  <MaterialCommunityIcons
                    name="plus"
                    size={16}
                    color={appColors.primary}
                  />
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: appColors.text,
  },
  totalBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  totalBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: appColors.primary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  itemCard: {
    width: '48%',
    flexDirection: 'column',
    backgroundColor: appColors.surfaceVariant,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  itemCardActive: {
    backgroundColor: '#EEF2FF',
    borderColor: appColors.primaryLight,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  itemLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: appColors.textSecondary,
    flex: 1,
  },
  itemLabelActive: {
    color: appColors.primaryDark,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  stepBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: appColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 1,
    shadowColor: appColors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  stepBtnDisabled: {
    opacity: 0.4,
  },
  countText: {
    fontSize: 15,
    fontWeight: '700',
    color: appColors.textLight,
    minWidth: 20,
    textAlign: 'center',
  },
  countTextActive: {
    color: appColors.primary,
  },
});
