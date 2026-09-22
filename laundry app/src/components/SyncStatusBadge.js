// SyncStatusBadge.js — cloud sync status pill. Tapping it retries pending bills.
import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSync } from '../services/SyncContext';

export default function SyncStatusBadge({ onPress }) {
  const { isOnline, pendingCount, flush } = useSync();

  const color = isOnline ? '#10B981' : '#EF4444';
  const icon = isOnline ? 'cloud-check' : 'cloud-off-outline';
  const label = isOnline ? 'Cloud Connected' : 'Offline';

  const handlePress = async () => {
    if (onPress) onPress();
    await flush();
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.7}>
      <View style={[styles.pill, { borderColor: color }]}>
        <MaterialCommunityIcons name={icon} size={16} color={color} />
        <Text style={[styles.label, { color }]}>{label}</Text>
        {pendingCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{pendingCount} pending</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  label: { fontSize: 12, fontWeight: '700' },
  badge: {
    backgroundColor: '#F59E0B',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 10, color: '#FFFFFF', fontWeight: '700' },
});
