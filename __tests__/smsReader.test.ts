import { NativeModules } from 'react-native';
import {
  getAllMessages,
  getInboxMessages,
  getMessagesForAddress,
} from '../src/screens/smsReader';

const originalModule = NativeModules.SmsModule;
afterEach(() => {
  NativeModules.SmsModule = originalModule;
});

test('identifies the missing method on an older installed native module', () => {
  NativeModules.SmsModule = { getInboxMessages: jest.fn() };
  expect(() => getAllMessages()).toThrow('missing SmsModule.getAllMessages()');
});

test('calls the currently registered native methods with no message limit', async () => {
  NativeModules.SmsModule = {
    getAllMessages: jest.fn().mockResolvedValue([]),
    getInboxMessages: jest.fn().mockResolvedValue([]),
    getMessagesForAddress: jest.fn().mockResolvedValue([]),
  };
  await expect(getAllMessages()).resolves.toEqual([]);
  await getInboxMessages();
  await getMessagesForAddress('VM-BANK');
  expect(NativeModules.SmsModule.getAllMessages).toHaveBeenCalledTimes(1);
  expect(NativeModules.SmsModule.getInboxMessages).toHaveBeenCalledWith(0);
  expect(NativeModules.SmsModule.getMessagesForAddress).toHaveBeenCalledWith(
    'VM-BANK',
    0,
  );
});

test('reports a missing module clearly', () => {
  NativeModules.SmsModule = undefined;
  expect(() => getAllMessages()).toThrow('SMS reader is unavailable');
});
