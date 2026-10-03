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

export function conversationDay(date: number | undefined, now = new Date()) {
  if (date === undefined) return 'older';
  const day = new Date(date).toDateString();
  if (day === now.toDateString()) return 'today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return day === yesterday.toDateString() ? 'yesterday' : 'older';
}

function CountBadge({ label }: { label: string }) {
  return <Text style={styles.countBadge}>{label}</Text>;
}

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
  const [pinCounts, setPinCounts] = useState<Record<string, number>>({});
  const [dayClock, setDayClock] = useState(() => new Date());
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

  useEffect(() => {
    const timer = setInterval(() => setDayClock(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

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
        const counts: Record<string, number> = {};
        if (page === 'inbox') {
          await Promise.all(
            savedPins.map(async sender => {
              const latest = await getMessagesForAddress(sender, 0);
              counts[sender] = latest.length;
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
          setPinCounts(counts);
          setDayClock(new Date());
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
            placeholderTextColor="#665342"
            selectionColor="#171411"
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
          <ActivityIndicator size="large" color="#171411" />
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
                <View style={styles.cardHeading}>
                  <Text style={[styles.address, styles.senderHeading]}>
                    {item.latest.address}
                  </Text>
                  <CountBadge label={`${item.count} messages`} />
                </View>
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
                  <View style={styles.legend}>
                    <Text style={styles.legendToday}>● Today</Text>
                    <Text style={styles.legendYesterday}>● Yesterday</Text>
                    <Text style={styles.legendOlder}>● Older</Text>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.pinnedRow}
                  >
                    {pins.map(sender => {
                      const preview = pinPreviews[sender];
                      const day = conversationDay(preview?.date, dayClock);
                      const ink =
                        day === 'older' ? styles.olderInk : styles.todayInk;
                      return (
                        <View
                          key={sender}
                          style={[
                            styles.pinnedCard,
                            day === 'today'
                              ? styles.todayCard
                              : day === 'yesterday'
                              ? styles.yesterdayCard
                              : styles.olderCard,
                          ]}
                        >
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Open pinned chat with ${sender}`}
                            onPress={() => openConversation(sender)}
                          >
                            <CountBadge
                              label={`${pinCounts[sender] || 0} messages`}
                            />
                            <Text style={[styles.cardStatus, ink]}>
                              {!preview
                                ? '○  NO MESSAGES'
                                : day === 'today'
                                ? '●  TODAY'
                                : day === 'yesterday'
                                ? '●  YESTERDAY'
                                : '●  OLDER'}
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
          renderItem={({ item, index }) =>
            page === 'inbox' ? (
              <Pressable
                accessibilityRole="button"
                disabled={!item.address}
                style={styles.row}
                onPress={() => openConversation(item.address)}
              >
                <CountBadge label={`#${index + 1} / ${messages.length}`} />
                <MessageDetails message={item} />
              </Pressable>
            ) : (
              <View
                style={[
                  styles.row,
                  item.type === 2 ? styles.sent : styles.received,
                ]}
              >
                <CountBadge label={`#${index + 1} / ${messages.length}`} />
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
  cardHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  senderHeading: { flex: 1 },
  countBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#171411',
    color: '#FFDBB0',
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 5,
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  legendToday: { color: '#70e000', fontSize: 12, fontWeight: '600' },
  legendYesterday: { color: '#ffbc42', fontSize: 12, fontWeight: '600' },
  legendOlder: { color: '#FFB099', fontSize: 12, fontWeight: '600' },
  premium: {
    padding: 12,
    gap: 10,
    borderRadius: 12,
    backgroundColor: '#171411',
    backgroundImage: 'linear-gradient(135deg, #171411 0%, #5C3824 100%)',
    marginBottom: 16,
  },
  premiumTitle: { fontSize: 20, fontWeight: '700', color: '#FCF9EA' },
  premiumSubtitle: { fontSize: 12, color: '#FCF9EA' },
  pinnedRow: { gap: 12, paddingBottom: 4 },
  pinnedCard: {
    width: 250,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ffffff33',
  },
  todayCard: { backgroundColor: '#70e000' },
  yesterdayCard: { backgroundColor: '#ffbc42' },
  olderCard: { backgroundColor: '#c33d08' },
  todayInk: { color: '#111111' },
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
    backgroundColor: '#FCF9EA',
  },
  pinText: { fontWeight: '600', color: '#171411' },
  screen: { flex: 1, backgroundColor: '#FCF9EA' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
    backgroundColor: '#FCF9EA',
    borderBottomWidth: 1,
    borderBottomColor: '#E6BB8D',
  },
  title: { flex: 1, fontSize: 21, fontWeight: '700', color: '#171411' },
  button: {
    backgroundColor: '#171411',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  buttonText: { color: '#FFDBB0', fontWeight: '600' },
  search: { padding: 16, gap: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#B89672',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#FFF3E5',
    color: '#171411',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  error: { color: '#b91c1c', textAlign: 'center' },
  empty: { paddingVertical: 30, textAlign: 'center', color: '#514235' },
  list: { padding: 16, gap: 12, flexGrow: 1 },
  row: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#FFF3E5',
    borderWidth: 1,
    borderColor: '#E6BB8D',
  },
  sent: { marginLeft: 28, backgroundColor: '#F5C58E' },
  received: { marginRight: 28 },
  address: { fontWeight: '600', fontSize: 15, color: '#171411' },
  body: { fontSize: 15, marginTop: 6, color: '#211B16' },
  meta: { fontSize: 12, color: '#514235', marginTop: 6 },
});
