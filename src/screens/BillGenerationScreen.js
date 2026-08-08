// BillGenerationScreen — Search student, enter laundry details, generate bill
import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Searchbar, TextInput, Button, Text, RadioButton, Snackbar } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StudentService, BillService } from '../services/storage';
import BillConfirmationModal from '../components/BillConfirmationModal';
import { appColors, SERVICE_TYPES, RATES } from '../theme/theme';
import { formatCurrency } from '../utils/helpers';

export default function BillGenerationScreen() {
  // Student search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [showResults, setShowResults] = useState(false);

  // Bill inputs
  const [weight, setWeight] = useState('');
  const [clothesCount, setClothesCount] = useState('');
  const [serviceType, setServiceType] = useState('WASH_ONLY');

  // UI state
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });
  const [modalVisible, setModalVisible] = useState(false);
  const [generatedBill, setGeneratedBill] = useState(null);

  // Computed
  const rate = RATES[serviceType];
  const weightNum = parseFloat(weight) || 0;
  const totalAmount = Math.round(weightNum * rate * 100) / 100;

  // Handlers
  const handleSearch = async (query) => {
    setSearchQuery(query);
    if (query.trim().length > 0) {
      const results = await StudentService.search(query);
      setSearchResults(results);
      setShowResults(true);
    } else {
      setSearchResults([]);
      setShowResults(false);
    }
  };

  const selectStudent = (student) => {
    setSelectedStudent(student);
    setSearchQuery('');
    setSearchResults([]);
    setShowResults(false);
  };

  const clearStudent = () => {
    setSelectedStudent(null);
    setSearchQuery('');
  };

  const handleGenerateBill = async () => {
    // Validate
    if (!selectedStudent) {
      setSnackbar({ visible: true, message: 'Please select a student first.' });
      return;
    }
    if (!weight || weightNum <= 0) {
      setSnackbar({ visible: true, message: 'Please enter a valid weight.' });
      return;
    }
    if (!clothesCount || parseInt(clothesCount, 10) <= 0) {
      setSnackbar({ visible: true, message: 'Please enter the number of clothes.' });
      return;
    }

    setLoading(true);
    try {
      const bill = await BillService.save({
        studentId: selectedStudent.id,
        studentName: selectedStudent.name,
        regNo: selectedStudent.regNo,
        mobile: selectedStudent.mobile,
        weight: weightNum,
        clothesCount: parseInt(clothesCount, 10),
        serviceType,
        ratePerKg: rate,
        totalAmount,
      });
      setGeneratedBill(bill);
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
    // Reset form
    setSelectedStudent(null);
    setWeight('');
    setClothesCount('');
    setServiceType('WASH_ONLY');
    setSearchQuery('');
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
          <Text style={styles.headerSubtitle}>Generate a laundry bill for a student</Text>
        </View>

        {/* Student Search Section */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>
            <MaterialCommunityIcons name="account-search" size={16} color={appColors.primary} />
            {'  '}Find Student
          </Text>

          {!selectedStudent ? (
            <View>
              <Searchbar
                placeholder="Search by name, reg no, or mobile..."
                onChangeText={handleSearch}
                value={searchQuery}
                style={styles.searchbar}
                inputStyle={styles.searchInput}
                elevation={0}
              />

              {/* Search Results Dropdown */}
              {showResults && searchResults.length > 0 && (
                <View style={styles.resultsContainer}>
                  {searchResults.slice(0, 5).map((student) => (
                    <TouchableOpacity
                      key={student.id}
                      style={styles.resultItem}
                      onPress={() => selectStudent(student)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.resultAvatar}>
                        <Text style={styles.resultAvatarText}>
                          {student.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.resultInfo}>
                        <Text style={styles.resultName}>{student.name}</Text>
                        <Text style={styles.resultDetail}>
                          {student.regNo} • {student.mobile}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {showResults && searchResults.length === 0 && searchQuery.length > 0 && (
                <View style={styles.noResults}>
                  <MaterialCommunityIcons name="account-question" size={24} color={appColors.textLight} />
                  <Text style={styles.noResultsText}>No students found</Text>
                </View>
              )}
            </View>
          ) : (
            /* Selected Student Card */
            <View style={styles.selectedCard}>
              <View style={styles.selectedAvatar}>
                <Text style={styles.selectedAvatarText}>
                  {selectedStudent.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.selectedInfo}>
                <Text style={styles.selectedName}>{selectedStudent.name}</Text>
                <Text style={styles.selectedDetail}>
                  {selectedStudent.regNo} • {selectedStudent.mobile}
                </Text>
              </View>
              <TouchableOpacity onPress={clearStudent} style={styles.clearBtn}>
                <MaterialCommunityIcons name="close-circle" size={24} color={appColors.textLight} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Bill Details Section */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>
            <MaterialCommunityIcons name="clipboard-text-outline" size={16} color={appColors.primary} />
            {'  '}Laundry Details
          </Text>

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

          {/* Clothes Count */}
          <TextInput
            label="Number of Clothes"
            value={clothesCount}
            onChangeText={(t) => setClothesCount(t.replace(/[^0-9]/g, ''))}
            mode="outlined"
            style={styles.input}
            outlineStyle={styles.inputOutline}
            left={<TextInput.Icon icon="tshirt-crew-outline" />}
            keyboardType="number-pad"
            placeholder="e.g. 12"
          />
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
            <TouchableOpacity
              style={[
                styles.serviceOption,
                serviceType === 'WASH_ONLY' && styles.serviceOptionSelected,
              ]}
              onPress={() => setServiceType('WASH_ONLY')}
              activeOpacity={0.7}
            >
              <View style={styles.serviceOptionLeft}>
                <RadioButton.Android
                  value="WASH_ONLY"
                  color={appColors.primary}
                />
                <View>
                  <Text style={[
                    styles.serviceLabel,
                    serviceType === 'WASH_ONLY' && styles.serviceLabelSelected,
                  ]}>
                    {SERVICE_TYPES.WASH_ONLY.label}
                  </Text>
                  <Text style={styles.serviceRate}>₹{RATES.WASH_ONLY} per kg</Text>
                </View>
              </View>
              <MaterialCommunityIcons
                name="washing-machine"
                size={28}
                color={serviceType === 'WASH_ONLY' ? appColors.primary : appColors.textLight}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.serviceOption,
                serviceType === 'WASH_AND_IRON' && styles.serviceOptionSelected,
              ]}
              onPress={() => setServiceType('WASH_AND_IRON')}
              activeOpacity={0.7}
            >
              <View style={styles.serviceOptionLeft}>
                <RadioButton.Android
                  value="WASH_AND_IRON"
                  color={appColors.secondary}
                />
                <View>
                  <Text style={[
                    styles.serviceLabel,
                    serviceType === 'WASH_AND_IRON' && styles.serviceLabelSelected,
                  ]}>
                    {SERVICE_TYPES.WASH_AND_IRON.label}
                  </Text>
                  <Text style={styles.serviceRate}>₹{RATES.WASH_AND_IRON} per kg</Text>
                </View>
              </View>
              <MaterialCommunityIcons
                name="iron"
                size={28}
                color={serviceType === 'WASH_AND_IRON' ? appColors.secondary : appColors.textLight}
              />
            </TouchableOpacity>
          </RadioButton.Group>
        </View>

        {/* Price Summary */}
        {weightNum > 0 && (
          <View style={styles.priceSummary}>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Weight</Text>
              <Text style={styles.priceValue}>{weightNum} kg</Text>
            </View>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Rate</Text>
              <Text style={styles.priceValue}>₹{rate}/kg</Text>
            </View>
            <View style={styles.priceDivider} />
            <View style={styles.priceRow}>
              <Text style={styles.totalLabel}>Total Amount</Text>
              <Text style={styles.totalValue}>{formatCurrency(totalAmount)}</Text>
            </View>
          </View>
        )}

        {/* Generate Button */}
        <View style={styles.buttonContainer}>
          <Button
            mode="contained"
            onPress={handleGenerateBill}
            loading={loading}
            disabled={loading || !selectedStudent || weightNum <= 0}
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
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  resultAvatarText: {
    fontSize: 15,
    fontWeight: '700',
    color: appColors.primary,
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
  input: {
    marginBottom: 12,
    backgroundColor: appColors.surface,
  },
  inputOutline: {
    borderRadius: 14,
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
  serviceOptionSelected: {
    borderColor: appColors.primaryLight,
    backgroundColor: '#F5F3FF',
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
  serviceLabelSelected: {
    color: appColors.primaryDark,
  },
  serviceRate: {
    fontSize: 12,
    color: appColors.textSecondary,
    marginTop: 2,
  },
  priceSummary: {
    marginHorizontal: 20,
    marginTop: 24,
    backgroundColor: appColors.surface,
    borderRadius: 16,
    padding: 20,
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
