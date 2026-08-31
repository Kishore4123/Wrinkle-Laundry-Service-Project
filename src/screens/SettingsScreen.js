// SettingsScreen â€” Admin pricing editor and app info
// Full CRUD for categories and piece-rate items
import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Image, KeyboardAvoidingView, Platform, TouchableOpacity, Alert } from 'react-native';
import { TextInput, Button, Text, Snackbar, Divider, List, Dialog, Portal, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { SettingsService } from '../services/settingsStorage';
import { appColors, SERVICE_TYPES, DEFAULT_CATEGORIES_PRICING } from '../theme/theme';
import SyncStatusBadge from '../components/SyncStatusBadge';
import PairingModal from '../components/PairingModal';

export default function SettingsScreen() {
  const [categories, setCategories] = useState({});
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '', type: 'success' });

  // For adding a new category
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [pairingVisible, setPairingVisible] = useState(false);

  // Dialog states for category rename
  const [renameCatVisible, setRenameCatVisible] = useState(false);
  const [renameCatValue, setRenameCatValue] = useState('');

  // Dialog states for item operations
  const [editItemDialog, setEditItemDialog] = useState({ visible: false, serviceKey: '', oldName: '', newName: '' });
  const [addItemDialog, setAddItemDialog] = useState({ visible: false, serviceKey: '', name: '', rate: '' });

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

  // â”€â”€â”€ Category CRUD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const handleAddCategory = () => {
    const name = newCategoryName.trim();
    if (!name) return;
    if (categories[name]) {
      setSnackbar({ visible: true, message: 'Category already exists', type: 'error' });
      return;
    }
    
    // Copy defaults from Student or first available
    const newCat = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES_PRICING.Student || categories[Object.keys(categories)[0]]));
    
    const updated = { ...categories, [name]: newCat };
    setCategories(updated);
    setNewCategoryName('');
    setShowAddCategory(false);
    setSelectedCategory(name);
    persistCategories(updated);
  };

  const openRenameCategory = () => {
    if (!selectedCategory) return;
    setRenameCatValue(selectedCategory);
    setRenameCatVisible(true);
  };

  const handleRenameCategory = () => {
    const newName = renameCatValue.trim();
    if (!newName || newName === selectedCategory) {
      setRenameCatVisible(false);
      return;
    }
    if (categories[newName]) {
      setSnackbar({ visible: true, message: 'A category with that name already exists', type: 'error' });
      return;
    }

    const updated = {};
    for (const key of Object.keys(categories)) {
      if (key === selectedCategory) {
        updated[newName] = categories[key];
      } else {
        updated[key] = categories[key];
      }
    }

    setCategories(updated);
    setSelectedCategory(newName);
    setRenameCatVisible(false);
    persistCategories(updated);
    setSnackbar({ visible: true, message: `Renamed to "${newName}"`, type: 'success' });
  };

  const handleDeleteCategory = () => {
    if (!selectedCategory) return;
    const catNames = Object.keys(categories);
    if (catNames.length <= 1) {
      setSnackbar({ visible: true, message: 'Cannot delete the last category', type: 'error' });
      return;
    }

    Alert.alert(
      'Delete Category',
      `Are you sure you want to delete "${selectedCategory}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const updated = { ...categories };
            delete updated[selectedCategory];
            setCategories(updated);
            setSelectedCategory(Object.keys(updated)[0]);
            persistCategories(updated);
            setSnackbar({ visible: true, message: 'Category deleted', type: 'success' });
          },
        },
      ]
    );
  };

  // â”€â”€â”€ Kg Rate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  // â”€â”€â”€ Piece Rate Item CRUD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  const openEditItemDialog = (serviceKey, itemName) => {
    setEditItemDialog({ visible: true, serviceKey, oldName: itemName, newName: itemName });
  };

  const handleEditItemName = () => {
    const { serviceKey, oldName, newName } = editItemDialog;
    const trimmedName = newName.trim();
    if (!trimmedName || trimmedName === oldName) {
      setEditItemDialog({ ...editItemDialog, visible: false });
      return;
    }

    setCategories(prev => {
      const catData = prev[selectedCategory];
      const serviceRates = { ...catData.pieceRates[serviceKey] };
      const rate = serviceRates[oldName];
      delete serviceRates[oldName];
      serviceRates[trimmedName] = rate;
      return {
        ...prev,
        [selectedCategory]: {
          ...catData,
          pieceRates: { ...catData.pieceRates, [serviceKey]: serviceRates }
        }
      };
    });

    setEditItemDialog({ visible: false, serviceKey: '', oldName: '', newName: '' });
    setSnackbar({ visible: true, message: `Renamed "${oldName}" to "${trimmedName}"`, type: 'success' });
  };

  const handleDeleteItem = (serviceKey, itemName) => {
    Alert.alert(
      'Delete Item',
      `Delete "${itemName}" from this service?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setCategories(prev => {
              const catData = prev[selectedCategory];
              const serviceRates = { ...catData.pieceRates[serviceKey] };
              delete serviceRates[itemName];
              return {
                ...prev,
                [selectedCategory]: {
                  ...catData,
                  pieceRates: { ...catData.pieceRates, [serviceKey]: serviceRates }
                }
              };
            });
            setSnackbar({ visible: true, message: `"${itemName}" deleted`, type: 'success' });
          },
        },
      ]
    );
  };

  const openAddItemDialog = (serviceKey) => {
    setAddItemDialog({ visible: true, serviceKey, name: '', rate: '' });
  };

  const handleAddItem = () => {
    const { serviceKey, name, rate } = addItemDialog;
    const trimmedName = name.trim();
    const parsedRate = parseFloat(rate) || 0;

    if (!trimmedName) {
      setSnackbar({ visible: true, message: 'Please enter an item name', type: 'error' });
      return;
    }

    const existingRates = categories[selectedCategory]?.pieceRates?.[serviceKey] || {};
    if (existingRates[trimmedName] !== undefined) {
      setSnackbar({ visible: true, message: 'Item already exists', type: 'error' });
      return;
    }

    setCategories(prev => {
      const catData = prev[selectedCategory];
      const serviceRates = { ...catData.pieceRates[serviceKey], [trimmedName]: parsedRate };
      return {
        ...prev,
        [selectedCategory]: {
          ...catData,
          pieceRates: { ...catData.pieceRates, [serviceKey]: serviceRates }
        }
      };
    });

    setAddItemDialog({ visible: false, serviceKey: '', name: '', rate: '' });
    setSnackbar({ visible: true, message: `"${trimmedName}" added`, type: 'success' });
  };

  // â”€â”€â”€ Persist â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const persistCategories = async (cats) => {
    try {
      const parsed = JSON.parse(JSON.stringify(cats));
      for (const cat of Object.keys(parsed)) {
        const kgRates = parsed[cat].kgRates;
        for (const k of Object.keys(kgRates)) {
          kgRates[k] = parseFloat(kgRates[k]) || 0;
        }
        const pRates = parsed[cat].pieceRates;
        for (const sKey of Object.keys(pRates)) {
          for (const pKey of Object.keys(pRates[sKey])) {
            pRates[sKey][pKey] = parseFloat(pRates[sKey][pKey]) || 0;
          }
        }
      }
      await SettingsService.saveCategories(parsed);
    } catch (error) {
      console.error('Error auto-saving:', error);
    }
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
        message: 'Settings updated successfully! âœ“',
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

  // â”€â”€â”€ Render a piece-rates accordion â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const renderPieceAccordion = (serviceKey, title, icon, accordionId) => {
    const items = currentCatData?.pieceRates?.[serviceKey] || {};
    return (
      <List.Accordion title={title} id={accordionId} left={props => <List.Icon {...props} icon={icon} />}>
        {Object.keys(items).map(piece => (
          <View key={piece} style={styles.rateRow}>
            <Text style={styles.rateLabel} numberOfLines={1}>{piece}</Text>
            <TextInput
              value={String(items[piece])}
              onChangeText={(t) => updatePieceRate(serviceKey, piece, t.replace(/[^0-9.]/g, ''))}
              mode="outlined"
              dense
              keyboardType="decimal-pad"
              style={styles.rateInput}
              left={<TextInput.Affix text="â‚¹" />}
            />
            <IconButton
              icon="pencil-outline"
              size={18}
              iconColor={appColors.primary}
              style={styles.itemActionBtn}
              onPress={() => openEditItemDialog(serviceKey, piece)}
            />
            <IconButton
              icon="trash-can-outline"
              size={18}
              iconColor={appColors.error}
              style={styles.itemActionBtn}
              onPress={() => handleDeleteItem(serviceKey, piece)}
            />
          </View>
        ))}
        <TouchableOpacity style={styles.addItemRow} onPress={() => openAddItemDialog(serviceKey)}>
          <MaterialCommunityIcons name="plus-circle-outline" size={20} color={appColors.primary} />
          <Text style={styles.addItemText}>Add New Item</Text>
        </TouchableOpacity>
      </List.Accordion>
    );
  };

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
          </ScrollView>

          {/* Category Edit/Delete actions */}
          {selectedCategory && (
            <View style={styles.categoryActions}>
              <TouchableOpacity style={styles.categoryActionBtn} onPress={openRenameCategory}>
                <MaterialCommunityIcons name="pencil-outline" size={18} color={appColors.primary} />
                <Text style={styles.categoryActionText}>Rename</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.categoryActionBtn} onPress={handleDeleteCategory}>
                <MaterialCommunityIcons name="trash-can-outline" size={18} color={appColors.error} />
                <Text style={[styles.categoryActionText, { color: appColors.error }]}>Delete</Text>
              </TouchableOpacity>
            </View>
          )}

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
                      left={<TextInput.Affix text="â‚¹" />}
                    />
                  </View>
                ))}
              </List.Accordion>

              {renderPieceAccordion('WASH_ONLY', 'Washing Only (Piece Rates)', 'washing-machine', '2')}
              {renderPieceAccordion('WASH_AND_IRON', 'Wash & Iron (Piece Rates)', 'tshirt-crew', '3')}
              {renderPieceAccordion('IRON_STEAM', 'Steam Ironing (Piece Rates)', 'weather-fog', '4')}
            </List.AccordionGroup>

            <Button mode="contained" onPress={handleSave} loading={loading} disabled={loading} style={styles.saveBtn} icon="content-save">
              Save Prices
            </Button>
          </View>
        )}

      </ScrollView>

      {/* â”€â”€â”€ Dialogs â”€â”€â”€ */}
      <Portal>
        {/* Rename Category Dialog */}
        <Dialog visible={renameCatVisible} onDismiss={() => setRenameCatVisible(false)}>
          <Dialog.Title>Rename Category</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Category Name"
              value={renameCatValue}
              onChangeText={setRenameCatValue}
              mode="outlined"
              dense
              style={{ backgroundColor: appColors.surface }}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setRenameCatVisible(false)}>Cancel</Button>
            <Button onPress={handleRenameCategory}>Rename</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Edit Item Name Dialog */}
        <Dialog visible={editItemDialog.visible} onDismiss={() => setEditItemDialog({ ...editItemDialog, visible: false })}>
          <Dialog.Title>Rename Item</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Item Name"
              value={editItemDialog.newName}
              onChangeText={(t) => setEditItemDialog({ ...editItemDialog, newName: t })}
              mode="outlined"
              dense
              style={{ backgroundColor: appColors.surface }}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEditItemDialog({ ...editItemDialog, visible: false })}>Cancel</Button>
            <Button onPress={handleEditItemName}>Save</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Add Item Dialog */}
        <Dialog visible={addItemDialog.visible} onDismiss={() => setAddItemDialog({ ...addItemDialog, visible: false })}>
          <Dialog.Title>Add New Item</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Item Name"
              value={addItemDialog.name}
              onChangeText={(t) => setAddItemDialog({ ...addItemDialog, name: t })}
              mode="outlined"
              dense
              style={{ backgroundColor: appColors.surface, marginBottom: 12 }}
            />
            <TextInput
              label="Rate (â‚¹)"
              value={addItemDialog.rate}
              onChangeText={(t) => setAddItemDialog({ ...addItemDialog, rate: t.replace(/[^0-9.]/g, '') })}
              mode="outlined"
              dense
              keyboardType="decimal-pad"
              style={{ backgroundColor: appColors.surface }}
              left={<TextInput.Affix text="â‚¹" />}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setAddItemDialog({ ...addItemDialog, visible: false })}>Cancel</Button>
            <Button onPress={handleAddItem}>Add</Button>
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
  section: { paddingHorizontal: 20, marginTop: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: appColors.text, marginBottom: 12 },
  categoryScroll: { flexDirection: 'row', marginBottom: 4 },
  categoryPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: appColors.surface, marginRight: 8, borderWidth: 1, borderColor: appColors.border },
  categoryPillActive: { backgroundColor: appColors.primary, borderColor: appColors.primary },
  categoryPillText: { color: appColors.text, fontWeight: '600' },
  categoryPillTextActive: { color: '#fff' },
  categoryPillAdd: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: appColors.surfaceVariant, justifyContent: 'center', alignItems: 'center' },
  categoryActions: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
    marginBottom: 4,
  },
  categoryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: appColors.surfaceVariant,
  },
  categoryActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: appColors.primary,
  },
  addCategoryContainer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  addCategoryInput: { flex: 1, backgroundColor: appColors.surface },
  addCategoryBtn: { borderRadius: 8 },
  rateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: appColors.surfaceVariant,
  },
  rateLabel: { flex: 1, fontSize: 13, color: appColors.text, marginRight: 4 },
  rateInput: { width: 90, backgroundColor: appColors.surface },
  itemActionBtn: { margin: 0, padding: 0 },
  addItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: appColors.surfaceVariant,
  },
  addItemText: {
    fontSize: 14,
    fontWeight: '600',
    color: appColors.primary,
  },
  saveBtn: { marginTop: 20, borderRadius: 12, paddingVertical: 6 },
});
