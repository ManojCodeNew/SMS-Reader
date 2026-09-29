import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  ScrollView,
  BackHandler,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getAllMessages,
  getPinnedChats,
  setChatPinned,
  getInboxMessages,
  getMessagesForAddress,
  SmsMessage,
} from './smsReader';
import { requestSmsPermission } from './permission';

type Page = 'inbox' | 'search' | 'conversation';

function messageError(error: unknown) {
  return error instanceof Error ? error.message : 'Failed to read messages.';
}

function MessageDetails({ message }: { message: SmsMessage }) {
  return (
    <>
      <Text style={styles.address}>{message.address || 'Unknown sender'}</Text>
      <Text selectable style={styles.body}>
        {message.body || '(Empty message)'}
      </Text>
      <Text style={styles.meta}>
        {message.type === 2 ? 'Sent' : 'Received'} ·{' '}
        {new Date(message.date).toLocaleString()}
      </Text>
    </>
  );
}

export default function SmsReaderScreen() {
  const [page, setPage] = useState<Page>('inbox');
  const [returnPage, setReturnPage] = useState<Page>('search');
  const [address, setAddress] = useState('');
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [pins, setPins] = useState<string[]>([]);
  const [pinPreviews, setPinPreviews] = useState<Record<string, SmsMessage>>(
    {},
  );
  const [savingPin, setSavingPin] = useState(false);
  const pinLock = useRef(false);

  const isPinned = (sender: string) =>
    pins.some(pin => pin.toLowerCase() === sender.trim().toLowerCase());

  async function togglePin(sender: string) {
    if (pinLock.current) return;
    pinLock.current = true;
    setSavingPin(true);
    try {
      setPins(await setChatPinned(sender, !isPinned(sender)));
    } catch (e) {
      Alert.alert('Could not save pin', messageError(e));
    } finally {
      pinLock.current = false;
      setSavingPin(false);
    }
  }

  const goBack = useCallback(() => {
    if (page === 'inbox') {
      return false;
    }
    setPage(page === 'conversation' ? returnPage : 'inbox');
    return true;
  }, [page, returnPage]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') setReload(value => value + 1);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      goBack,
    );
    return () => subscription.remove();
  }, [goBack]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setMessages([]);
    async function load() {
      try {
        if (Platform.OS !== 'android') {
          throw new Error('SMS reading is only supported on Android.');
        }
        if (!(await requestSmsPermission())) {
          throw new Error(
            'SMS permission was not granted. Enable it and try again.',
          );
        }
        if (!active) {
          return;
        }
        const savedPins = await getPinnedChats();
        const previews: Record<string, SmsMessage> = {};
        if (page === 'inbox') {
          await Promise.all(
            savedPins.map(async sender => {
              const latest = await getMessagesForAddress(sender, 1);
              if (latest[0]) previews[sender] = latest[0];
            }),
          );
        }
        const list =
          page === 'conversation'
            ? await getMessagesForAddress(address, 0)
            : page === 'search'
            ? await getAllMessages()
            : await getInboxMessages(0);
        if (active) {
          setMessages(list);
          setPins(savedPins);
          setPinPreviews(previews);
        }
      } catch (e) {
        if (active) {
          setError(messageError(e));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [page, address, reload]);

  const chats = useMemo(() => {
    const grouped = new Map<string, { latest: SmsMessage; count: number }>();
    for (const message of messages) {
      const sender = message.address?.trim();
      if (!sender) {
        continue;
      }
      const key = sender.toLowerCase();
      const existing = grouped.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        grouped.set(key, { latest: message, count: 1 });
      }
    }
    const term = query.trim().toLowerCase();
    const digits = term.replace(/\D/g, '');
    return [...grouped.values()].filter(({ latest }) => {
      const sender = latest.address || '';
      return (
        sender.toLowerCase().includes(term) ||
        (/^[+\d\s().-]+$/.test(term) &&
          digits.length > 0 &&
          sender.replace(/\D/g, '').includes(digits))
      );
    });
  }, [messages, query]);

  function openConversation(sender: string | null) {
    if (!sender) {
      return;
    }
    setReturnPage(page);
    setAddress(sender);
    setPage('conversation');
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        {page !== 'inbox' && (
          <Pressable
            accessibilityRole="button"
            onPress={goBack}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Back</Text>
          </Pressable>
        )}
        <Text style={styles.title} numberOfLines={2}>
          {page === 'inbox'
            ? 'SMS inbox'
            : page === 'search'
            ? 'Find a chat'
            : address}
        </Text>
        {page === 'inbox' && (
          <Pressable
            accessibilityRole="button"
            onPress={() => setPage('search')}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Specific chat</Text>
          </Pressable>
        )}
      </View>
      {page === 'search' && (
        <View style={styles.search}>
          <TextInput
            accessibilityLabel="Search sender name or phone number"
            placeholder="Sender name or phone number"
            placeholderTextColor="#64748b"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
          <Text style={styles.meta}>
            Search SMS sender IDs or numbers. Saved contact names are not
            included.
          </Text>
        </View>
      )}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={styles.meta}>Loading messages…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            style={styles.button}
            onPress={() => setReload(value => value + 1)}
          >
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </View>
      ) : page === 'search' ? (
        <FlatList
          data={chats}
          keyExtractor={item => item.latest.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          onRefresh={() => setReload(value => value + 1)}
          refreshing={loading}
          ListEmptyComponent={
            <Text style={styles.empty}>No matching chats.</Text>
          }
          extraData={{ pins, savingPin }}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open chat with ${item.latest.address}`}
                onPress={() => openConversation(item.latest.address)}
              >
                <Text style={styles.address}>{item.latest.address}</Text>
                <Text numberOfLines={2} style={styles.body}>
                  {item.latest.body}
                </Text>
                <Text style={styles.meta}>
                  {item.count} messages ·{' '}
                  {new Date(item.latest.date).toLocaleString()}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${
                  isPinned(item.latest.address || '') ? 'Unpin' : 'Pin'
                } chat with ${item.latest.address}`}
                accessibilityState={{ disabled: savingPin }}
                disabled={savingPin}
                style={styles.pinButton}
                onPress={() => togglePin(item.latest.address!)}
              >
                <Text style={styles.pinText}>
                  {isPinned(item.latest.address || '')
                    ? 'Unpin chat'
                    : 'Pin chat'}
                </Text>
              </Pressable>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={messages}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          onRefresh={() => setReload(value => value + 1)}
          refreshing={loading}
          ListHeaderComponent={
            <View>
              {page === 'inbox' && pins.length > 0 && (
                <View style={styles.premium}>
                  <Text style={styles.premiumTitle}>Premium</Text>
                  <Text style={styles.premiumSubtitle}>
                    Pinned chats · {pins.length} · Swipe to browse
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.pinnedRow}
                  >
                    {pins.map(sender => {
                      const preview = pinPreviews[sender];
                      const today =
                        !!preview &&
                        new Date(preview.date).toDateString() ===
                          new Date().toDateString();
                      const ink = today ? styles.todayInk : styles.olderInk;
                      return (
                        <View
                          key={sender}
                          style={[
                            styles.pinnedCard,
                            today ? styles.todayCard : styles.olderCard,
                          ]}
                        >
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Open pinned chat with ${sender}`}
                            onPress={() => openConversation(sender)}
                          >
                            <Text style={[styles.cardStatus, ink]}>
                              {today
                                ? '●  MESSAGE TODAY'
                                : '○  NO MESSAGES TODAY'}
                            </Text>
                            <Text
                              numberOfLines={1}
                              style={[styles.cardSender, ink]}
                            >
                              {sender}
                            </Text>
                            <Text
                              numberOfLines={1}
                              style={[styles.cardPreview, ink]}
                            >
                              {preview?.body || 'Open conversation'}
                            </Text>
                            <Text style={[styles.cardDate, ink]}>
                              {preview
                                ? new Date(preview.date).toLocaleString()
                                : 'No messages available'}
                            </Text>
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Unpin chat with ${sender}`}
                            disabled={savingPin}
                            style={styles.cardUnpin}
                            onPress={() => togglePin(sender)}
                          >
                            <Text style={[styles.cardUnpinText, ink]}>
                              Unpin
                            </Text>
                          </Pressable>
                        </View>
                      );
                    })}
                  </ScrollView>
                </View>
              )}
              <Text style={styles.meta}>
                {messages.length} messages · Newest first
              </Text>
            </View>
          }
          ListEmptyComponent={
            <Text style={styles.empty}>No messages found.</Text>
          }
          renderItem={({ item }) =>
            page === 'inbox' ? (
              <Pressable
                accessibilityRole="button"
                disabled={!item.address}
                style={styles.row}
                onPress={() => openConversation(item.address)}
              >
                <MessageDetails message={item} />
              </Pressable>
            ) : (
              <View
                style={[
                  styles.row,
                  item.type === 2 ? styles.sent : styles.received,
                ]}
              >
                <MessageDetails message={item} />
                <Text selectable style={styles.meta}>
                  Message ID: {item.id}
                </Text>
              </View>
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  premium: {
    padding: 12,
    gap: 10,
    borderRadius: 12,
    backgroundColor: '#0f172a',
    marginBottom: 16,
  },
  premiumTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  premiumSubtitle: { fontSize: 12, color: '#cbd5e1' },
  pinnedRow: { gap: 12, paddingBottom: 4 },
  pinnedCard: {
    width: 250,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ffffff33',
  },
  todayCard: { backgroundColor: '#31AAA9' },
  olderCard: { backgroundColor: '#A82020' },
  todayInk: { color: '#062c2c' },
  olderInk: { color: '#fff' },
  cardStatus: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  cardSender: { fontSize: 16, fontWeight: '700', marginTop: 6 },
  cardPreview: { fontSize: 13, marginTop: 4 },
  cardDate: { fontSize: 11, marginTop: 5 },
  cardUnpin: {
    alignSelf: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 4,
    borderRadius: 20,
    backgroundColor: '#ffffff22',
  },
  cardUnpinText: { fontSize: 12, fontWeight: '600' },
  pinButton: {
    alignSelf: 'flex-start',
    padding: 10,
    marginTop: 8,
    borderRadius: 8,
    backgroundColor: '#e0e7ff',
  },
  pinText: { fontWeight: '600', color: '#1e40af' },
  screen: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
    backgroundColor: '#fff',
  },
  title: { flex: 1, fontSize: 21, fontWeight: '700', color: '#0f172a' },
  button: {
    backgroundColor: '#1d4ed8',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  buttonText: { color: '#fff', fontWeight: '600' },
  search: { padding: 16, gap: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#94a3b8',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#0f172a',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  error: { color: '#b91c1c', textAlign: 'center' },
  empty: { paddingVertical: 30, textAlign: 'center', color: '#475569' },
  list: { padding: 16, gap: 12, flexGrow: 1 },
  row: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sent: { marginLeft: 28, backgroundColor: '#dbeafe' },
  received: { marginRight: 28 },
  address: { fontWeight: '600', fontSize: 15, color: '#0f172a' },
  body: { fontSize: 15, marginTop: 6, color: '#1e293b' },
  meta: { fontSize: 12, color: '#475569', marginTop: 6 },
});
