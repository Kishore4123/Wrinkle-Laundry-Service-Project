// BillGenerationScreen — Search customer, build multi-service cart, generate bill
import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Searchbar, TextInput, Button, Text, RadioButton, Snackbar, SegmentedButtons } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CustomerService, BillService } from '../services/storage';
import { SettingsService } from '../services/settingsStorage';
import BillConfirmationModal from '../components/BillConfirmationModal';
import ClothingItemPicker from '../components/ClothingItemPicker';
import PiecewiseItemPicker from '../components/PiecewiseItemPicker';
import CartItemCard from '../components/CartItemCard';
import { appColors, SERVICE_TYPES, DEFAULT_CATEGORIES_PRICING } from '../theme/theme';
import { formatCurrency, formatBillId } from '../utils/helpers';
import { useSync } from '../services/SyncContext';
import { allocateBillNumber } from '../services/SyncService';

// Remove IRON_DRY from options here if it exists in SERVICE_TYPES
const SERVICE_KEYS = Object.keys(SERVICE_TYPES).filter(k => k !== 'IRON_DRY');

export default function BillGenerationScreen() {
  // Customer search
  const { syncBill: syncBillToDesktop, pricingVersion } = useSync();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showResults, setShowResults] = useState(false);

  // Settings
  const [categoriesConfig, setCategoriesConfig] = useState({});

  // Current cart item inputs
  const [serviceType, setServiceType] = useState('WASH_ONLY');
  const [billingMode, setBillingMode] = useState('kg'); // 'kg' or 'piece'
  const [weight, setWeight] = useState('');
  const [clothingItems, setClothingItems] = useState([]); // used for kg mode
  const [piecewiseItems, setPiecewiseItems] = useState([]); // used for piece mode
  const [showItemPicker, setShowItemPicker] = useState(false);

  // Cart
  const [cart, setCart] = useState([]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });
  const [modalVisible, setModalVisible] = useState(false);
  const [generatedBill, setGeneratedBill] = useState(null);

  // Load config on mount, and again whenever pricing changes on another device
  // so a bill is never priced from stale rates.
  useEffect(() => {
    loadConfig();
  }, [pricingVersion]);

  const loadConfig = async () => {
    const config = await SettingsService.getCategories();
    setCategoriesConfig(config);
  };

  // When service type changes, force billing mode if necessary
  useEffect(() => {
    if (serviceType === 'WASH_ONLY') {
      setBillingMode('kg');
    } else if (serviceType === 'IRON_STEAM') {
      setBillingMode('piece');
    }
    // For WASH_AND_IRON, it can be either, so we don't force change it
  }, [serviceType]);

  const customerCategory = selectedCustomer?.category || 'Student';
  const categoryPricing = categoriesConfig[customerCategory] || DEFAULT_CATEGORIES_PRICING.Student;

  const currentKgRate = categoryPricing?.kgRates?.[serviceType] || SERVICE_TYPES[serviceType]?.defaultRate || 0;
  const currentPieceRates = categoryPricing?.pieceRates?.[serviceType] || {};

  // Computed for current input
  const weightNum = parseFloat(weight) || 0;
  
  let currentSubtotal = 0;
  if (billingMode === 'kg') {
    currentSubtotal = Math.round(weightNum * currentKgRate * 100) / 100;
  } else {
    currentSubtotal = piecewiseItems.reduce((sum, item) => sum + (item.count * item.rate), 0);
  }

  const totalItemsCount = billingMode === 'kg' 
    ? clothingItems.reduce((sum, i) => sum + i.count, 0)
    : piecewiseItems.reduce((sum, i) => sum + i.count, 0);

  // Cart totals
  const cartTotalAmount = cart.reduce((sum, item) => sum + item.subtotal, 0);
  const cartTotalWeight = cart.reduce((sum, item) => sum + (item.weight || 0), 0);
  const cartTotalItems = cart.reduce(
    (sum, item) => sum + (item.items || []).reduce((s, i) => s + i.count, 0),
    0
  );

  const grandTotal = cartTotalAmount;

  // Handlers
  const handleSearch = async (query) => {
    setSearchQuery(query);
    if (query.trim().length > 0) {
      const results = await CustomerService.search(query);
      setSearchResults(results);
      setShowResults(true);
    } else {
      setSearchResults([]);
      setShowResults(false);
    }
  };

  const selectCustomer = (customer) => {
    setSelectedCustomer(customer);
    setSearchQuery('');
    setSearchResults([]);
    setShowResults(false);
  };

  const clearCustomer = () => {
    setSelectedCustomer(null);
    setSearchQuery('');
  };

  const handleAddToCart = () => {
    if (billingMode === 'kg' && (!weight || weightNum <= 0)) {
      setSnackbar({ visible: true, message: 'Please enter a valid weight.' });
      return;
    }
    if (billingMode === 'piece' && piecewiseItems.length === 0) {
      setSnackbar({ visible: true, message: 'Please select at least one piece.' });
      return;
    }

    const cartItem = {
      serviceType,
      isPiecewise: billingMode === 'piece',
      weight: billingMode === 'kg' ? weightNum : 0,
      items: billingMode === 'kg' ? [...clothingItems] : [...piecewiseItems],
      ratePerKg: billingMode === 'kg' ? currentKgRate : 0,
      subtotal: currentSubtotal,
    };

    setCart([...cart, cartItem]);
    // Reset current inputs
    setWeight('');
    setClothingItems([]);
    setPiecewiseItems([]);
    setShowItemPicker(false);
    setServiceType('WASH_ONLY');
  };

  const handleRemoveFromCart = (index) => {
    setCart(cart.filter((_, i) => i !== index));
  };

  const handleGenerateBill = async () => {
    if (!selectedCustomer) {
      setSnackbar({ visible: true, message: 'Please select a customer first.' });
      return;
    }
    if (cart.length === 0) {
      setSnackbar({ visible: true, message: 'Please add at least one service to the cart.' });
      return;
    }

    setLoading(true);
    try {
      const totalWeight = cart.reduce((sum, item) => sum + (item.weight || 0), 0);
      const totalClothesCount = cart.reduce(
        (sum, item) => sum + (item.items || []).reduce((s, i) => s + i.count, 0),
        0
      );
      const totalAmount = cart.reduce((sum, item) => sum + item.subtotal, 0);

      // The bill number comes from the shared Firestore counter, so it is unique
      // across every phone and the desktop. Without connectivity there is no
      // number to issue — the receipt carries it and it can never change later.
      let billNumber;
      try {
        billNumber = await allocateBillNumber();
      } catch (e) {
        setSnackbar({
          visible: true,
          message: 'No internet connection — a bill number cannot be reserved. Please reconnect and try again.',
        });
        setLoading(false);
        return;
      }

      const now = new Date();
      const datePrefix = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      const billId = formatBillId(datePrefix, billNumber);

      const bill = await BillService.save({
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        customerCategory: selectedCustomer.category || 'Student',
        mobile: selectedCustomer.mobile,
        cartItems: cart,
        totalWeight,
        totalClothesCount,
        totalAmount: Math.round(totalAmount * 100) / 100,
      }, billId);

      setGeneratedBill(bill);
      syncBillToDesktop(bill);
      setModalVisible(true);
    } catch (error) {
      setSnackbar({ visible: true, message: 'Failed to generate bill. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const handleModalDismiss = () => {
    setModalVisible(false);
    setGeneratedBill(null);
    // Reset everything
    setSelectedCustomer(null);
    setWeight('');
    setClothingItems([]);
    setPiecewiseItems([]);
    setServiceType('WASH_ONLY');
    setCart([]);
    setSearchQuery('');
    setShowItemPicker(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>New Bill</Text>
          <Text style={styles.headerSubtitle}>Generate a laundry bill for a customer</Text>
        </View>

        {/* Customer Search Section */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>
            <MaterialCommunityIcons name="account-search" size={16} color={appColors.primary} />
            {'  '}Find Customer
          </Text>

          {!selectedCustomer ? (
            <View>
              <Searchbar
                placeholder="Search by name or mobile..."
                onChangeText={handleSearch}
                value={searchQuery}
                style={styles.searchbar}
                inputStyle={styles.searchInput}
                elevation={0}
              />

              {/* Search Results Dropdown */}
              {showResults && searchResults.length > 0 && (
                <View style={styles.resultsContainer}>
                  {searchResults.slice(0, 5).map((customer) => {
                    const isStudent = (customer.category || 'Student').toLowerCase() === 'student';
                    return (
                      <TouchableOpacity
                        key={customer.id}
                        style={styles.resultItem}
                        onPress={() => selectCustomer(customer)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.resultAvatar, isStudent ? { backgroundColor: '#EEF2FF' } : { backgroundColor: '#CCFBF1' }]}>
                          <Text style={[styles.resultAvatarText, { color: isStudent ? appColors.primary : appColors.secondary }]}>
                            {customer.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.resultInfo}>
                          <Text style={styles.resultName}>{customer.name}</Text>
                          <Text style={styles.resultDetail}>
                            {customer.mobile} • {customer.category || 'Student'}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {showResults && searchResults.length === 0 && searchQuery.length > 0 && (
                <View style={styles.noResults}>
                  <MaterialCommunityIcons name="account-question" size={24} color={appColors.textLight} />
                  <Text style={styles.noResultsText}>No customers found</Text>
                </View>
              )}
            </View>
          ) : (
            /* Selected Customer Card */
            <View style={styles.selectedCard}>
              <View style={styles.selectedAvatar}>
                <Text style={styles.selectedAvatarText}>
                  {selectedCustomer.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.selectedInfo}>
                <Text style={styles.selectedName}>{selectedCustomer.name}</Text>
                <Text style={styles.selectedDetail}>
                  {selectedCustomer.mobile} • {selectedCustomer.category || 'Student'}
                </Text>
              </View>
              <TouchableOpacity onPress={clearCustomer} style={styles.clearBtn}>
                <MaterialCommunityIcons name="close-circle" size={24} color={appColors.textLight} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Service Type Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>
            <MaterialCommunityIcons name="cog-outline" size={16} color={appColors.primary} />
            {'  '}Service Type
          </Text>

          <RadioButton.Group
            onValueChange={(value) => setServiceType(value)}
            value={serviceType}
          >
            {SERVICE_KEYS.map((key) => {
              const svc = SERVICE_TYPES[key];
              if (!svc) return null; // safety
              const rate = categoryPricing?.kgRates?.[key] || svc.defaultRate;
              const isSelected = serviceType === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.serviceOption,
                    isSelected && { borderColor: svc.color, backgroundColor: svc.bgColor },
                  ]}
                  onPress={() => setServiceType(key)}
                  activeOpacity={0.7}
                >
                  <View style={styles.serviceOptionLeft}>
                    <RadioButton.Android value={key} color={svc.color} />
                    <View>
                      <Text style={[
                        styles.serviceLabel,
                        isSelected && { color: svc.color },
                      ]}>
                        {svc.label}
                      </Text>
                      {key !== 'IRON_STEAM' && (
                        <Text style={styles.serviceRate}>₹{rate} per kg</Text>
                      )}
                    </View>
                  </View>
                  <MaterialCommunityIcons
                    name={svc.icon}
                    size={28}
                    color={isSelected ? svc.color : appColors.textLight}
                  />
                </TouchableOpacity>
              );
            })}
          </RadioButton.Group>
        </View>

        {/* Laundry Details */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>
            <MaterialCommunityIcons name="clipboard-text-outline" size={16} color={appColors.primary} />
            {'  '}Laundry Details
          </Text>

          {serviceType === 'WASH_AND_IRON' && (
            <SegmentedButtons
              value={billingMode}
              onValueChange={setBillingMode}
              buttons={[
                { value: 'kg', label: 'By Kg', icon: 'weight-kilogram' },
                { value: 'piece', label: 'By Piece', icon: 'hanger' },
              ]}
              style={{ marginBottom: 16 }}
            />
          )}

          {billingMode === 'kg' ? (
            <View>
              {/* Weight */}
              <TextInput
                label="Weight (kg)"
                value={weight}
                onChangeText={(t) => setWeight(t.replace(/[^0-9.]/g, ''))}
                mode="outlined"
                style={styles.input}
                outlineStyle={styles.inputOutline}
                left={<TextInput.Icon icon="weight-kilogram" />}
                keyboardType="decimal-pad"
                placeholder="e.g. 2.5"
              />

              {/* Clothing Items Picker Toggle */}
              <TouchableOpacity
                style={styles.itemPickerToggle}
                onPress={() => setShowItemPicker(!showItemPicker)}
                activeOpacity={0.7}
              >
                <View style={styles.itemPickerToggleLeft}>
                  <MaterialCommunityIcons name="tshirt-crew-outline" size={20} color={appColors.primary} />
                  <View>
                    <Text style={styles.itemPickerToggleTitle}>Itemize Clothing</Text>
                    <Text style={styles.itemPickerToggleSubtitle}>
                      {totalItemsCount > 0
                        ? `${totalItemsCount} item${totalItemsCount !== 1 ? 's' : ''} selected`
                        : 'Optional: specify clothing categories'}
                    </Text>
                  </View>
                </View>
                <MaterialCommunityIcons
                  name={showItemPicker ? 'chevron-up' : 'chevron-down'}
                  size={24}
                  color={appColors.textLight}
                />
              </TouchableOpacity>

              {showItemPicker && (
                <View style={styles.itemPickerContainer}>
                  <ClothingItemPicker
                    items={clothingItems}
                    onItemsChange={setClothingItems}
                  />
                </View>
              )}
            </View>
          ) : (
            <PiecewiseItemPicker
              items={piecewiseItems}
              onItemsChange={setPiecewiseItems}
              pieceRates={currentPieceRates}
            />
          )}
        </View>

        {/* Current Item Preview */}
        {((billingMode === 'kg' && weightNum > 0) || (billingMode === 'piece' && piecewiseItems.length > 0)) && (
          <View style={styles.currentPreview}>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>
                {SERVICE_TYPES[serviceType]?.label} • {billingMode === 'kg' ? `${weightNum} kg × ₹${currentKgRate}` : `${totalItemsCount} pieces`}
              </Text>
              <Text style={styles.previewValue}>{formatCurrency(currentSubtotal)}</Text>
            </View>
            <Button
              mode="contained"
              onPress={handleAddToCart}
              style={styles.addToCartBtn}
              contentStyle={styles.addToCartContent}
              labelStyle={styles.addToCartLabel}
              icon="cart-plus"
              buttonColor={appColors.secondary}
            >
              Add to Cart
            </Button>
          </View>
        )}

        {/* Cart Summary */}
        {cart.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              <MaterialCommunityIcons name="cart-outline" size={16} color={appColors.primary} />
              {'  '}Cart ({cart.length} service{cart.length !== 1 ? 's' : ''})
            </Text>

            {cart.map((cartItem, index) => (
              <CartItemCard
                key={index}
                cartItem={cartItem}
                index={index}
                onDelete={handleRemoveFromCart}
              />
            ))}

            {/* Grand Total */}
            <View style={styles.priceSummary}>
              {cartTotalWeight > 0 && (
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>Total Weight</Text>
                  <Text style={styles.priceValue}>{cartTotalWeight} kg</Text>
                </View>
              )}
              {cartTotalItems > 0 && (
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>Total Items</Text>
                  <Text style={styles.priceValue}>{cartTotalItems}</Text>
                </View>
              )}
              <View style={styles.priceDivider} />
              <View style={styles.priceRow}>
                <Text style={styles.totalLabel}>Grand Total</Text>
                <Text style={styles.totalValue}>{formatCurrency(grandTotal)}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Generate Button */}
        <View style={styles.buttonContainer}>
          <Button
            mode="contained"
            onPress={handleGenerateBill}
            loading={loading}
            disabled={loading || !selectedCustomer || cart.length === 0}
            style={styles.generateBtn}
            contentStyle={styles.generateContent}
            labelStyle={styles.generateLabel}
            icon={({ size, color }) => (
              <MaterialCommunityIcons name="receipt" size={size} color={color} />
            )}
          >
            Generate Bill
          </Button>
        </View>
      </ScrollView>

      {/* Bill Confirmation Modal */}
      <BillConfirmationModal
        visible={modalVisible}
        bill={generatedBill}
        onDismiss={handleModalDismiss}
      />

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ visible: false, message: '' })}
        duration={3000}
        style={styles.snackbar}
      >
        {snackbar.message}
      </Snackbar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: appColors.background,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
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
  section: {
    paddingHorizontal: 20,
    marginTop: 20,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: appColors.text,
    marginBottom: 12,
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
  resultsContainer: {
    backgroundColor: appColors.surface,
    borderRadius: 14,
    marginTop: 8,
    elevation: 3,
    shadowColor: appColors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    overflow: 'hidden',
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: appColors.border,
  },
  resultAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  resultAvatarText: {
    fontSize: 15,
    fontWeight: '700',
  },
  resultInfo: {
    flex: 1,
  },
  resultName: {
    fontSize: 14,
    fontWeight: '600',
    color: appColors.text,
  },
  resultDetail: {
    fontSize: 12,
    color: appColors.textSecondary,
    marginTop: 2,
  },
  noResults: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  noResultsText: {
    fontSize: 13,
    color: appColors.textLight,
  },
  selectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: appColors.primaryLight,
  },
  selectedAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: appColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  selectedAvatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  selectedInfo: {
    flex: 1,
  },
  selectedName: {
    fontSize: 16,
    fontWeight: '700',
    color: appColors.text,
  },
  selectedDetail: {
    fontSize: 13,
    color: appColors.textSecondary,
    marginTop: 2,
  },
  clearBtn: {
    padding: 4,
  },
  serviceOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: appColors.surface,
    borderRadius: 14,
    paddingRight: 16,
    paddingVertical: 4,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: appColors.border,
  },
  serviceOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  serviceLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: appColors.text,
  },
  serviceRate: {
    fontSize: 12,
    color: appColors.textSecondary,
    marginTop: 2,
  },
  input: {
    marginBottom: 12,
    backgroundColor: appColors.surface,
  },
  inputOutline: {
    borderRadius: 14,
  },
  itemPickerToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: appColors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: appColors.border,
  },
  itemPickerToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  itemPickerToggleTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: appColors.text,
  },
  itemPickerToggleSubtitle: {
    fontSize: 12,
    color: appColors.textSecondary,
    marginTop: 2,
  },
  itemPickerContainer: {
    marginTop: 12,
    backgroundColor: appColors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: appColors.border,
  },
  currentPreview: {
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: appColors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: appColors.secondaryLight,
    borderStyle: 'dashed',
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  previewLabel: {
    fontSize: 13,
    color: appColors.textSecondary,
    fontWeight: '500',
    flex: 1,
  },
  previewValue: {
    fontSize: 16,
    fontWeight: '700',
    color: appColors.secondary,
  },
  addToCartBtn: {
    borderRadius: 12,
  },
  addToCartContent: {
    height: 44,
  },
  addToCartLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  priceSummary: {
    backgroundColor: appColors.surface,
    borderRadius: 16,
    padding: 20,
    marginTop: 12,
    elevation: 2,
    shadowColor: appColors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  priceLabel: {
    fontSize: 14,
    color: appColors.textSecondary,
  },
  priceValue: {
    fontSize: 14,
    color: appColors.text,
    fontWeight: '500',
  },
  priceDivider: {
    height: 1,
    backgroundColor: appColors.border,
    marginVertical: 8,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: appColors.text,
  },
  totalValue: {
    fontSize: 22,
    fontWeight: '800',
    color: appColors.primary,
  },
  buttonContainer: {
    paddingHorizontal: 20,
    marginTop: 24,
  },
  generateBtn: {
    borderRadius: 14,
    elevation: 4,
    shadowColor: appColors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  generateContent: {
    height: 56,
  },
  generateLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  snackbar: {
    backgroundColor: appColors.error,
  },
});
