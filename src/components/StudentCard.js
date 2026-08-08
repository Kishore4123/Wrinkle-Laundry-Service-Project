// StudentCard — Displays a student's info in a card with delete action
import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { appColors } from '../theme/theme';

export default function StudentCard({ student, onDelete }) {
  return (
    <View style={styles.card}>
      <View style={styles.mainRow}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {student.name.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{student.name}</Text>
        <View style={styles.detailRow}>
          <MaterialCommunityIcons name="card-account-details-outline" size={14} color={appColors.textSecondary} />
          <Text style={styles.detail}>{student.regNo}</Text>
        </View>
        <View style={styles.detailRow}>
          <MaterialCommunityIcons name="phone-outline" size={14} color={appColors.textSecondary} />
          <Text style={styles.detail}>{student.mobile}</Text>
        </View>
      </View>
      {onDelete && (
        <IconButton
          icon="delete-outline"
          iconColor={appColors.error}
          size={22}
          onPress={() => onDelete(student)}
          style={styles.deleteBtn}
        />
      )}
      </View>
      <View style={styles.statsRow}>
        <View style={styles.statChip}>
          <Text style={styles.statChipText}>Total: {student.totalWeight || 0} kg</Text>
        </View>
        <View style={[styles.statChip, { backgroundColor: '#CCFBF1' }]}>
          <Text style={[styles.statChipText, { color: appColors.secondary }]}>Paid: ₹{student.totalAmountPaid || 0}</Text>
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
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: appColors.primary,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: appColors.text,
    marginBottom: 4,
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
});
