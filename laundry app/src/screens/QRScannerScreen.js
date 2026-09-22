import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BillService } from '../services/storage';
import { appColors, SERVICE_TYPES } from '../theme/theme';
import { formatDate, formatCurrency } from '../utils/helpers';
import { useNavigation } from '@react-navigation/native';

export default function QRScannerScreen() {
  const navigation = useNavigation();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission]);

  const handleBarCodeScanned = async ({ type, data }) => {
    setScanned(true);

    // Extract ID if it's a full URL
    let scannedId = data;
    if (data.includes('data=')) {
      scannedId = data.split('data=')[1].split('&')[0];
    }

    // Check if it's a valid Bill ID format
    if (scannedId.startsWith('BILL-') || scannedId.startsWith('WR-')) {
      const bill = await BillService.getById(scannedId);
      if (bill) {
        navigation.navigate('History', { scannedBillId: bill.id });
        // Allow scanning again after a short delay
        setTimeout(() => setScanned(false), 2000);
      } else {
        Alert.alert('Not Found', 'Could not find any bill with this QR Code.', [
          { text: 'OK', onPress: () => setScanned(false) }
        ]);
      }
    } else {
      Alert.alert('Invalid QR', 'This is not a valid Laundry Bill QR code.', [
        { text: 'OK', onPress: () => setScanned(false) }
      ]);
    }
  };

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.message}>We need your permission to show the camera</Text>
        <Button mode="contained" onPress={requestPermission} style={styles.button}>
          Grant Permission
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ["qr"],
        }}
      />

      {/* Scanner Overlay UI */}
      <View style={styles.overlay}>
        <View style={styles.scanArea} />
        <Text style={styles.scanText}>Position the QR code inside the frame</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: appColors.background,
  },
  message: {
    textAlign: 'center',
    paddingBottom: 20,
    fontSize: 16,
    color: appColors.text,
  },
  button: {
    borderRadius: 8,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanArea: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: appColors.primary,
    backgroundColor: 'transparent',
    borderRadius: 12,
  },
  scanText: {
    color: '#FFF',
    fontSize: 16,
    marginTop: 20,
    fontWeight: '600',
  },
});
