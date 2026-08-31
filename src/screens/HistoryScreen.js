// HistoryScreen — Chronological list of all generated bills with search and payment
import React, { useState, useCallback } from 'react';
import { View, StyleSheet, FlatList, ScrollView, Linking, Alert, TouchableOpacity, Platform } from 'react-native';
import { Searchbar, Text, Modal, Portal, Button, Chip, TextInput } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { BillService } from '../services/storage';
import BillCard from '../components/BillCard';
import EmptyState from '../components/EmptyState';
import { appColors, SERVICE_TYPES } from '../theme/theme';
import { formatDate, formatCurrency, buildWhatsAppUrl, buildOrderReadyMessage } from '../utils/helpers';
import { MaterialCommunityIcons } from '@expo/vector-icons';

// Format a Date object to DD/MM/YYYY string
function formatDateDDMMYYYY(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

// Get today's date string in DD/MM/YYYY
function getTodayString() {
  return formatDateDDMMYYYY(new Date());
}

// Parse a dueDate string (DD/MM/YYYY) to a Date object for sorting
function parseDueDate(dueDateStr) {
  if (!dueDateStr) return null;
  const parts = dueDateStr.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

export default function HistoryScreen({ route, navigation }) {
  const [bills, setBills] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedBill, setSelectedBill] = useState(null);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [doneModalVisible, setDoneModalVisible] = useState(false);
  const [deliveryDate, setDeliveryDate] = useState(null); // Date object or null
  const [showDeliveryDatePicker, setShowDeliveryDatePicker] = useState(false);

  // Watch for scanned bill
  useFocusEffect(
    useCallback(() => {
      if (route.params?.scannedBillId && bills.length > 0) {
        const found = bills.find(b => b.id === route.params.scannedBillId);
        if (found) {
          setSelectedBill(found);
          setPaymentModalVisible(true);
          navigation.setParams({ scannedBillId: undefined });
        }
      }
    }, [route.params?.scannedBillId, bills])
  );

  useFocusEffect(
    useCallback(() => {
      loadBills();
    }, [])
  );

  const loadBills = async () => {
    setLoading(true);
    const data = await BillService.getAll();
    setBills(data);
    setLoading(false);
  };

  const handleSearch = async (query) => {
    setSearchQuery(query);
    if (query.trim().length === 0) {
      loadBills();
    } else {
      const results = await BillService.search(query);
      setBills(results);
    }
  };

  const totalRevenue = bills.reduce((sum, b) => sum + b.totalAmount, 0);
  const totalOrders = bills.length;

  // Delivery Today count — bills whose dueDate matches today
  const todayStr = getTodayString();
  const deliveryTodayCount = bills.filter(b => b.dueDate === todayStr).length;

  // Sort bills by dueDate (upcoming first), then by createdAt
  const sortedBills = [...bills].sort((a, b) => {
    const dateA = parseDueDate(a.dueDate);
    const dateB = parseDueDate(b.dueDate);

    // Bills with dueDate come before those without
    if (dateA && !dateB) return -1;
    if (!dateA && dateB) return 1;

    // Both have dueDates — sort ascending (soonest first)
    if (dateA && dateB) {
      const diff = dateA.getTime() - dateB.getTime();
      if (diff !== 0) return diff;
    }

    // Fallback: sort by createdAt descending (newest first)
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  const handlePaymentDone = async () => {
    if (selectedBill) {
      await BillService.markPaymentDone(selectedBill.id);
      setPaymentModalVisible(false);
      setSelectedBill(null);
      loadBills();
    }
  };

  const handleOrderDone = () => {
    setPaymentModalVisible(false);
    setDeliveryDate(null);
    setShowDeliveryDatePicker(false);
    setDoneModalVisible(true);
  };

  const handleConfirmDone = async () => {
    if (selectedBill) {
      const mobile = selectedBill.mobile || '';
      const dateStr = deliveryDate ? formatDateDDMMYYYY(deliveryDate) : '';
      const message = buildOrderReadyMessage(selectedBill, dateStr);
      try {
        const url = buildWhatsAppUrl(mobile, message);
        const canOpen = await Linking.canOpenURL(url);
        if (canOpen) {
          await Linking.openURL(url);
        } else {
          const webUrl = `https://wa.me/91${mobile}?text=${encodeURIComponent(message)}`;
          await Linking.openURL(webUrl);
        }
      } catch (error) {
        Alert.alert('Error', 'Could not open WhatsApp. Make sure it is installed.');
      }
      setDoneModalVisible(false);
      setDeliveryDate(null);
      setShowDeliveryDatePicker(false);
      setSelectedBill(null);
    }
  };

  const renderItem = ({ item }) => (
    <BillCard 
      bill={item} 
      onPress={() => {
        setSelectedBill(item);
        setPaymentModalVisible(true);
      }} 
    />
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>History</Text>
        <Text style={styles.headerSubtitle}>All generated bills</Text>
      </View>

      {/* Stats Cards */}
      {totalOrders > 0 && (
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: '#EEF2FF' }]}>
            <Text style={[styles.statValue, { color: appColors.primary }]}>{totalOrders}</Text>
            <Text style={styles.statLabel}>Total Bills</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#CCFBF1' }]}>
            <Text style={[styles.statValue, { color: appColors.secondary }]}>
              {formatCurrency(totalRevenue)}
            </Text>
            <Text style={styles.statLabel}>Total Revenue</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#FEF3C7' }]}>
            <Text style={[styles.statValue, { color: '#D97706' }]}>{deliveryTodayCount}</Text>
            <Text style={styles.statLabel}>Delivery Today</Text>
          </View>
        </View>
      )}

      {/* Search */}
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search by name, mobile, or bill ID..."
          onChangeText={handleSearch}
          value={searchQuery}
          style={styles.searchbar}
          inputStyle={styles.searchInput}
          elevation={0}
        />
      </View>

      {/* List — sorted by dueDate */}
      <FlatList
        data={sortedBills}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={bills.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={
          <EmptyState
            icon="receipt-text-outline"
            title="No Bills Yet"
            subtitle="Generated bills will appear here. Go to the Bills tab to create your first bill."
          />
        }
        refreshing={loading}
        onRefresh={loadBills}
        showsVerticalScrollIndicator={false}
      />

      {/* Payment Confirmation Modal */}
      <Portal>
        <Modal
          visible={paymentModalVisible}
          onDismiss={() => setPaymentModalVisible(false)}
          contentContainerStyle={styles.modal}
        >
          {selectedBill && (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalScroll}>
              <View style={styles.iconCircle}>
                <MaterialCommunityIcons name="cash-register" size={32} color="#FFFFFF" />
              </View>
              <Text style={styles.modalTitle}>Confirm Payment</Text>
              <Text style={styles.billId}>{selectedBill.id}</Text>

              <View style={styles.summaryCard}>
                <SummaryRow label="Customer" value={selectedBill.customerName || selectedBill.studentName} />

                {selectedBill.cartItems && selectedBill.cartItems.length > 0 ? (
                  <>
                    {selectedBill.cartItems.map((cartItem, idx) => {
                      const service = SERVICE_TYPES[cartItem.serviceType];
                      const itemCount = (cartItem.items || []).reduce((s, i) => s + i.count, 0);
                      return (
                        <View key={idx} style={styles.cartSection}>
                          <View style={styles.cartHeader}>
                            <View style={[styles.cartBadge, { backgroundColor: service?.bgColor || '#EEF2FF' }]}>
                              <Text style={[styles.cartBadgeText, { color: service?.color || appColors.primary }]}>
                                {idx + 1}
                              </Text>
                            </View>
                            <Text style={styles.cartServiceName}>{service?.label || cartItem.serviceType}</Text>
                          </View>
                          <SummaryRow label="Weight" value={`${cartItem.weight} kg`} />
                          {itemCount > 0 && <SummaryRow label="Items" value={`${itemCount}`} />}
                          <SummaryRow label="Rate" value={`₹${cartItem.ratePerKg}/kg`} />
                          <SummaryRow label="Subtotal" value={formatCurrency(cartItem.subtotal)} />
                        </View>
                      );
                    })}
                  </>
                ) : (
                  <>
                    <SummaryRow label="Weight" value={`${selectedBill.weight || selectedBill.totalWeight} kg`} />
                    <SummaryRow 
                      label="Service" 
                      value={SERVICE_TYPES[selectedBill.serviceType]?.label || selectedBill.serviceType} 
                    />
                  </>
                )}
                
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Total Amount</Text>
                  <Text style={styles.totalValue}>{formatCurrency(selectedBill.totalAmount)}</Text>
                </View>
              </View>

              <Button
                mode="contained"
                onPress={handlePaymentDone}
                style={styles.payButton}
                contentStyle={styles.payButtonContent}
                buttonColor={appColors.primary}
              >
                Payment Done
              </Button>
              <Button
                mode="contained"
                onPress={handleOrderDone}
                style={styles.doneButton}
                contentStyle={styles.payButtonContent}
                buttonColor="#10B981"
                icon={({ size, color }) => (
                  <MaterialCommunityIcons name="check-circle" size={size} color={color} />
                )}
              >
                Done — Notify Customer
              </Button>
              <Button
                mode="outlined"
                onPress={() => setPaymentModalVisible(false)}
                style={styles.cancelButton}
              >
                Cancel
              </Button>
            </ScrollView>
          )}
        </Modal>
      </Portal>

      {/* Delivery Date Modal */}
      <Portal>
        <Modal
          visible={doneModalVisible}
          onDismiss={() => setDoneModalVisible(false)}
          contentContainerStyle={styles.modal}
        >
          <View style={styles.modalScroll}>
            <View style={[styles.iconCircle, { backgroundColor: '#10B981' }]}>
              <MaterialCommunityIcons name="truck-delivery" size={32} color="#FFFFFF" />
            </View>
            <Text style={styles.modalTitle}>Order Ready 🎉</Text>
            <Text style={[styles.billId, { marginBottom: 8 }]}>
              {selectedBill?.id}
            </Text>
            <Text style={{ fontSize: 13, color: appColors.textSecondary, textAlign: 'center', marginBottom: 20 }}>
              Select a delivery date to notify{' '}
              <Text style={{ fontWeight: '700', color: appColors.text }}>
                {selectedBill?.customerName || selectedBill?.studentName}
              </Text>{' '}
              via WhatsApp.
            </Text>

            {/* Calendar Date Picker */}
            <TouchableOpacity
              style={styles.datePickerTouchable}
              onPress={() => setShowDeliveryDatePicker(true)}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="calendar" size={20} color={appColors.primary} />
              <Text style={deliveryDate ? styles.datePickerText : styles.datePickerPlaceholder}>
                {deliveryDate ? formatDateDDMMYYYY(deliveryDate) : 'Select Delivery Date'}
              </Text>
              {deliveryDate && (
                <TouchableOpacity onPress={() => setDeliveryDate(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialCommunityIcons name="close-circle" size={20} color={appColors.textLight} />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
            {showDeliveryDatePicker && (
              <DateTimePicker
                value={deliveryDate || new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                minimumDate={new Date()}
                onChange={(event, selectedDate) => {
                  setShowDeliveryDatePicker(Platform.OS === 'ios');
                  if (event.type !== 'dismissed' && selectedDate) {
                    setDeliveryDate(selectedDate);
                  }
                }}
              />
            )}

            <Button
              mode="contained"
              onPress={handleConfirmDone}
              style={[styles.payButton, { marginTop: 20 }]}
              contentStyle={styles.payButtonContent}
              buttonColor="#25D366"
              icon={({ size, color }) => (
                <MaterialCommunityIcons name="whatsapp" size={size} color={color} />
              )}
            >
              Send via WhatsApp
            </Button>
            <Button
              mode="outlined"
              onPress={() => setDoneModalVisible(false)}
              style={styles.cancelButton}
            >
              Cancel
            </Button>
          </View>
        </Modal>
      </Portal>
    </View>
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
  container: {
    flex: 1,
    backgroundColor: appColors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: appColors.text,
  },
  headerSubtitle: {
    fontSize: 14,
    color: appColors.textSecondary,
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 8,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 11,
    color: appColors.textSecondary,
    marginTop: 4,
    fontWeight: '500',
    textAlign: 'center',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchbar: {
    backgroundColor: appColors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: appColors.border,
  },
  searchInput: {
    fontSize: 14,
  },
  listContent: {
    paddingTop: 4,
    paddingBottom: 24,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  modal: {
    backgroundColor: appColors.surface,
    marginHorizontal: 24,
    borderRadius: 24,
    padding: 28,
    maxHeight: '85%',
  },
  modalScroll: {
    alignItems: 'center',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: appColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    elevation: 4,
    shadowColor: appColors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  modalTitle: {
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
  cartSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: appColors.border,
  },
  cartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
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
  payButton: {
    width: '100%',
    borderRadius: 14,
    marginBottom: 10,
  },
  payButtonContent: {
    height: 48,
  },
  doneButton: {
    width: '100%',
    borderRadius: 14,
    marginBottom: 10,
  },
  cancelButton: {
    width: '100%',
    borderRadius: 14,
    borderColor: appColors.border,
  },
  datePickerTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    backgroundColor: appColors.surfaceVariant,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: appColors.border,
    gap: 10,
  },
  datePickerText: {
    flex: 1,
    fontSize: 14,
    color: appColors.text,
    fontWeight: '500',
  },
  datePickerPlaceholder: {
    flex: 1,
    fontSize: 14,
    color: appColors.textLight,
  },
});
