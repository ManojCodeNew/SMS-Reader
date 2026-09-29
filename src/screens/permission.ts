import { PermissionsAndroid, Platform, Linking, Alert } from 'react-native';

/**
 * Requests the READ_SMS runtime permission.
 * Returns true if granted, false otherwise.
 */
export async function requestSmsPermission() {
  if (Platform.OS !== 'android') {
    // iOS has no SMS-reading API at all.
    return false;
  }

  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_SMS,
      {
        title: 'SMS Permission',
        message: 'This app needs access to your SMS inbox to display messages.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      },
    );

    if (granted === PermissionsAndroid.RESULTS.GRANTED) {
      return true;
    }

    if (granted === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
      // User checked "don't ask again" — must be sent to Settings manually.
      Alert.alert(
        'Permission required',
        'SMS permission was permanently denied. Please enable it manually in Settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ],
      );
    }

    return false;
  } catch (err) {
    console.warn('SMS permission request failed:', err);
    return false;
  }
}
