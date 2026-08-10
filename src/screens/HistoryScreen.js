// HistoryScreen — Chronological list of all generated bills with search and payment
import React, { useState, useCallback } from 'react';
import { View, StyleSheet, FlatList, ScrollView } from 'react-native';
import { Searchbar, Text, Modal, Portal, Button, Chip } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { BillService } from '../services/storage';
import BillCard from '../components/BillCard';
import EmptyState from '../components/EmptyState';
import { appColors, SERVICE_TYPES } from '../theme/theme';
import { formatDate, formatCurrency } from '../utils/helpers';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function HistoryScreen({ route, navigation }) {
  const [bills, setBills] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedBill, setSelectedBill] = useState(null);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);

  // Watch for scanned bill
  useFocusEffect(
    useCallback(() => {
      if (route.params?.scannedBillId && bills.length > 0) {
        const found = bills.find(b => b.id === route.params.scannedBillId);
        if (found) {
          setSelectedBill(found);
          setPaymentModalVisible(true);
          // Clear the param so it doesn't re-trigger on subsequent focuses
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

  // Calculate summary stats
  const totalRevenue = bills.reduce((sum, b) => sum + b.totalAmount, 0);
  const totalOrders = bills.length;

  const handlePaymentDone = async () => {
    if (selectedBill) {
      await BillService.markPaymentDone(selectedBill.id);
      setPaymentModalVisible(false);
      setSelectedBill(null);
      loadBills();
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

      {/* List */}
      <FlatList
        data={bills}
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

                {/* Cart items display */}
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
    gap: 12,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 12,
    color: appColors.textSecondary,
    marginTop: 4,
    fontWeight: '500',
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
  cancelButton: {
    width: '100%',
    borderRadius: 14,
    borderColor: appColors.border,
  },
});
