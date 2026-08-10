// BillCard — Displays a bill summary in a card with WhatsApp resend
// Supports both new cart-based bills and legacy single-service bills
import React from 'react';
import { View, StyleSheet, TouchableOpacity, Linking, Alert } from 'react-native';
import { Text, Chip } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { appColors, SERVICE_TYPES } from '../theme/theme';
import { formatDate, formatCurrency, buildWhatsAppUrl, buildBillMessage } from '../utils/helpers';

export default function BillCard({ bill, onPress }) {
  const customerName = bill.customerName || bill.studentName || 'Customer';
  const mobile = bill.mobile || '';

  // Determine service display
  const getServiceDisplay = () => {
    if (bill.cartItems && bill.cartItems.length > 0) {
      if (bill.cartItems.length === 1) {
        const svc = SERVICE_TYPES[bill.cartItems[0].serviceType];
        return { label: svc?.label || bill.cartItems[0].serviceType, color: svc?.color, bgColor: svc?.bgColor };
      }
      return { label: `${bill.cartItems.length} Services`, color: appColors.tertiary, bgColor: '#FEF3C7' };
    }
    // Legacy bill
    const svc = SERVICE_TYPES[bill.serviceType];
    return { label: svc?.label || bill.serviceType, color: svc?.color || appColors.primary, bgColor: svc?.bgColor || '#EEF2FF' };
  };

  const serviceDisplay = getServiceDisplay();
  const totalWeight = bill.totalWeight || bill.weight || 0;
  const totalItems = bill.totalClothesCount || bill.clothesCount || 0;

  const handleWhatsApp = async () => {
    try {
      const message = buildBillMessage(bill);
      const url = buildWhatsAppUrl(mobile, message);
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        const webUrl = `https://wa.me/91${mobile}?text=${encodeURIComponent(buildBillMessage(bill))}`;
        await Linking.openURL(webUrl);
      }
    } catch (error) {
      Alert.alert('Error', 'Could not open WhatsApp. Make sure it is installed.');
    }
  };

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.billId}>{bill.id}</Text>
          <Text style={styles.date}>{formatDate(bill.createdAt)}</Text>
        </View>
        <TouchableOpacity style={styles.whatsappBtn} onPress={handleWhatsApp} activeOpacity={0.7}>
          <MaterialCommunityIcons name="whatsapp" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Customer Info */}
      <View style={styles.customerRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{customerName.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.customerInfo}>
          <Text style={styles.customerName} numberOfLines={1}>{customerName}</Text>
          <Text style={styles.mobile}>{mobile}</Text>
        </View>
      </View>

      {/* Details Row */}
      <View style={styles.detailsRow}>
        <View style={styles.detailItem}>
          <MaterialCommunityIcons name="weight-kilogram" size={18} color={appColors.textSecondary} />
          <Text style={styles.detailValue}>{totalWeight} kg</Text>
        </View>
        {totalItems > 0 && (
          <View style={styles.detailItem}>
            <MaterialCommunityIcons name="tshirt-crew-outline" size={18} color={appColors.textSecondary} />
            <Text style={styles.detailValue}>{totalItems} items</Text>
          </View>
        )}
        <Chip
          mode="flat"
          compact
          style={[styles.serviceChip, { backgroundColor: serviceDisplay.bgColor || '#EEF2FF' }]}
          textStyle={[styles.serviceChipText, { color: serviceDisplay.color || appColors.primary }]}
        >
          {serviceDisplay.label}
        </Chip>
      </View>

      {/* Total */}
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total Amount</Text>
        <Text style={styles.totalAmount}>{formatCurrency(bill.totalAmount)}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: appColors.surface,
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: appColors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  headerLeft: {},
  billId: {
    fontSize: 13,
    fontWeight: '700',
    color: appColors.primary,
    letterSpacing: 0.5,
  },
  date: {
    fontSize: 12,
    color: appColors.textLight,
    marginTop: 2,
  },
  whatsappBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#25D366',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#25D366',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 17,
    fontWeight: '700',
    color: appColors.primary,
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: 15,
    fontWeight: '600',
    color: appColors.text,
  },
  mobile: {
    fontSize: 13,
    color: appColors.textSecondary,
    marginTop: 1,
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 12,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailValue: {
    fontSize: 13,
    color: appColors.textSecondary,
    fontWeight: '500',
  },
  serviceChip: {
    height: 28,
    marginLeft: 'auto',
  },
  serviceChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: appColors.border,
    paddingTop: 12,
  },
  totalLabel: {
    fontSize: 13,
    color: appColors.textSecondary,
    fontWeight: '500',
  },
  totalAmount: {
    fontSize: 20,
    fontWeight: '800',
    color: appColors.primary,
  },
});
