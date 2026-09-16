// SettingsScreen — Admin pricing editor and app info
import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Image, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native';
import { TextInput, Button, Text, Snackbar, Divider, List } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { SettingsService } from '../services/settingsStorage';
import { appColors, SERVICE_TYPES, DEFAULT_CATEGORIES_PRICING } from '../theme/theme';
import SyncStatusBadge from '../components/SyncStatusBadge';

export default function SettingsScreen() {
  const [categories, setCategories] = useState({});
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '', type: 'success' });

  // For adding a new category
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showAddCategory, setShowAddCategory] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadSettings();
    }, [])
  );

  const loadSettings = async () => {
    const cats = await SettingsService.getCategories();
    setCategories(cats);
    if (!selectedCategory && Object.keys(cats).length > 0) {
      setSelectedCategory(Object.keys(cats)[0]);
    }
  };

  const handleAddCategory = () => {
    const name = newCategoryName.trim();
    if (!name) return;
    if (categories[name]) {
      setSnackbar({ visible: true, message: 'Category already exists', type: 'error' });
      return;
    }
    
    // Copy defaults from Student or first available
    const newCat = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES_PRICING.Student || categories[Object.keys(categories)[0]]));
    
    setCategories({
      ...categories,
      [name]: newCat
    });
    setNewCategoryName('');
    setShowAddCategory(false);
    setSelectedCategory(name);
  };

  const updateKgRate = (serviceKey, value) => {
    setCategories(prev => ({
      ...prev,
      [selectedCategory]: {
        ...prev[selectedCategory],
        kgRates: {
          ...prev[selectedCategory].kgRates,
          [serviceKey]: value
        }
      }
    }));
  };

  const updatePieceRate = (serviceKey, pieceKey, value) => {
    setCategories(prev => ({
      ...prev,
      [selectedCategory]: {
        ...prev[selectedCategory],
        pieceRates: {
          ...prev[selectedCategory].pieceRates,
          [serviceKey]: {
            ...prev[selectedCategory].pieceRates[serviceKey],
            [pieceKey]: value
          }
        }
      }
    }));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      // Convert string values to numbers
      const parsedCategories = JSON.parse(JSON.stringify(categories));
      for (const cat of Object.keys(parsedCategories)) {
        const kgRates = parsedCategories[cat].kgRates;
        for (const k of Object.keys(kgRates)) {
           kgRates[k] = parseFloat(kgRates[k]) || 0;
        }
        const pRates = parsedCategories[cat].pieceRates;
        for (const sKey of Object.keys(pRates)) {
           for (const pKey of Object.keys(pRates[sKey])) {
             pRates[sKey][pKey] = parseFloat(pRates[sKey][pKey]) || 0;
           }
        }
      }

      await SettingsService.saveCategories(parsedCategories);
      setCategories(parsedCategories);
      setSnackbar({
        visible: true,
        message: 'Settings updated successfully! ✓',
        type: 'success',
      });
    } catch (error) {
      setSnackbar({
        visible: true,
        message: 'Failed to save. Please try again.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const categoryNames = Object.keys(categories);
  const currentCatData = categories[selectedCategory];

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.headerSection}>
          <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
          <Text style={styles.headerTitle}>Settings</Text>
          <Text style={styles.headerSubtitle}>Manage your pricing & categories</Text>
        </View>

        {/* Category Selector */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Customer Categories</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
            {categoryNames.map(cat => (
              <TouchableOpacity
                key={cat}
                style={[styles.categoryPill, selectedCategory === cat && styles.categoryPillActive]}
                onPress={() => setSelectedCategory(cat)}
              >
                <Text style={[styles.categoryPillText, selectedCategory === cat && styles.categoryPillTextActive]}>{cat}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.categoryPillAdd} onPress={() => setShowAddCategory(!showAddCategory)}>
              <MaterialCommunityIcons name={showAddCategory ? "minus" : "plus"} size={20} color={appColors.primary} />
            </TouchableOpacity>
            {/* Desktop Sync */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Desktop Sync</Text>
          <SyncStatusBadge />
        </View>
      </ScrollView>

          {showAddCategory && (
            <View style={styles.addCategoryContainer}>
              <TextInput
                label="New Category Name"
                value={newCategoryName}
                onChangeText={setNewCategoryName}
                mode="outlined"
                dense
                style={styles.addCategoryInput}
              />
              <Button mode="contained" onPress={handleAddCategory} style={styles.addCategoryBtn}>Add</Button>
            </View>
          )}
        </View>

        {/* Pricing Editor for Selected Category */}
        {currentCatData && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pricing for {selectedCategory}</Text>
            
            <List.AccordionGroup>
              <List.Accordion title="Kg Rates (Wash Only & Wash & Iron)" id="1" left={props => <List.Icon {...props} icon="scale" />}>
                {['WASH_ONLY', 'WASH_AND_IRON'].map(key => (
                  <View key={key} style={styles.rateRow}>
                    <Text style={styles.rateLabel}>{SERVICE_TYPES[key]?.label || key}</Text>
                    <TextInput
                      value={String(currentCatData.kgRates?.[key] || '')}
                      onChangeText={(t) => updateKgRate(key, t.replace(/[^0-9.]/g, ''))}
                      mode="outlined"
                      dense
                      keyboardType="decimal-pad"
                      style={styles.rateInput}
                      left={<TextInput.Affix text="₹" />}
                    />
                  </View>
                ))}
              </List.Accordion>

              <List.Accordion title="Wash & Iron (Piece Rates)" id="2" left={props => <List.Icon {...props} icon="tshirt-crew" />}>
                {Object.keys(currentCatData.pieceRates?.WASH_AND_IRON || {}).map(piece => (
                  <View key={piece} style={styles.rateRow}>
                    <Text style={styles.rateLabel}>{piece}</Text>
                    <TextInput
                      value={String(currentCatData.pieceRates.WASH_AND_IRON[piece])}
                      onChangeText={(t) => updatePieceRate('WASH_AND_IRON', piece, t.replace(/[^0-9.]/g, ''))}
                      mode="outlined"
                      dense
                      keyboardType="decimal-pad"
                      style={styles.rateInput}
                      left={<TextInput.Affix text="₹" />}
                    />
                  </View>
                ))}
              </List.Accordion>

              <List.Accordion title="Steam Ironing (Piece Rates)" id="3" left={props => <List.Icon {...props} icon="weather-fog" />}>
                {Object.keys(currentCatData.pieceRates?.IRON_STEAM || {}).map(piece => (
                  <View key={piece} style={styles.rateRow}>
                    <Text style={styles.rateLabel}>{piece}</Text>
                    <TextInput
                      value={String(currentCatData.pieceRates.IRON_STEAM[piece])}
                      onChangeText={(t) => updatePieceRate('IRON_STEAM', piece, t.replace(/[^0-9.]/g, ''))}
                      mode="outlined"
                      dense
                      keyboardType="decimal-pad"
                      style={styles.rateInput}
                      left={<TextInput.Affix text="₹" />}
                    />
                  </View>
                ))}
              </List.Accordion>
            </List.AccordionGroup>

            <Button mode="contained" onPress={handleSave} loading={loading} disabled={loading} style={styles.saveBtn} icon="content-save">
              Save Prices
            </Button>
          </View>
        )}

        {/* Desktop Sync */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Desktop Sync</Text>
          <SyncStatusBadge />
        </View>
      </ScrollView>


      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ ...snackbar, visible: false })}
        duration={3000}
        style={{ backgroundColor: snackbar.type === 'success' ? appColors.success : appColors.error }}
      >
        {snackbar.message}
      </Snackbar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: appColors.background },
  scrollContent: { paddingBottom: 40 },
  headerSection: { alignItems: 'center', paddingTop: 24, paddingBottom: 16 },
  logo: { width: 80, height: 80, borderRadius: 16, marginBottom: 12 },
  headerTitle: { fontSize: 24, fontWeight: '800', color: appColors.text },
  headerSubtitle: { fontSize: 13, color: appColors.textSecondary },
  section: { paddingHorizontal: 20, marginTop: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: appColors.text, marginBottom: 12 },
  categoryScroll: { flexDirection: 'row', marginBottom: 10 },
  categoryPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: appColors.surface, marginRight: 8, borderWidth: 1, borderColor: appColors.border },
  categoryPillActive: { backgroundColor: appColors.primary, borderColor: appColors.primary },
  categoryPillText: { color: appColors.text, fontWeight: '600' },
  categoryPillTextActive: { color: '#fff' },
  categoryPillAdd: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: appColors.surfaceVariant, justifyContent: 'center', alignItems: 'center' },
  addCategoryContainer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  addCategoryInput: { flex: 1, backgroundColor: appColors.surface },
  addCategoryBtn: { borderRadius: 8 },
  rateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: appColors.surfaceVariant },
  rateLabel: { flex: 1, fontSize: 14, color: appColors.text },
  rateInput: { width: 100, backgroundColor: appColors.surface },
  saveBtn: { marginTop: 20, borderRadius: 12, paddingVertical: 6 },
});
