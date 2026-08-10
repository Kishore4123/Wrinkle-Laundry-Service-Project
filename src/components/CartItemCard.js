// CartItemCard — Displays a single service entry in the cart
import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, Chip } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { appColors, SERVICE_TYPES } from '../theme/theme';
import { formatCurrency } from '../utils/helpers';

export default function CartItemCard({ cartItem, index, onDelete }) {
  const service = SERVICE_TYPES[cartItem.serviceType];
  const totalItems = (cartItem.items || []).reduce((sum, i) => sum + i.count, 0);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.indexBadge, { backgroundColor: service?.bgColor || '#EEF2FF' }]}>
            <Text style={[styles.indexText, { color: service?.color || appColors.primary }]}>
              {index + 1}
            </Text>
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.serviceName}>{service?.label || cartItem.serviceType}</Text>
            {!cartItem.isPiecewise && (
              <Text style={styles.rateText}>₹{cartItem.ratePerKg}/kg</Text>
            )}
            {cartItem.isPiecewise && (
              <Text style={styles.rateText}>By Piece</Text>
            )}
          </View>
        </View>
        {onDelete && (
          <TouchableOpacity onPress={() => onDelete(index)} style={styles.deleteBtn} activeOpacity={0.6}>
            <MaterialCommunityIcons name="close-circle" size={22} color={appColors.error} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.detailsRow}>
        {!cartItem.isPiecewise && (
          <View style={styles.detailItem}>
            <MaterialCommunityIcons name="weight-kilogram" size={16} color={appColors.textSecondary} />
            <Text style={styles.detailText}>{cartItem.weight} kg</Text>
          </View>
        )}
        {totalItems > 0 && (
          <View style={styles.detailItem}>
            <MaterialCommunityIcons name="tshirt-crew-outline" size={16} color={appColors.textSecondary} />
            <Text style={styles.detailText}>{totalItems} items</Text>
          </View>
        )}
        <Text style={styles.subtotal}>{formatCurrency(cartItem.subtotal)}</Text>
      </View>

      {cartItem.items && cartItem.items.length > 0 && (
        <View style={styles.itemsList}>
          {cartItem.items.map((item, idx) => (
            <Chip
              key={idx}
              compact
              mode="flat"
              style={styles.itemChip}
              textStyle={styles.itemChipText}
            >
              {item.count}× {item.label || item.category} {cartItem.isPiecewise ? `(₹${item.rate}/pc)` : ''}
            </Chip>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: appColors.surfaceVariant,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  indexBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  indexText: {
    fontSize: 14,
    fontWeight: '800',
  },
  headerInfo: {
    flex: 1,
  },
  serviceName: {
    fontSize: 14,
    fontWeight: '700',
    color: appColors.text,
  },
  rateText: {
    fontSize: 12,
    color: appColors.textSecondary,
    marginTop: 1,
  },
  deleteBtn: {
    padding: 4,
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailText: {
    fontSize: 13,
    color: appColors.textSecondary,
    fontWeight: '500',
  },
  subtotal: {
    fontSize: 15,
    fontWeight: '800',
    color: appColors.primary,
    marginLeft: 'auto',
  },
  itemsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: appColors.border,
  },
  itemChip: {
    backgroundColor: appColors.surface,
    height: 26,
  },
  itemChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: appColors.textSecondary,
  },
});
