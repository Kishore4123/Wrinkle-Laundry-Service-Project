// SettingsScreen — Admin pricing editor and app info
import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Image, KeyboardAvoidingView, Platform, TouchableOpacity, Alert } from 'react-native';
import { TextInput, Button, Text, Snackbar, List, Portal, Dialog } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import {
  SettingsService,
  addItemEverywhere,
  renameItemEverywhere,
  removeItemEverywhere,
} from '../services/settingsStorage';
import { savePricing } from '../services/SharedDataService';
import { useSync } from '../services/SyncContext';
import { appColors, SERVICE_TYPES, DEFAULT_CATEGORIES_PRICING } from '../theme/theme';
import SyncStatusBadge from '../components/SyncStatusBadge';

// Services that are charged per piece. Wash-only is included because the shared
// config carries piece rates for it even though the old UI never showed them.
const PIECE_SERVICES = ['WASH_ONLY', 'WASH_AND_IRON', 'IRON_STEAM'];
const KG_SERVICES = ['WASH_ONLY', 'WASH_AND_IRON'];

export default function SettingsScreen() {
  const { canCustomize, deviceName, pricingVersion } = useSync();

  const [categories, setCategories] = useState({});
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '', type: 'success' });

  const [newCategoryName, setNewCategoryName] = useState('');
  const [showAddCategory, setShowAddCategory] = useState(false);

  // Add-item row state, keyed by service so each accordion has its own draft.
  const [newItem, setNewItem] = useState({ service: null, name: '', price: '' });

  // Rename dialog
  const [renaming, setRenaming] = useState(null); // { service, oldName, value }

  useFocusEffect(
    useCallback(() => {
      loadSettings();
    }, [])
  );

  // Re-read the cache whenever the shared config changes on another device.
  useEffect(() => {
    if (pricingVersion > 0) loadSettings();
  }, [pricingVersion]);

  const loadSettings = async () => {
    const cats = await SettingsService.getCategories();
    setCategories(cats);
    setSelectedCategory((prev) => (prev && cats[prev] ? prev : Object.keys(cats)[0] || null));
  };

  const notify = (message, type = 'success') => setSnackbar({ visible: true, message, type });

  const blockIfReadOnly = () => {
    if (canCustomize) return false;
    notify('This device is not allowed to edit pricing.', 'error');
    return true;
  };

  // ── Categories ───────────────────────────────────────────────────────────

  const handleAddCategory = () => {
    if (blockIfReadOnly()) return;
    const name = newCategoryName.trim();
    if (!name) return;
    if (categories[name]) {
      notify('Category already exists', 'error');
      return;
    }
    const template = DEFAULT_CATEGORIES_PRICING.Student || categories[Object.keys(categories)[0]];
    setCategories({ ...categories, [name]: JSON.parse(JSON.stringify(template)) });
    setNewCategoryName('');
    setShowAddCategory(false);
    setSelectedCategory(name);
  };

  const handleDeleteCategory = (name) => {
    if (blockIfReadOnly()) return;
    if (Object.keys(categories).length <= 1) {
      notify('At least one category is required.', 'error');
      return;
    }
    Alert.alert('Delete Category', `Remove "${name}" and its prices?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          const next = { ...categories };
          delete next[name];
          setCategories(next);
          setSelectedCategory(Object.keys(next)[0]);
        },
      },
    ]);
  };

  // ── Rates ────────────────────────────────────────────────────────────────

  const updateKgRate = (serviceKey, value) => {
    setCategories((prev) => ({
      ...prev,
      [selectedCategory]: {
        ...prev[selectedCategory],
        kgRates: { ...prev[selectedCategory].kgRates, [serviceKey]: value },
      },
    }));
  };

  const updatePieceRate = (serviceKey, pieceKey, value) => {
    setCategories((prev) => ({
      ...prev,
      [selectedCategory]: {
        ...prev[selectedCategory],
        pieceRates: {
          ...prev[selectedCategory].pieceRates,
          [serviceKey]: { ...prev[selectedCategory].pieceRates[serviceKey], [pieceKey]: value },
        },
      },
    }));
  };

  // ── Item catalog (names are shared across every category) ────────────────

  const handleAddItem = (serviceKey) => {
    if (blockIfReadOnly()) return;
    const name = newItem.name.trim();
    if (!name) {
      notify('Enter an item name.', 'error');
      return;
    }
    if (categories[selectedCategory]?.pieceRates?.[serviceKey]?.[name] !== undefined) {
      notify('That item already exists.', 'error');
      return;
    }
    setCategories(addItemEverywhere(categories, serviceKey, name, newItem.price));
    setNewItem({ service: null, name: '', price: '' });
    notify(`"${name}" added to every category.`);
  };

  const handleRenameItem = () => {
    if (!renaming) return;
    const newName = renaming.value.trim();
    if (!newName || newName === renaming.oldName) {
      setRenaming(null);
      return;
    }
    if (categories[selectedCategory]?.pieceRates?.[renaming.service]?.[newName] !== undefined) {
      notify('Another item already uses that name.', 'error');
      return;
    }
    setCategories(renameItemEverywhere(categories, renaming.service, renaming.oldName, newName));
    setRenaming(null);
    notify('Item renamed in every category.');
  };

  const handleDeleteItem = (serviceKey, itemName) => {
    if (blockIfReadOnly()) return;
    Alert.alert('Delete Item', `Remove "${itemName}" from every category?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => setCategories(removeItemEverywhere(categories, serviceKey, itemName)),
      },
    ]);
  };

  // ── Save ─────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (blockIfReadOnly()) return;
    setLoading(true);
    try {
      const parsed = JSON.parse(JSON.stringify(categories));
      for (const cat of Object.keys(parsed)) {
        const kgRates = parsed[cat].kgRates || {};
        for (const k of Object.keys(kgRates)) kgRates[k] = parseFloat(kgRates[k]) || 0;
        const pRates = parsed[cat].pieceRates || {};
        for (const sKey of Object.keys(pRates)) {
          for (const pKey of Object.keys(pRates[sKey])) {
            pRates[sKey][pKey] = parseFloat(pRates[sKey][pKey]) || 0;
          }
        }
      }
      await savePricing(parsed);
      setCategories(parsed);
      notify('Pricing updated on every device ✓');
    } catch (error) {
      notify('Failed to save. Check your connection.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const categoryNames = Object.keys(categories);
  const currentCatData = categories[selectedCategory];

  const renderPieceSection = (serviceKey, accordionId) => {
    const rates = currentCatData?.pieceRates?.[serviceKey] || {};
    const isAdding = newItem.service === serviceKey;
    return (
      <List.Accordion
        title={`${SERVICE_TYPES[serviceKey]?.label || serviceKey} (Per Piece)`}
        id={accordionId}
        key={serviceKey}
        left={(props) => <List.Icon {...props} icon={SERVICE_TYPES[serviceKey]?.icon || 'tshirt-crew'} />}
      >
        {Object.keys(rates).map((piece) => (
          <View key={piece} style={styles.rateRow}>
            <Text style={styles.rateLabel} numberOfLines={2}>{piece}</Text>
            <TextInput
              value={String(rates[piece])}
              onChangeText={(t) => updatePieceRate(serviceKey, piece, t.replace(/[^0-9.]/g, ''))}
              mode="outlined"
              dense
              editable={canCustomize}
              keyboardType="decimal-pad"
              style={styles.rateInput}
              left={<TextInput.Affix text="₹" />}
            />
            {canCustomize && (
              <View style={styles.itemActions}>
                <TouchableOpacity
                  onPress={() => setRenaming({ service: serviceKey, oldName: piece, value: piece })}
                  hitSlop={8}
                >
                  <MaterialCommunityIcons name="pencil-outline" size={20} color={appColors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeleteItem(serviceKey, piece)} hitSlop={8}>
                  <MaterialCommunityIcons name="trash-can-outline" size={20} color={appColors.error} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))}

        {canCustomize && (
          isAdding ? (
            <View style={styles.addItemRow}>
              <TextInput
                label="Item name"
                value={newItem.name}
                onChangeText={(t) => setNewItem((p) => ({ ...p, name: t }))}
                mode="outlined"
                dense
                style={styles.addItemName}
              />
              <TextInput
                label="₹"
                value={newItem.price}
                onChangeText={(t) => setNewItem((p) => ({ ...p, price: t.replace(/[^0-9.]/g, '') }))}
                mode="outlined"
                dense
                keyboardType="decimal-pad"
                style={styles.addItemPrice}
              />
              <TouchableOpacity onPress={() => handleAddItem(serviceKey)} hitSlop={8}>
                <MaterialCommunityIcons name="check-circle" size={28} color={appColors.success} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setNewItem({ service: null, name: '', price: '' })} hitSlop={8}>
                <MaterialCommunityIcons name="close-circle" size={28} color={appColors.textLight} />
              </TouchableOpacity>
            </View>
          ) : (
            <Button
              mode="text"
              icon="plus"
              onPress={() => setNewItem({ service: serviceKey, name: '', price: '' })}
              style={styles.addItemBtn}
            >
              Add item
            </Button>
          )
        )}
      </List.Accordion>
    );
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.headerSection}>
          <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
          <Text style={styles.headerTitle}>Settings</Text>
          <Text style={styles.headerSubtitle}>
            {canCustomize ? 'Manage your pricing & categories' : 'Pricing is view-only on this device'}
          </Text>
        </View>

        {!canCustomize && (
          <View style={styles.lockBanner}>
            <MaterialCommunityIcons name="lock-outline" size={20} color={appColors.tertiary} />
            <Text style={styles.lockText}>
              {deviceName ? `"${deviceName}" ` : 'This device '}
              cannot edit pricing. Enable it from the Command Center's Device Control tab.
            </Text>
          </View>
        )}

        {/* Cloud Sync */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cloud Sync</Text>
          <SyncStatusBadge />
        </View>

        {/* Category Selector */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Customer Categories</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
            {categoryNames.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[styles.categoryPill, selectedCategory === cat && styles.categoryPillActive]}
                onPress={() => setSelectedCategory(cat)}
                onLongPress={() => handleDeleteCategory(cat)}
              >
                <Text style={[styles.categoryPillText, selectedCategory === cat && styles.categoryPillTextActive]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
            {canCustomize && (
              <TouchableOpacity style={styles.categoryPillAdd} onPress={() => setShowAddCategory(!showAddCategory)}>
                <MaterialCommunityIcons name={showAddCategory ? 'minus' : 'plus'} size={20} color={appColors.primary} />
              </TouchableOpacity>
            )}
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
          {canCustomize && categoryNames.length > 1 && (
            <Text style={styles.hint}>Long-press a category to delete it.</Text>
          )}
        </View>

        {/* Pricing Editor */}
        {currentCatData && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pricing for {selectedCategory}</Text>

            <List.AccordionGroup>
              <List.Accordion title="Per Kg Rates" id="kg" left={(props) => <List.Icon {...props} icon="scale" />}>
                {KG_SERVICES.map((key) => (
                  <View key={key} style={styles.rateRow}>
                    <Text style={styles.rateLabel}>{SERVICE_TYPES[key]?.label || key}</Text>
                    <TextInput
                      value={String(currentCatData.kgRates?.[key] || '')}
                      onChangeText={(t) => updateKgRate(key, t.replace(/[^0-9.]/g, ''))}
                      mode="outlined"
                      dense
                      editable={canCustomize}
                      keyboardType="decimal-pad"
                      style={styles.rateInput}
                      left={<TextInput.Affix text="₹" />}
                    />
                  </View>
                ))}
              </List.Accordion>

              {PIECE_SERVICES.map((key, i) => renderPieceSection(key, `piece-${i}`))}
            </List.AccordionGroup>

            {canCustomize && (
              <Button
                mode="contained"
                onPress={handleSave}
                loading={loading}
                disabled={loading}
                style={styles.saveBtn}
                icon="content-save"
              >
                Save Prices
              </Button>
            )}
          </View>
        )}
      </ScrollView>

      <Portal>
        <Dialog visible={!!renaming} onDismiss={() => setRenaming(null)}>
          <Dialog.Title>Rename Item</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.dialogHint}>
              The name changes in every customer category. Prices are not affected.
            </Text>
            <TextInput
              value={renaming?.value || ''}
              onChangeText={(t) => setRenaming((p) => ({ ...p, value: t }))}
              mode="outlined"
              autoFocus
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setRenaming(null)}>Cancel</Button>
            <Button onPress={handleRenameItem}>Rename</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

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
  lockBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 20, marginTop: 8, padding: 12,
    backgroundColor: appColors.tertiaryLight, borderRadius: 12,
  },
  lockText: { flex: 1, fontSize: 12, color: appColors.text, lineHeight: 17 },
  section: { paddingHorizontal: 20, marginTop: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: appColors.text, marginBottom: 12 },
  hint: { fontSize: 11, color: appColors.textLight, marginTop: 6 },
  categoryScroll: { flexDirection: 'row', marginBottom: 10 },
  categoryPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: appColors.surface, marginRight: 8, borderWidth: 1, borderColor: appColors.border },
  categoryPillActive: { backgroundColor: appColors.primary, borderColor: appColors.primary },
  categoryPillText: { color: appColors.text, fontWeight: '600' },
  categoryPillTextActive: { color: '#fff' },
  categoryPillAdd: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: appColors.surfaceVariant, justifyContent: 'center', alignItems: 'center' },
  addCategoryContainer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  addCategoryInput: { flex: 1, backgroundColor: appColors.surface },
  addCategoryBtn: { borderRadius: 8 },
  rateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: appColors.surfaceVariant, gap: 8 },
  rateLabel: { flex: 1, fontSize: 14, color: appColors.text },
  rateInput: { width: 96, backgroundColor: appColors.surface },
  itemActions: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  addItemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 10 },
  addItemName: { flex: 1, backgroundColor: appColors.surface },
  addItemPrice: { width: 80, backgroundColor: appColors.surface },
  addItemBtn: { alignSelf: 'flex-start', marginVertical: 4 },
  dialogHint: { fontSize: 12, color: appColors.textSecondary, marginBottom: 12 },
  saveBtn: { marginTop: 20, borderRadius: 12, paddingVertical: 6 },
});
