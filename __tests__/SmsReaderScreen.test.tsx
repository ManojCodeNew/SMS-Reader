import React from 'react';
import { Platform, Text, TextInput } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import SmsReaderScreen from '../src/screens/SmsReaderScreen';
import {
  getAllMessages,
  getPinnedChats,
  setChatPinned,
  getInboxMessages,
  getMessagesForAddress,
} from '../src/screens/smsReader';
import { requestSmsPermission } from '../src/screens/permission';

jest.mock('../src/screens/smsReader', () => ({
  getAllMessages: jest.fn(),
  getPinnedChats: jest.fn(),
  setChatPinned: jest.fn(),
  getInboxMessages: jest.fn(),
  getMessagesForAddress: jest.fn(),
}));
jest.mock('../src/screens/permission', () => ({
  requestSmsPermission: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

const received = {
  id: '1',
  address: 'VM-BANK',
  body: 'Payment received',
  date: 1000,
  type: 1,
};
const sent = {
  id: '2',
  address: '+919876543210',
  body: 'Hello',
  date: 2000,
  type: 2,
};

beforeEach(() => {
  jest.clearAllMocks();
  let savedPins: string[] = [];
  jest.mocked(getPinnedChats).mockImplementation(async () => [...savedPins]);
  jest.mocked(setChatPinned).mockImplementation(async (address, pinned) => {
    savedPins = savedPins.filter(value => value !== address);
    if (pinned) savedPins.push(address);
    return [...savedPins];
  });
  Platform.OS = 'android';
  jest.mocked(requestSmsPermission).mockResolvedValue(true);
  jest.mocked(getInboxMessages).mockResolvedValue([received]);
  jest.mocked(getAllMessages).mockResolvedValue([sent, received]);
  jest.mocked(getMessagesForAddress).mockResolvedValue([sent]);
});

test('searches sent-only chats, opens all messages, and returns to search', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<SmsReaderScreen />);
  });
  expect(getInboxMessages).toHaveBeenCalledWith(0);
  await act(async () => {
    renderer.root
      .findAll(
        node =>
          node.props.accessibilityRole === 'button' &&
          typeof node.props.onPress === 'function',
      )[0]
      .props.onPress();
  });
  expect(getAllMessages).toHaveBeenCalled();
  await act(async () => {
    renderer.root.findByType(TextInput).props.onChangeText('98765');
  });
  const chat = renderer.root
    .findAll(
      node =>
        node.props.accessibilityRole === 'button' &&
        typeof node.props.onPress === 'function',
    )
    .find(
      node => node.props.accessibilityLabel === 'Open chat with +919876543210',
    );
  expect(chat).toBeDefined();
  expect(
    renderer.root
      .findAll(
        node =>
          node.props.accessibilityRole === 'button' &&
          typeof node.props.onPress === 'function',
      )
      .some(node => node.props.accessibilityLabel === 'Open chat with VM-BANK'),
  ).toBe(false);
  await act(async () => {
    chat!.props.onPress();
  });
  expect(getMessagesForAddress).toHaveBeenCalledWith('+919876543210', 0);
  expect(
    renderer.root
      .findAllByType(Text)
      .some(
        node =>
          Array.isArray(node.props.children) &&
          node.props.children[0] === 'Message ID: ' &&
          node.props.children[1] === '2',
      ),
  ).toBe(true);
  await act(async () => {
    renderer.root
      .findAll(
        node =>
          node.props.accessibilityRole === 'button' &&
          typeof node.props.onPress === 'function',
      )[0]
      .props.onPress();
  });
  expect(renderer.root.findByType(TextInput).props.value).toBe('98765');
  await act(async () => {
    renderer.unmount();
  });
});

test('shows permission failure without querying SMS', async () => {
  jest.mocked(requestSmsPermission).mockResolvedValue(false);
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<SmsReaderScreen />);
  });
  expect(getInboxMessages).not.toHaveBeenCalled();
  expect(
    renderer.root
      .findAllByType(Text)
      .some(node =>
        String(node.props.children).includes('SMS permission was not granted'),
      ),
  ).toBe(true);
  await act(async () => {
    renderer.unmount();
  });
});

test('pins multiple chats inside the app, restores them, and hides Premium after unpinning all', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  const mount = async () => {
    await act(async () => {
      renderer = ReactTestRenderer.create(<SmsReaderScreen />);
    });
  };
  const premiumVisible = () =>
    renderer.root
      .findAllByType(Text)
      .some(node => node.props.children === 'Premium');
  const press = async (label?: string) => {
    await act(async () => {
      const button = renderer.root.findAll(
        node =>
          node.props.accessibilityRole === 'button' &&
          typeof node.props.onPress === 'function' &&
          (!label || node.props.accessibilityLabel === label),
      )[0];
      expect(button).toBeDefined();
      button.props.onPress();
    });
  };
  await mount();
  expect(premiumVisible()).toBe(false);
  await press();
  await press('Pin chat with VM-BANK');
  await press('Pin chat with +919876543210');
  expect(setChatPinned).toHaveBeenCalledWith('VM-BANK', true);
  await press();
  expect(premiumVisible()).toBe(true);
  await act(async () => {
    renderer.unmount();
  });
  await mount();
  expect(premiumVisible()).toBe(true);
  await press('Open pinned chat with VM-BANK');
  expect(getMessagesForAddress).toHaveBeenCalledWith('VM-BANK', 0);
  await press();
  await press('Unpin chat with VM-BANK');
  expect(premiumVisible()).toBe(true);
  await press('Unpin chat with +919876543210');
  expect(premiumVisible()).toBe(false);
  await act(async () => {
    renderer.unmount();
  });
  await mount();
  expect(premiumVisible()).toBe(false);
  await act(async () => {
    renderer.unmount();
  });
});
