// SyncStatusBadge.js — Tappable connection status pill for WebRTC sync
import React from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useWebRTC, ConnectionState } from '../services/WebRTCContext';
import { appColors } from '../theme/theme';

const STATE_CONFIG = {
  [ConnectionState.CONNECTED]: { color: '#10B981', label: 'Connected', icon: 'cloud-check' },
  [ConnectionState.CONNECTING]: { color: '#F59E0B', label: 'Connecting...', icon: 'cloud-sync' },
  [ConnectionState.SIGNALING]: { color: '#F59E0B', label: 'Pairing...', icon: 'cloud-sync' },
  [ConnectionState.DISCONNECTED]: { color: '#EF4444', label: 'Not Connected', icon: 'cloud-off-outline' },
};

export default function SyncStatusBadge({ onPress }) {
  const { connectionState, offlineQueueCount, latencyMs, pairedRoomId } = useWebRTC();
  const config = STATE_CONFIG[connectionState] || STATE_CONFIG[ConnectionState.DISCONNECTED];

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: config.color }]} />
        <MaterialCommunityIcons name={config.icon} size={22} color={config.color} />
        <View style={styles.textCol}>
          <Text style={styles.label}>{config.label}</Text>
          {pairedRoomId && (
            <Text style={styles.sub}>Room: {pairedRoomId}</Text>
          )}
          {connectionState === ConnectionState.CONNECTED && latencyMs != null && (
            <Text style={styles.sub}>{latencyMs}ms latency</Text>
          )}
        </View>
        {offlineQueueCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{offlineQueueCount}</Text>
          </View>
        )}
        <MaterialCommunityIcons name="chevron-right" size={20} color={appColors.textLight} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: appColors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: appColors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  textCol: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: appColors.text,
  },
  sub: {
    fontSize: 11,
    color: appColors.textSecondary,
    marginTop: 1,
  },
  badge: {
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
});
