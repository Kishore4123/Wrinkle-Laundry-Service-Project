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
        <View style={styles.tableContainer}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, { flex: 2 }]}>Item</Text>
            <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Price</Text>
            <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Qty</Text>
            <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'right' }]}>Total</Text>
          </View>
          {cartItem.items.map((item, idx) => (
            <View key={idx} style={styles.tableRow}>
              <Text style={[styles.tableRowText, { flex: 2 }]} numberOfLines={1}>
                {item.label || item.category}
              </Text>
              <Text style={[styles.tableRowText, { flex: 1, textAlign: 'center' }]}>
                {cartItem.isPiecewise ? `₹${item.rate}` : '-'}
              </Text>
              <Text style={[styles.tableRowText, { flex: 1, textAlign: 'center' }]}>
                {item.count}
              </Text>
              <Text style={[styles.tableRowText, { flex: 1, textAlign: 'right', fontWeight: '600' }]}>
                {cartItem.isPiecewise ? `₹${item.count * item.rate}` : '-'}
              </Text>
            </View>
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
  tableContainer: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: appColors.border,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: appColors.border,
    marginBottom: 6,
  },
  tableHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: appColors.textSecondary,
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    alignItems: 'center',
  },
  tableRowText: {
    fontSize: 12,
    color: appColors.text,
  },
});
