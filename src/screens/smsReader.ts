import { NativeModules } from 'react-native';

export type SmsMessage = {
  id: string;
  address: string | null;
  body: string | null;
  date: number;
  type: number;
};

type SmsMethod =
  | 'getInboxMessages'
  | 'getAllMessages'
  | 'getPinnedChats'
  | 'setChatPinned'
  | 'getMessagesForAddress';

function getModule(method: SmsMethod) {
  const { SmsModule } = NativeModules;
  if (!SmsModule) {
    throw new Error('SMS reader is unavailable. Rebuild the Android app.');
  }
  if (typeof SmsModule[method] !== 'function') {
    throw new Error(
      `The installed Android app is missing SmsModule.${method}(). Install the updated Android build; reloading JavaScript is not enough.`,
    );
  }
  return SmsModule;
}

/** Newest first; zero means no limit. */
export function getInboxMessages(maxCount = 0): Promise<SmsMessage[]> {
  return getModule('getInboxMessages').getInboxMessages(maxCount);
}

export function getAllMessages(): Promise<SmsMessage[]> {
  return getModule('getAllMessages').getAllMessages();
}

/** Received and sent SMS, newest first; zero means no limit. */
export function getMessagesForAddress(
  address: string,
  maxCount = 0,
): Promise<SmsMessage[]> {
  return getModule('getMessagesForAddress').getMessagesForAddress(
    address,
    maxCount,
  );
}

export function getPinnedChats(): Promise<string[]> {
  return getModule('getPinnedChats').getPinnedChats();
}

export function setChatPinned(
  address: string,
  pinned: boolean,
): Promise<string[]> {
  return getModule('setChatPinned').setChatPinned(address, pinned);
}
