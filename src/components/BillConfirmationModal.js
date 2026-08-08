// BillConfirmationModal — Shows bill summary + WhatsApp send + Done buttons
import React from 'react';
import { View, StyleSheet, Linking, Alert } from 'react-native';
import { Modal, Portal, Text, Button } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { appColors, SERVICE_TYPES } from '../theme/theme';
import { formatDate, formatCurrency, buildWhatsAppUrl, buildBillMessage } from '../utils/helpers';
export default function BillConfirmationModal({ visible, bill, onDismiss }) {
  if (!bill) return null;

  const service = SERVICE_TYPES[bill.serviceType];

  const handleSendWhatsApp = async () => {
    try {
      const message = buildBillMessage(bill);
      const url = buildWhatsAppUrl(bill.mobile, message);
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        const webUrl = `https://wa.me/91${bill.mobile}?text=${encodeURIComponent(buildBillMessage(bill))}`;
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
        {/* Success Icon */}
        <View style={styles.successCircle}>
          <MaterialCommunityIcons name="check-bold" size={36} color="#FFFFFF" />
        </View>
        <Text style={styles.title}>Bill Generated! 🎉</Text>
        <Text style={styles.billId}>{bill.id}</Text>

        {/* Bill Summary */}
        <View style={styles.summaryCard}>
          <SummaryRow label="Student" value={bill.studentName} />
          <SummaryRow label="Reg No" value={bill.regNo} />
          <SummaryRow label="Date" value={formatDate(bill.createdAt)} />
          <SummaryRow label="Weight" value={`${bill.weight} kg`} />
          <SummaryRow label="Items" value={`${bill.clothesCount}`} />
          <SummaryRow label="Service" value={service?.label || bill.serviceType} />
          <SummaryRow label="Rate" value={`₹${bill.ratePerKg}/kg`} />
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
      </Modal>
    </Portal>
  );
}

function SummaryRow({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  modal: {
    backgroundColor: appColors.surface,
    marginHorizontal: 24,
    borderRadius: 24,
    padding: 28,
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
