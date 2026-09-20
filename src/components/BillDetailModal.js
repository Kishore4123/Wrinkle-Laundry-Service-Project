// BillDetailModal.js — full breakdown of a bill: every service line and the
// garments counted within it. Mirrors the desktop's detail view so a bill reads
// the same on either device.
import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Modal, Portal, Text, Button, Divider } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { appColors, SERVICE_TYPES } from '../theme/theme';
import { formatCurrency, formatDate } from '../utils/helpers';

export default function BillDetailModal({ visible, bill, onDismiss, onAction, actionLabel }) {
  if (!bill) return null;

  const cart = Array.isArray(bill.cartItems) ? bill.cartItems : [];
  const isCompleted = bill.status === 'Completed';

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.modal}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.billId}>{bill.id}</Text>
            <View style={[styles.badge, isCompleted ? styles.badgeDone : styles.badgePending]}>
              <Text style={[styles.badgeText, { color: isCompleted ? '#047857' : '#92400E' }]}>
                {bill.status || 'Pending'}
              </Text>
            </View>
          </View>

          <View style={styles.metaGrid}>
            <Meta label="Customer" value={bill.customerName || bill.studentName || 'Customer'} />
            <Meta label="Mobile" value={bill.mobile || '—'} />
            <Meta label="Category" value={bill.customerCategory || 'Student'} />
            <Meta label="Created" value={formatDate(bill.createdAt)} />
            {!!bill.dueDate && <Meta label="Due" value={bill.dueDate} />}
          </View>

          <Divider style={styles.divider} />

          {cart.length === 0 ? (
            <Text style={styles.empty}>No service lines recorded for this bill.</Text>
          ) : (
            cart.map((ci, index) => {
              const label = SERVICE_TYPES[ci.serviceType]?.label || ci.serviceType;
              const items = Array.isArray(ci.items) ? ci.items : [];
              return (
                <View key={index} style={styles.service}>
                  <View style={styles.serviceHead}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.serviceTitle}>Service {index + 1}: {label}</Text>
                      <Text style={styles.serviceBasis}>
                        {ci.isPiecewise
                          ? 'Charged per piece'
                          : `${ci.weight} kg @ ₹${ci.ratePerKg}/kg`}
                      </Text>
                    </View>
                    <Text style={styles.serviceTotal}>{formatCurrency(ci.subtotal || 0)}</Text>
                  </View>

                  {items.length === 0 ? (
                    <Text style={styles.noItems}>No garment breakdown was recorded.</Text>
                  ) : (
                    <View style={styles.itemTable}>
                      <View style={styles.itemHeadRow}>
                        <Text style={[styles.itemHead, styles.colName]}>Item</Text>
                        <Text style={[styles.itemHead, styles.colNum]}>Qty</Text>
                        <Text style={[styles.itemHead, styles.colNum]}>Rate</Text>
                        <Text style={[styles.itemHead, styles.colNum]}>Total</Text>
                      </View>
                      {items.map((it, i) => (
                        <View key={i} style={styles.itemRow}>
                          <Text style={[styles.itemCell, styles.colName]} numberOfLines={2}>
                            {it.label || it.category || 'Item'}
                          </Text>
                          <Text style={[styles.itemCell, styles.colNum]}>{it.count}</Text>
                          <Text style={[styles.itemCell, styles.colNum]}>
                            {ci.isPiecewise && it.rate ? `₹${it.rate}` : '—'}
                          </Text>
                          <Text style={[styles.itemCell, styles.colNum]}>
                            {ci.isPiecewise && it.rate ? `₹${it.count * it.rate}` : '—'}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })
          )}

          <Divider style={styles.divider} />

          <SummaryRow label="Total weight" value={`${bill.totalWeight || 0} kg`} />
          <SummaryRow label="Total garments" value={String(bill.totalClothesCount || 0)} />
          <View style={styles.grandRow}>
            <Text style={styles.grandLabel}>Total</Text>
            <Text style={styles.grandValue}>{formatCurrency(bill.totalAmount || 0)}</Text>
          </View>

          {!!onAction && (
            <Button
              mode="contained"
              onPress={onAction}
              style={styles.actionBtn}
              contentStyle={{ height: 46 }}
              icon={isCompleted ? 'whatsapp' : 'cash-check'}
            >
              {actionLabel}
            </Button>
          )}
          <Button mode="text" onPress={onDismiss} style={styles.closeBtn}>Close</Button>
        </ScrollView>
      </Modal>
    </Portal>
  );
}

function Meta({ label, value }) {
  return (
    <View style={styles.meta}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function SummaryRow({ label, value }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  modal: {
    backgroundColor: appColors.surface,
    marginHorizontal: 16,
    borderRadius: 20,
    padding: 20,
    maxHeight: '88%',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  billId: { fontSize: 18, fontWeight: '800', color: appColors.text },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  badgePending: { backgroundColor: '#FEF3C7' },
  badgeDone: { backgroundColor: '#D1FAE5' },
  badgeText: { fontSize: 11, fontWeight: '700' },

  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  meta: { minWidth: '44%' },
  metaLabel: { fontSize: 10, color: appColors.textLight, textTransform: 'uppercase', letterSpacing: 0.5 },
  metaValue: { fontSize: 13, color: appColors.text, fontWeight: '600', marginTop: 1 },

  divider: { marginVertical: 14 },

  service: {
    borderWidth: 1, borderColor: appColors.border, borderRadius: 12,
    marginBottom: 10, overflow: 'hidden',
  },
  serviceHead: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    padding: 10, backgroundColor: appColors.surfaceVariant,
  },
  serviceTitle: { fontSize: 13, fontWeight: '700', color: appColors.text },
  serviceBasis: { fontSize: 11, color: appColors.textSecondary, marginTop: 2 },
  serviceTotal: { fontSize: 13, fontWeight: '800', color: appColors.text },

  itemTable: { paddingHorizontal: 10, paddingBottom: 8 },
  itemHeadRow: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: appColors.border },
  itemHead: { fontSize: 10, color: appColors.textLight, textTransform: 'uppercase', letterSpacing: 0.4 },
  itemRow: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  itemCell: { fontSize: 12, color: appColors.text },
  colName: { flex: 1 },
  colNum: { width: 58, textAlign: 'right' },

  noItems: { fontSize: 11, color: appColors.textLight, padding: 10 },
  empty: { fontSize: 13, color: appColors.textSecondary, textAlign: 'center', paddingVertical: 20 },

  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  summaryLabel: { fontSize: 13, color: appColors.textSecondary },
  summaryValue: { fontSize: 13, color: appColors.text, fontWeight: '600' },
  grandRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: appColors.border,
  },
  grandLabel: { fontSize: 16, fontWeight: '800', color: appColors.text },
  grandValue: { fontSize: 18, fontWeight: '800', color: appColors.primary },

  actionBtn: { marginTop: 18, borderRadius: 12 },
  closeBtn: { marginTop: 4 },
});
