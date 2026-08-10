// CustomersScreen — List all customers with search, delete, and FAB to add
import React, { useState, useCallback } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { Searchbar, FAB, Text, Dialog, Portal, Button } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { CustomerService } from '../services/storage';
import CustomerCard from '../components/CustomerCard';
import EmptyState from '../components/EmptyState';
import { appColors } from '../theme/theme';

export default function CustomersScreen({ navigation }) {
  const [customers, setCustomers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState({ visible: false, customer: null });

  // Reload customers whenever this screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadCustomers();
    }, [])
  );

  const loadCustomers = async () => {
    setLoading(true);
    const data = await CustomerService.getAll();
    setCustomers(data);
    setLoading(false);
  };

  const handleSearch = async (query) => {
    setSearchQuery(query);
    if (query.trim().length === 0) {
      loadCustomers();
    } else {
      const results = await CustomerService.search(query);
      setCustomers(results);
    }
  };

  const confirmDelete = (customer) => {
    setDeleteDialog({ visible: true, customer });
  };

  const handleDelete = async () => {
    if (deleteDialog.customer) {
      await CustomerService.delete(deleteDialog.customer.id);
      setDeleteDialog({ visible: false, customer: null });
      loadCustomers();
    }
  };

  const renderItem = ({ item }) => (
    <CustomerCard customer={item} onDelete={confirmDelete} />
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Customers</Text>
        <Text style={styles.headerSubtitle}>
          {customers.length} registered customer{customers.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search by name or mobile..."
          onChangeText={handleSearch}
          value={searchQuery}
          style={styles.searchbar}
          inputStyle={styles.searchInput}
          elevation={0}
        />
      </View>

      {/* List */}
      <FlatList
        data={customers}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={customers.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={
          <EmptyState
            icon="account-group-outline"
            title="No Customers Yet"
            subtitle="Tap the + button below to add your first customer."
          />
        }
        refreshing={loading}
        onRefresh={loadCustomers}
        showsVerticalScrollIndicator={false}
      />

      {/* FAB */}
      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() => navigation.navigate('AddCustomer')}
        color="#FFFFFF"
        customSize={60}
      />

      {/* Delete Confirmation */}
      <Portal>
        <Dialog
          visible={deleteDialog.visible}
          onDismiss={() => setDeleteDialog({ visible: false, customer: null })}
          style={styles.dialog}
        >
          <Dialog.Icon icon="alert-circle-outline" color={appColors.error} size={40} />
          <Dialog.Title style={styles.dialogTitle}>Delete Customer?</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.dialogText}>
              Are you sure you want to delete{' '}
              <Text style={styles.dialogBold}>{deleteDialog.customer?.name}</Text>?
              This action cannot be undone.
            </Text>
          </Dialog.Content>
          <Dialog.Actions style={styles.dialogActions}>
            <Button
              onPress={() => setDeleteDialog({ visible: false, customer: null })}
              textColor={appColors.textSecondary}
            >
              Cancel
            </Button>
            <Button
              onPress={handleDelete}
              textColor={appColors.error}
              mode="contained"
              buttonColor={appColors.errorLight}
              style={{ borderRadius: 10 }}
            >
              Delete
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
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
    paddingBottom: 100,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    backgroundColor: appColors.primary,
    borderRadius: 30,
    elevation: 6,
    shadowColor: appColors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  dialog: {
    borderRadius: 20,
    backgroundColor: appColors.surface,
  },
  dialogTitle: {
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
  },
  dialogText: {
    textAlign: 'center',
    color: appColors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  dialogBold: {
    fontWeight: '700',
    color: appColors.text,
  },
  dialogActions: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
});
