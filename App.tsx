import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import React from 'react';
import SmsReaderScreen from './src/screens/SmsReaderScreen';

const App = () => {
  return (
    <SafeAreaProvider style={styles.container}>
      <SmsReaderScreen />
    </SafeAreaProvider>
  );
};

export default App;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
});
