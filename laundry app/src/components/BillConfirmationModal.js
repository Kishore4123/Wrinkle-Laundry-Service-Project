// BillConfirmationModal — Shows bill summary + WhatsApp send + Done buttons
// Supports cart-based bills with multiple service entries
import React from 'react';
import { View, StyleSheet, Linking, Alert, ScrollView } from 'react-native';
import { Modal, Portal, Text, Button, Chip } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { appColors, SERVICE_TYPES } from '../theme/theme';
import { formatDate, formatCurrency, buildWhatsAppUrl, buildBillMessage } from '../utils/helpers';

export default function BillConfirmationModal({ visible, bill, onDismiss }) {
  if (!bill) return null;

  const customerName = bill.customerName || bill.studentName || 'Customer';
  const customerCategory = bill.customerCategory || 'Student';
  const mobile = bill.mobile || '';
  const hasCart = bill.cartItems && bill.cartItems.length > 0;

  const handleSendWhatsApp = async () => {
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
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={styles.modal}
      >
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Success Icon */}
          <View style={styles.successCircle}>
            <MaterialCommunityIcons name="check-bold" size={36} color="#FFFFFF" />
          </View>
          <Text style={styles.title}>Bill Generated! 🎉</Text>
          <Text style={styles.billId}>{bill.id}</Text>

          {/* Bill Summary */}
          <View style={styles.summaryCard}>
            <SummaryRow label="Customer" value={customerName} />
            <SummaryRow label="Type" value={customerCategory} />
            <SummaryRow label="Date" value={formatDate(bill.createdAt)} />
            {bill.dueDate && (
              <SummaryRow label="Due Date" value={bill.dueDate} bold />
            )}

            {hasCart ? (
              <>
                {bill.cartItems.map((cartItem, idx) => {
                  const service = SERVICE_TYPES[cartItem.serviceType];
                  const totalItems = (cartItem.items || []).reduce((s, i) => s + i.count, 0);
                  return (
                    <View key={idx} style={styles.cartItemSection}>
                      <View style={styles.cartItemHeader}>
                        <View style={[styles.cartBadge, { backgroundColor: service?.bgColor || '#EEF2FF' }]}>
                          <Text style={[styles.cartBadgeText, { color: service?.color || appColors.primary }]}>
                            {idx + 1}
                          </Text>
                        </View>
                        <Text style={styles.cartServiceName}>{service?.label || cartItem.serviceType}</Text>
                      </View>
                      <SummaryRow label="Weight" value={`${cartItem.weight} kg`} />
                      {totalItems > 0 && (
                        <SummaryRow label="Items" value={`${totalItems}`} />
                      )}
                      <SummaryRow label="Rate" value={`₹${cartItem.ratePerKg}/kg`} />
                      <SummaryRow label="Subtotal" value={formatCurrency(cartItem.subtotal)} bold />

                      {cartItem.items && cartItem.items.length > 0 && (
                        <View style={styles.tableContainer}>
                          <View style={styles.tableHeader}>
                            <Text style={[styles.tableHeaderText, { flex: 2 }]}>Item</Text>
                            <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Price</Text>
                            <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Qty</Text>
                            <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'right' }]}>Total</Text>
                          </View>
                          {cartItem.items.map((item, iIdx) => (
                            <View key={iIdx} style={styles.tableRow}>
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
                })}
              </>
            ) : (
              <>
                <SummaryRow label="Weight" value={`${bill.weight || bill.totalWeight} kg`} />
                <SummaryRow label="Items" value={`${bill.clothesCount || bill.totalClothesCount || 0}`} />
                <SummaryRow
                  label="Service"
                  value={SERVICE_TYPES[bill.serviceType]?.label || bill.serviceType}
                />
                <SummaryRow label="Rate" value={`₹${bill.ratePerKg}/kg`} />
              </>
            )}

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total Amount</Text>
              <Text style={styles.totalValue}>{formatCurrency(bill.totalAmount)}</Text>
            </View>
          </View>

          {/* Actions */}
          <Button
            mode="contained"
            onPress={handleSendWhatsApp}
            icon={({ size, color }) => (
              <MaterialCommunityIcons name="whatsapp" size={size} color={color} />
            )}
            style={styles.whatsappButton}
            contentStyle={styles.whatsappButtonContent}
            labelStyle={styles.whatsappButtonLabel}
            buttonColor="#25D366"
          >
            Send Bill via WhatsApp
          </Button>

          <Button
            mode="outlined"
            onPress={onDismiss}
            style={styles.doneButton}
            contentStyle={styles.doneButtonContent}
            labelStyle={styles.doneButtonLabel}
          >
            Done
          </Button>
        </ScrollView>
      </Modal>
    </Portal>
  );
}

function SummaryRow({ label, value, bold }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, bold && styles.rowValueBold]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  modal: {
    backgroundColor: appColors.surface,
    marginHorizontal: 24,
    borderRadius: 24,
    padding: 28,
    maxHeight: '85%',
  },
  scrollContent: {
    alignItems: 'center',
  },
  successCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: appColors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    elevation: 4,
    shadowColor: appColors.success,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: appColors.text,
    marginBottom: 4,
  },
  billId: {
    fontSize: 14,
    fontWeight: '600',
    color: appColors.primary,
    letterSpacing: 1,
    marginBottom: 20,
  },
  summaryCard: {
    width: '100%',
    backgroundColor: appColors.surfaceVariant,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  rowLabel: {
    fontSize: 13,
    color: appColors.textSecondary,
    fontWeight: '500',
  },
  rowValue: {
    fontSize: 13,
    color: appColors.text,
    fontWeight: '600',
    textAlign: 'right',
    flexShrink: 1,
    marginLeft: 12,
  },
  rowValueBold: {
    fontWeight: '800',
    color: appColors.primary,
  },
  cartItemSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: appColors.border,
  },
  cartItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  cartBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  cartServiceName: {
    fontSize: 13,
    fontWeight: '700',
    color: appColors.text,
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
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: appColors.border,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: appColors.text,
  },
  totalValue: {
    fontSize: 20,
    fontWeight: '800',
    color: appColors.primary,
  },
  whatsappButton: {
    width: '100%',
    borderRadius: 14,
    marginBottom: 10,
    elevation: 3,
    shadowColor: '#25D366',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  whatsappButtonContent: {
    height: 50,
  },
  whatsappButtonLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  doneButton: {
    width: '100%',
    borderRadius: 14,
    borderColor: appColors.border,
  },
  doneButtonContent: {
    height: 48,
  },
  doneButtonLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: appColors.textSecondary,
  },
});
