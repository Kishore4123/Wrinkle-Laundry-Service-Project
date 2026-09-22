// firebase.js — Firebase app, anonymous auth, Firestore handle, and this device's stable ID.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence, signInAnonymously } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import { generateId } from '../utils/helpers';

const DEVICE_ID_KEY = '@wrinkle_device_id';

const firebaseConfig = {
  apiKey: 'AIzaSyDvf57bPgRR0jA_kilIKP-GXNeMRg_ryzY',
  authDomain: 'stress-monitor-7005a.firebaseapp.com',
  projectId: 'stress-monitor-7005a',
  storageBucket: 'stress-monitor-7005a.firebasestorage.app',
  messagingSenderId: '329659811223',
  appId: '1:329659811223:web:3e6aa4bb0018ee4bf5f0d2',
};

const app = initializeApp(firebaseConfig);

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

// Long polling is required on React Native; without it Firestore listeners stall silently.
export const db = initializeFirestore(app, { experimentalForceLongPolling: true });

let signInPromise = null;

export function ensureSignedIn() {
  if (auth.currentUser) return Promise.resolve(auth.currentUser.uid);
  if (!signInPromise) {
    signInPromise = signInAnonymously(auth)
      .then((cred) => cred.user.uid)
      .catch((err) => { signInPromise = null; throw err; });
  }
  return signInPromise;
}

let deviceIdPromise = null;

export function getDeviceId() {
  if (!deviceIdPromise) {
    deviceIdPromise = (async () => {
      let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
      if (!id) {
        id = generateId();
        await AsyncStorage.setItem(DEVICE_ID_KEY, id);
      }
      return id;
    })();
  }
  return deviceIdPromise;
}
