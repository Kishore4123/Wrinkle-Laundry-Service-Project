// CustomerCard — Displays a customer's info with category badge and delete action
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { appColors } from '../theme/theme';

export default function CustomerCard({ customer, onDelete }) {
  const isStudent = (customer.category || 'Student') === 'Student';

  return (
    <View style={styles.card}>
      <View style={styles.mainRow}>
        <View style={[styles.avatar, isStudent ? styles.avatarStudent : styles.avatarPublic]}>
          <Text style={[styles.avatarText, isStudent ? styles.avatarTextStudent : styles.avatarTextPublic]}>
            {customer.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>{customer.name}</Text>
            <View style={[styles.categoryBadge, isStudent ? styles.badgeStudent : styles.badgePublic]}>
              <MaterialCommunityIcons
                name={isStudent ? 'school-outline' : 'account-outline'}
                size={11}
                color={isStudent ? appColors.primary : appColors.secondary}
              />
              <Text style={[styles.badgeText, isStudent ? styles.badgeTextStudent : styles.badgeTextPublic]}>
                {customer.category || 'Student'}
              </Text>
            </View>
          </View>
          <View style={styles.detailRow}>
            <MaterialCommunityIcons name="phone-outline" size={14} color={appColors.textSecondary} />
            <Text style={styles.detail}>{customer.mobile}</Text>
          </View>
        </View>
        {onDelete && (
          <IconButton
            icon="delete-outline"
            iconColor={appColors.error}
            size={22}
            onPress={() => onDelete(customer)}
            style={styles.deleteBtn}
          />
        )}
      </View>
      <View style={styles.statsRow}>
        <View style={styles.statChip}>
          <Text style={styles.statChipText}>Total: {customer.totalWeight || 0} kg</Text>
        </View>
        <View style={[styles.statChip, { backgroundColor: '#CCFBF1' }]}>
          <Text style={[styles.statChipText, { color: appColors.secondary }]}>Paid: ₹{customer.totalAmountPaid || 0}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'column',
    alignItems: 'center',
    backgroundColor: appColors.surface,
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 10,
    elevation: 2,
    shadowColor: appColors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarStudent: {
    backgroundColor: '#EEF2FF',
  },
  avatarPublic: {
    backgroundColor: '#CCFBF1',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '700',
  },
  avatarTextStudent: {
    color: appColors.primary,
  },
  avatarTextPublic: {
    color: appColors.secondary,
  },
  info: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: appColors.text,
    flexShrink: 1,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  badgeStudent: {
    backgroundColor: '#EEF2FF',
  },
  badgePublic: {
    backgroundColor: '#CCFBF1',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  badgeTextStudent: {
    color: appColors.primary,
  },
  badgeTextPublic: {
    color: appColors.secondary,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  detail: {
    fontSize: 13,
    color: appColors.textSecondary,
    marginLeft: 6,
  },
  deleteBtn: {
    marginLeft: 4,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: appColors.border,
    gap: 8,
  },
  statChip: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: appColors.primary,
  },
});
