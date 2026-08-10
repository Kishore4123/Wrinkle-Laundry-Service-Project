import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { appColors } from '../theme/theme';

export default function PiecewiseItemPicker({ items, onItemsChange, pieceRates }) {
  // items is an array of { label, count, rate }
  const rateKeys = Object.keys(pieceRates || {});

  const getCount = (label) => {
    const found = items.find((i) => i.label === label);
    return found ? found.count : 0;
  };

  const updateCount = (label, rate, delta) => {
    const currentCount = getCount(label);
    const newCount = Math.max(0, currentCount + delta);

    let newItems;
    if (newCount === 0) {
      newItems = items.filter((i) => i.label !== label);
    } else {
      const existing = items.find((i) => i.label === label);
      if (existing) {
        newItems = items.map((i) =>
          i.label === label ? { ...i, count: newCount } : i
        );
      } else {
        newItems = [
          ...items,
          { label, count: newCount, rate },
        ];
      }
    }
    onItemsChange(newItems);
  };

  const totalItems = items.reduce((sum, i) => sum + i.count, 0);

  if (rateKeys.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={{ color: appColors.textLight }}>No piecewise rates configured for this category.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.headerLabel}>
          <MaterialCommunityIcons name="hanger" size={15} color={appColors.primary} />
          {'  '}Select Pieces
        </Text>
        {totalItems > 0 && (
          <View style={styles.totalBadge}>
            <Text style={styles.totalBadgeText}>{totalItems} pieces</Text>
          </View>
        )}
      </View>

      <View style={styles.grid}>
        {rateKeys.map((key) => {
          const count = getCount(key);
          const rate = pieceRates[key];
          const isActive = count > 0;
          return (
            <View
              key={key}
              style={[styles.itemCard, isActive && styles.itemCardActive]}
            >
              <View style={styles.itemHeader}>
                <View style={styles.itemTitleContainer}>
                  <Text style={[styles.itemLabel, isActive && styles.itemLabelActive]} numberOfLines={2}>
                    {key}
                  </Text>
                  <Text style={[styles.itemRate, isActive && styles.itemRateActive]}>
                    ₹{rate}
                  </Text>
                </View>
              </View>
              <View style={styles.stepper}>
                <TouchableOpacity
                  style={[styles.stepBtn, !isActive && styles.stepBtnDisabled]}
                  onPress={() => updateCount(key, rate, -1)}
                  disabled={count === 0}
                  activeOpacity={0.6}
                >
                  <MaterialCommunityIcons name="minus" size={16} color={isActive ? appColors.primary : appColors.textLight} />
                </TouchableOpacity>
                <Text style={[styles.countText, isActive && styles.countTextActive]}>
                  {count}
                </Text>
                <TouchableOpacity
                  style={styles.stepBtn}
                  onPress={() => updateCount(key, rate, 1)}
                  activeOpacity={0.6}
                >
                  <MaterialCommunityIcons name="plus" size={16} color={appColors.primary} />
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
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  itemTitleContainer: {
    flex: 1,
  },
  itemLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: appColors.textSecondary,
    marginBottom: 2,
  },
  itemLabelActive: {
    color: appColors.primaryDark,
  },
  itemRate: {
    fontSize: 12,
    fontWeight: '500',
    color: appColors.textLight,
  },
  itemRateActive: {
    color: appColors.primary,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 'auto',
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
