// PairingModal.js — Modal for pairing with the Electron desktop app
// Supports QR code scanning and manual room code entry
import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Modal, Portal, Button, Text, TextInput, SegmentedButtons } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView } from 'expo-camera';
import { useWebRTC, ConnectionState } from '../services/WebRTCContext';
import { appColors } from '../theme/theme';

export default function PairingModal({ visible, onDismiss }) {
  const { connectionState, connect, unpair, pairedRoomId, isConnected } = useWebRTC();
  const [tab, setTab] = useState('manual');
  const [roomCode, setRoomCode] = useState('');
  const [scanned, setScanned] = useState(false);

  const handleConnect = async (code) => {
    const trimmed = (code || roomCode).trim().toUpperCase();
    if (!trimmed) {
      Alert.alert('Required', 'Please enter a room code.');
      return;
    }
    await connect(trimmed);
  };

  const handleBarCodeScanned = ({ data }) => {
    if (scanned) return;
    setScanned(true);
    try {
      const payload = JSON.parse(data);
      if (payload.roomId) {
        handleConnect(payload.roomId);
      } else {
        Alert.alert('Invalid QR', 'This QR code does not contain a valid room ID.');
        setTimeout(() => setScanned(false), 2000);
      }
    } catch (e) {
      // Might be a plain text room code
      if (data.startsWith('WRK-') || data.length <= 10) {
        handleConnect(data);
      } else {
        Alert.alert('Invalid QR', 'Could not parse the QR code.');
        setTimeout(() => setScanned(false), 2000);
      }
    }
  };

  const handleUnpair = () => {
    Alert.alert('Unpair', 'Disconnect from the desktop app?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unpair', style: 'destructive', onPress: async () => { await unpair(); setRoomCode(''); } },
    ]);
  };

  const getStatusInfo = () => {
    switch (connectionState) {
      case ConnectionState.CONNECTING: return { icon: 'cloud-sync', text: 'Connecting to Cloud...', color: '#F59E0B' };
      case ConnectionState.SIGNALING: return { icon: 'lan-connect', text: 'Pairing with Desktop...', color: '#F59E0B' };
      case ConnectionState.CONNECTED: return { icon: 'cloud-check', text: 'Connected (P2P/TURN)', color: '#10B981' };
      default: return { icon: 'cloud-off-outline', text: 'Disconnected', color: '#EF4444' };
    }
  };
  const status = getStatusInfo();

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.modal}>
        <View style={styles.content}>
          {/* Header */}
          <View style={[styles.iconCircle, { backgroundColor: status.color }]}>  
            <MaterialCommunityIcons name={status.icon} size={32} color="#FFFFFF" />
          </View>
          <Text style={styles.title}>Desktop Sync</Text>
          <Text style={styles.statusText}>{status.text}</Text>

          {isConnected ? (
            /* Connected state */
            <View style={styles.connectedSection}>
              <View style={styles.infoRow}>
                <MaterialCommunityIcons name="lan" size={18} color={appColors.textSecondary} />
                <Text style={styles.infoText}>Paired to: <Text style={styles.infoBold}>{pairedRoomId}</Text></Text>
              </View>
              <Button mode="outlined" onPress={handleUnpair} style={styles.unpairBtn} textColor="#EF4444" icon="link-off">
                Unpair
              </Button>
            </View>
          ) : (
            /* Pairing state */
            <>
              <SegmentedButtons
                value={tab}
                onValueChange={setTab}
                buttons={[
                  { value: 'manual', label: 'Room Code', icon: 'keyboard' },
                  { value: 'scan', label: 'Scan QR', icon: 'qrcode-scan' },
                ]}
                style={styles.tabs}
              />

              {tab === 'manual' ? (
                <View style={styles.inputSection}>
                  <TextInput
                    label="Room Code"
                    value={roomCode}
                    onChangeText={(t) => setRoomCode(t.toUpperCase())}
                    mode="outlined"
                    style={styles.input}
                    outlineStyle={{ borderRadius: 14 }}
                    left={<TextInput.Icon icon="lan" />}
                    placeholder="e.g. WRK-A1B2C3"
                    autoCapitalize="characters"
                    maxLength={12}
                  />
                  <Button
                    mode="contained"
                    onPress={() => handleConnect()}
                    style={styles.connectBtn}
                    contentStyle={{ height: 48 }}
                    buttonColor={appColors.primary}
                    loading={connectionState === ConnectionState.CONNECTING || connectionState === ConnectionState.SIGNALING}
                    disabled={connectionState === ConnectionState.CONNECTING || connectionState === ConnectionState.SIGNALING}
                    icon="lan-connect"
                  >
                    Connect
                  </Button>
                </View>
              ) : (
                <View style={styles.scanSection}>
                  <View style={styles.cameraBox}>
                    <CameraView
                      style={styles.camera}
                      barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                      onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
                    />
                  </View>
                  <Text style={styles.scanHint}>Point at the QR code on the desktop dashboard</Text>
                </View>
              )}
            </>
          )}

          <Button mode="text" onPress={onDismiss} style={styles.closeBtn}>
            Close
          </Button>
        </View>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modal: {
    backgroundColor: appColors.surface,
    marginHorizontal: 24,
    borderRadius: 24,
    padding: 28,
    maxHeight: '90%',
  },
  content: {
    alignItems: 'center',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    elevation: 4,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: appColors.text,
    marginBottom: 4,
  },
  statusText: {
    fontSize: 13,
    color: appColors.textSecondary,
    marginBottom: 20,
  },
  tabs: {
    marginBottom: 16,
    width: '100%',
  },
  inputSection: {
    width: '100%',
    gap: 12,
  },
  input: {
    backgroundColor: appColors.surface,
  },
  connectBtn: {
    borderRadius: 14,
  },
  scanSection: {
    width: '100%',
    alignItems: 'center',
    gap: 12,
  },
  cameraBox: {
    width: '100%',
    height: 220,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: appColors.border,
  },
  camera: {
    flex: 1,
  },
  scanHint: {
    fontSize: 12,
    color: appColors.textSecondary,
    textAlign: 'center',
  },
  connectedSection: {
    width: '100%',
    gap: 12,
    alignItems: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: appColors.surfaceVariant,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  infoText: {
    fontSize: 13,
    color: appColors.textSecondary,
  },
  infoBold: {
    fontWeight: '700',
    color: appColors.text,
  },
  unpairBtn: {
    borderRadius: 14,
    borderColor: '#EF4444',
    width: '100%',
  },
  closeBtn: {
    marginTop: 8,
  },
});
