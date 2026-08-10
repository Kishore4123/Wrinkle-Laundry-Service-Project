import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native';
import { TextInput, Button, Text, HelperText, Snackbar } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CustomerService } from '../services/storage';
import { SettingsService } from '../services/settingsStorage';
import { isValidMobile } from '../utils/helpers';
import { appColors } from '../theme/theme';

export default function AddCustomerScreen({ navigation }) {
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [category, setCategory] = useState('Student');
  const [availableCategories, setAvailableCategories] = useState(['Student', 'Public']);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });

  useEffect(() => {
    const fetchCategories = async () => {
      const cats = await SettingsService.getCategories();
      const keys = Object.keys(cats);
      if (keys.length > 0) {
        setAvailableCategories(keys);
        if (!keys.includes(category)) {
          setCategory(keys[0]);
        }
      }
    };
    fetchCategories();
  }, []);

  const validate = () => {
    const newErrors = {};

    if (!name.trim() || name.trim().length < 2) {
      newErrors.name = 'Name must be at least 2 characters';
    }

    if (!mobile.trim()) {
      newErrors.mobile = 'Mobile number is required';
    } else if (!isValidMobile(mobile.trim())) {
      newErrors.mobile = 'Enter a valid 10-digit mobile number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setLoading(true);
    try {
      await CustomerService.add({
        name: name.trim(),
        mobile: mobile.trim(),
        category,
      });
      // Reset and go back
      setName('');
      setMobile('');
      setErrors({});
      navigation.goBack();
    } catch (error) {
      setSnackbar({ visible: true, message: error.message });
    } finally {
      setLoading(false);
    }
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
        {/* Header Illustration */}
        <View style={styles.illustration}>
          <View style={styles.iconCircle}>
            <MaterialCommunityIcons name="account-plus" size={44} color={appColors.primary} />
          </View>
          <Text style={styles.title}>New Customer</Text>
          <Text style={styles.subtitle}>Add a customer to start generating bills</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {/* Category Selector */}
          <Text style={styles.fieldLabel}>
            <MaterialCommunityIcons name="tag-outline" size={14} color={appColors.primary} />
            {'  '}Customer Type
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
            {availableCategories.map((type) => {
              const isActive = category === type;
              const isStudent = type.toLowerCase() === 'student';
              return (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.categoryOption,
                    isActive && (isStudent ? styles.categoryActiveStudent : styles.categoryActivePublic),
                  ]}
                  onPress={() => setCategory(type)}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons
                    name={isStudent ? 'school-outline' : 'account-outline'}
                    size={20}
                    color={
                      isActive
                        ? isStudent ? appColors.primary : appColors.secondary
                        : appColors.textLight
                    }
                  />
                  <Text
                    style={[
                      styles.categoryText,
                      isActive && (isStudent ? styles.categoryTextActiveStudent : styles.categoryTextActivePublic),
                    ]}
                  >
                    {type}
                  </Text>
                  {isActive && (
                    <MaterialCommunityIcons
                      name="check-circle"
                      size={18}
                      color={isStudent ? appColors.primary : appColors.secondary}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Name */}
          <TextInput
            label="Full Name"
            value={name}
            onChangeText={(t) => { setName(t); if (errors.name) setErrors({ ...errors, name: null }); }}
            mode="outlined"
            style={styles.input}
            outlineStyle={styles.inputOutline}
            left={<TextInput.Icon icon="account-outline" />}
            error={!!errors.name}
            autoCapitalize="words"
          />
          {errors.name && (
            <HelperText type="error" visible style={styles.helper}>
              {errors.name}
            </HelperText>
          )}

          {/* Mobile */}
          <TextInput
            label="Mobile Number"
            value={mobile}
            onChangeText={(t) => { setMobile(t.replace(/[^0-9]/g, '').slice(0, 10)); if (errors.mobile) setErrors({ ...errors, mobile: null }); }}
            mode="outlined"
            style={styles.input}
            outlineStyle={styles.inputOutline}
            left={<TextInput.Icon icon="phone-outline" />}
            error={!!errors.mobile}
            keyboardType="phone-pad"
            maxLength={10}
          />
          {errors.mobile && (
            <HelperText type="error" visible style={styles.helper}>
              {errors.mobile}
            </HelperText>
          )}

          {/* Submit */}
          <Button
            mode="contained"
            onPress={handleSubmit}
            loading={loading}
            disabled={loading}
            style={styles.submitBtn}
            contentStyle={styles.submitContent}
            labelStyle={styles.submitLabel}
          >
            Add Customer
          </Button>
        </View>
      </ScrollView>

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ visible: false, message: '' })}
        duration={3000}
        style={styles.snackbar}
        action={{ label: 'OK', onPress: () => {} }}
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
  illustration: {
    alignItems: 'center',
    paddingTop: 32,
    paddingBottom: 24,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: appColors.text,
  },
  subtitle: {
    fontSize: 14,
    color: appColors.textSecondary,
    marginTop: 6,
  },
  form: {
    paddingHorizontal: 20,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: appColors.text,
    marginBottom: 10,
  },
  categoryScroll: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  categoryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginRight: 10,
    backgroundColor: appColors.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: appColors.border,
  },
  categoryActiveStudent: {
    borderColor: appColors.primaryLight,
    backgroundColor: '#EEF2FF',
  },
  categoryActivePublic: {
    borderColor: appColors.secondaryLight,
    backgroundColor: '#CCFBF1',
  },
  categoryText: {
    fontSize: 15,
    fontWeight: '600',
    color: appColors.textLight,
  },
  categoryTextActiveStudent: {
    color: appColors.primaryDark,
  },
  categoryTextActivePublic: {
    color: '#134E4A',
  },
  input: {
    marginBottom: 4,
    backgroundColor: appColors.surface,
  },
  inputOutline: {
    borderRadius: 14,
  },
  helper: {
    marginBottom: 4,
    marginTop: -2,
  },
  submitBtn: {
    marginTop: 20,
    borderRadius: 14,
    elevation: 4,
    shadowColor: appColors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  submitContent: {
    height: 54,
  },
  submitLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  snackbar: {
    backgroundColor: appColors.error,
  },
});
