/*
  SMART PLANT CARE SYSTEM — React Native App (3 tabs)
  --------------------------------------------------------------------
  Home    -> live dashboard (mood, stats, water now, mode toggle)
  History -> session-based moisture trend + stats (client-side only)
  About   -> static info screen, mood legend, feature list

  No navigation library needed - simple custom tab bar via React state.
  Talks directly to your ESP32's local web server, same as before.
*/

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  RefreshControl,
  ScrollView,
  ActivityIndicator,
  Switch,
  StatusBar,
} from 'react-native';

const ESP32_IP = '192.168.4.1';
const POLL_INTERVAL_MS = 4000;
const MAX_HISTORY_POINTS = 20;

const COLORS = {
  forest: '#1F6F5C',
  darkGreen: '#1B3A2B',
  moss: '#6E9B4E',
  mossLight: '#97BC62',
  marigold: '#F2A541',
  cream: '#F7F7F2',
  charcoal: '#2B2B26',
  white: '#FFFFFF',
};

const MOOD_EMOJI = { Happy: '😊', Thirsty: '😰', TooHot: '🥵', NeedsLight: '🌑' };
const MOOD_LABEL = { Happy: 'Happy', Thirsty: 'Thirsty', TooHot: 'Too Hot', NeedsLight: 'Needs Light' };

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [data, setData] = useState(null);
  const [connected, setConnected] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [watering, setWatering] = useState(false);
  const [wateredJustNow, setWateredJustNow] = useState(false);
  const [history, setHistory] = useState([]); // [{moisture, mood, time}]
  const [sessionStart] = useState(new Date());

  const bounceAnim = useRef(new Animated.Value(0)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;
  const moistureAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -8, duration: 900, useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`http://${ESP32_IP}/status`, { timeout: 4000 });
      const json = await res.json();
      setData(json);
      setConnected(true);
      Animated.timing(moistureAnim, { toValue: json.moisture, duration: 500, useNativeDriver: false }).start();

      setHistory((prev) => {
        const next = [...prev, { moisture: json.moisture, mood: json.mood, time: new Date() }];
        return next.length > MAX_HISTORY_POINTS ? next.slice(next.length - MAX_HISTORY_POINTS) : next;
      });
    } catch (err) {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchStatus();
    setRefreshing(false);
  };

  const handleWaterNow = async () => {
    if (watering) return;
    setWatering(true);
    Animated.sequence([
      Animated.timing(buttonScale, { toValue: 0.9, duration: 100, useNativeDriver: true }),
      Animated.timing(buttonScale, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();

    try {
      await fetch(`http://${ESP32_IP}/water`);
      setWateredJustNow(true);
      setTimeout(() => setWateredJustNow(false), 2000);
    } catch (err) {}
    finally {
      setTimeout(() => {
        setWatering(false);
        fetchStatus();
      }, 3200);
    }
  };

  const toggleMode = async (value) => {
    setData((prev) => (prev ? { ...prev, autoMode: value } : prev));
    try {
      await fetch(`http://${ESP32_IP}/mode?auto=${value ? 1 : 0}`);
    } catch (err) {}
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.darkGreen} />

      {activeTab === 'home' && (
        <HomeScreen
          data={data}
          connected={connected}
          refreshing={refreshing}
          onRefresh={onRefresh}
          watering={watering}
          wateredJustNow={wateredJustNow}
          handleWaterNow={handleWaterNow}
          toggleMode={toggleMode}
          bounceAnim={bounceAnim}
          buttonScale={buttonScale}
          moistureAnim={moistureAnim}
        />
      )}
      {activeTab === 'history' && <HistoryScreen history={history} sessionStart={sessionStart} />}
      {activeTab === 'about' && <AboutScreen />}

      {/* Bottom tab bar */}
      <View style={styles.tabBar}>
        <TabButton label="Home" icon="🏠" active={activeTab === 'home'} onPress={() => setActiveTab('home')} />
        <TabButton label="History" icon="📈" active={activeTab === 'history'} onPress={() => setActiveTab('history')} />
        <TabButton label="About" icon="ℹ️" active={activeTab === 'about'} onPress={() => setActiveTab('about')} />
      </View>
    </SafeAreaView>
  );
}

function TabButton({ label, icon, active, onPress }) {
  return (
    <TouchableOpacity style={styles.tabButton} onPress={onPress} activeOpacity={0.7}>
      <Text style={[styles.tabIcon, active && { opacity: 1 }]}>{icon}</Text>
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ==================== HOME SCREEN ====================
function HomeScreen({
  data, connected, refreshing, onRefresh, watering, wateredJustNow,
  handleWaterNow, toggleMode, bounceAnim, buttonScale, moistureAnim,
}) {
  const mood = data?.mood || 'Happy';
  const moistureWidth = moistureAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.forest} />}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🌱 My Plant</Text>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: connected ? COLORS.moss : '#B0B0B0' }]} />
          <Text style={styles.statusText}>{connected ? 'Connected' : 'Offline'}</Text>
        </View>
      </View>

      <View style={styles.heroCard}>
        <Animated.Text style={[styles.moodEmoji, { transform: [{ translateY: bounceAnim }] }]}>
          {MOOD_EMOJI[mood] || '🌱'}
        </Animated.Text>
        <Text style={styles.moodLabel}>{MOOD_LABEL[mood] || 'Loading...'}</Text>
        <View style={styles.speechBubble}>
          <Text style={styles.speechText}>
            {data?.message || (connected ? 'Reading my sensors...' : "Can't reach me right now 😔")}
          </Text>
        </View>
        {data?.predictedHours > 0 && mood !== 'Thirsty' && (
          <View style={styles.predictionBanner}>
            <Text style={styles.predictionText}>💧 Will need water in ~{data.predictedHours.toFixed(1)}h</Text>
          </View>
        )}
      </View>

      <View style={styles.moistureCard}>
        <View style={styles.moistureHeaderRow}>
          <Text style={styles.moistureLabel}>Soil Moisture</Text>
          <Text style={styles.moistureValue}>{data?.moisture ?? '--'}%</Text>
        </View>
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: moistureWidth }]} />
        </View>
      </View>

      <View style={styles.statGrid}>
        <StatCard icon="🌡️" label="Temperature" value={data ? `${data.temperature.toFixed(1)}°C` : '--'} />
        <StatCard icon="💦" label="Humidity" value={data ? `${data.humidity.toFixed(0)}%` : '--'} />
        <StatCard icon="☀️" label="Light" value={data ? `${data.light}%` : '--'} />
        <StatCard icon="⚙️" label="Mode" value={data?.autoMode ? 'Auto' : 'Manual'} />
      </View>

      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>Auto-Watering</Text>
        <Switch
          value={!!data?.autoMode}
          onValueChange={toggleMode}
          trackColor={{ false: '#D0D0D0', true: COLORS.mossLight }}
          thumbColor={COLORS.forest}
        />
      </View>

      <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
        <TouchableOpacity
          style={[styles.waterButton, watering && styles.waterButtonDisabled]}
          onPress={handleWaterNow}
          disabled={watering}
          activeOpacity={0.8}
        >
          {watering ? <ActivityIndicator color={COLORS.white} /> : (
            <Text style={styles.waterButtonText}>{wateredJustNow ? '✓ Watered!' : '💧 Water Now'}</Text>
          )}
        </TouchableOpacity>
      </Animated.View>
    </ScrollView>
  );
}

function StatCard({ icon, label, value }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ==================== HISTORY SCREEN ====================
function HistoryScreen({ history, sessionStart }) {
  const moistureValues = history.map((h) => h.moisture);
  const highest = moistureValues.length ? Math.max(...moistureValues) : null;
  const lowest = moistureValues.length ? Math.min(...moistureValues) : null;
  const thirstyCount = history.filter((h) => h.mood === 'Thirsty').length;
  const sessionMinutes = Math.max(1, Math.round((new Date() - sessionStart) / 60000));

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📈 History</Text>
      </View>

      <View style={styles.chartCard}>
        <Text style={styles.cardTitle}>Moisture — this session</Text>
        {history.length === 0 ? (
          <Text style={styles.emptyText}>Waiting for readings...</Text>
        ) : (
          <View style={styles.barChartRow}>
            {history.map((h, i) => (
              <View key={i} style={styles.barWrap}>
                <View style={[styles.bar, { height: Math.max(4, h.moisture) }]} />
              </View>
            ))}
          </View>
        )}
        <Text style={styles.chartCaption}>Last {history.length} readings, updates every few seconds</Text>
      </View>

      <View style={styles.statGrid}>
        <StatCard icon="⬆️" label="Highest Moisture" value={highest !== null ? `${highest}%` : '--'} />
        <StatCard icon="⬇️" label="Lowest Moisture" value={lowest !== null ? `${lowest}%` : '--'} />
        <StatCard icon="😰" label="Times Thirsty" value={`${thirstyCount}`} />
        <StatCard icon="⏱️" label="Session Length" value={`${sessionMinutes} min`} />
      </View>

      <Text style={styles.footNote}>
        This history resets when the app restarts — it's tracked live on your phone, not stored on the device.
      </Text>
    </ScrollView>
  );
}

// ==================== ABOUT SCREEN ====================
function AboutScreen() {
  const moodRows = [
    { emoji: '😊', label: 'Happy', desc: 'Everything is within a healthy range.' },
    { emoji: '😰', label: 'Thirsty', desc: 'Soil moisture has dropped below the safe threshold.' },
    { emoji: '🥵', label: 'Too Hot', desc: 'Temperature has climbed above the comfortable range.' },
    { emoji: '🌑', label: 'Needs Light', desc: 'The plant has been in low light for a while.' },
  ];
  const features = [
    'Predicts dryness in advance using a drying-rate trend, not just a fixed threshold',
    'Auto-waters itself safely with short timed pulses, or waters on demand from this app',
    'Runs entirely offline — the ESP32 creates its own WiFi hotspot, no internet needed',
    'Every screen here reads the exact same live data — nothing is faked or pre-recorded',
  ];

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>ℹ️ About</Text>
      </View>

      <View style={styles.heroCard}>
        <Text style={styles.moodEmoji}>🌱</Text>
        <Text style={styles.moodLabel}>Smart Plant Care System</Text>
        <View style={styles.speechBubble}>
          <Text style={styles.speechText}>A plant that senses, predicts, talks, and takes care of itself.</Text>
        </View>
      </View>

      <View style={styles.chartCard}>
        <Text style={styles.cardTitle}>Mood Legend</Text>
        {moodRows.map((m, i) => (
          <View key={i} style={styles.legendRow}>
            <Text style={styles.legendEmoji}>{m.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.legendLabel}>{m.label}</Text>
              <Text style={styles.legendDesc}>{m.desc}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.chartCard}>
        <Text style={styles.cardTitle}>What Makes This Different</Text>
        {features.map((f, i) => (
          <View key={i} style={styles.featureRow}>
            <Text style={styles.featureBullet}>•</Text>
            <Text style={styles.featureText}>{f}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.footNote}>ESP32 + React Native · IoT Mini Project</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.cream },
  scrollContent: { padding: 20, paddingBottom: 20 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: COLORS.darkGreen },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  statusText: { fontSize: 13, color: COLORS.charcoal },

  heroCard: {
    backgroundColor: COLORS.forest, borderRadius: 24, paddingVertical: 28, paddingHorizontal: 20,
    alignItems: 'center', marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  moodEmoji: { fontSize: 72, marginBottom: 4 },
  moodLabel: { fontSize: 20, fontWeight: '700', color: COLORS.white, marginBottom: 14, textAlign: 'center' },
  speechBubble: {
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  speechText: { color: COLORS.white, fontSize: 14, textAlign: 'center', fontStyle: 'italic' },
  predictionBanner: { marginTop: 14, backgroundColor: 'rgba(242,165,65,0.18)', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14 },
  predictionText: { color: COLORS.marigold, fontWeight: '700', fontSize: 13 },

  moistureCard: {
    backgroundColor: COLORS.white, borderRadius: 16, padding: 16, marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  moistureHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  moistureLabel: { fontSize: 14, color: COLORS.charcoal, fontWeight: '600' },
  moistureValue: { fontSize: 14, color: COLORS.forest, fontWeight: '700' },
  progressTrack: { height: 10, backgroundColor: '#E7EDE8', borderRadius: 5, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: COLORS.moss, borderRadius: 5 },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 16 },
  statCard: {
    width: '48%', backgroundColor: COLORS.white, borderRadius: 16, paddingVertical: 16, alignItems: 'center',
    marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  statIcon: { fontSize: 24, marginBottom: 6 },
  statValue: { fontSize: 18, fontWeight: '700', color: COLORS.darkGreen },
  statLabel: { fontSize: 12, color: COLORS.charcoal, marginTop: 2 },

  toggleRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.white,
    borderRadius: 16, paddingVertical: 14, paddingHorizontal: 18, marginBottom: 20,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: COLORS.charcoal },

  waterButton: {
    backgroundColor: COLORS.marigold, borderRadius: 18, paddingVertical: 18, alignItems: 'center',
    shadowColor: COLORS.marigold, shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5,
  },
  waterButtonDisabled: { backgroundColor: '#E0B370' },
  waterButtonText: { color: COLORS.white, fontSize: 17, fontWeight: '700' },

  // History screen
  chartCard: {
    backgroundColor: COLORS.white, borderRadius: 16, padding: 16, marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.darkGreen, marginBottom: 12 },
  emptyText: { fontSize: 13, color: COLORS.charcoal, fontStyle: 'italic', paddingVertical: 20, textAlign: 'center' },
  barChartRow: { flexDirection: 'row', alignItems: 'flex-end', height: 110, justifyContent: 'space-between' },
  barWrap: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%', marginHorizontal: 1 },
  bar: { width: '70%', backgroundColor: COLORS.moss, borderRadius: 3 },
  chartCaption: { fontSize: 11, color: COLORS.charcoal, marginTop: 10, textAlign: 'center' },
  footNote: { fontSize: 11, color: COLORS.charcoal, textAlign: 'center', marginTop: 4, marginBottom: 12, fontStyle: 'italic' },

  // About screen
  legendRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  legendEmoji: { fontSize: 28, marginRight: 12 },
  legendLabel: { fontSize: 14, fontWeight: '700', color: COLORS.darkGreen },
  legendDesc: { fontSize: 12.5, color: COLORS.charcoal, marginTop: 2 },
  featureRow: { flexDirection: 'row', marginBottom: 10 },
  featureBullet: { color: COLORS.marigold, fontSize: 14, marginRight: 8, fontWeight: '700' },
  featureText: { flex: 1, fontSize: 13, color: COLORS.charcoal, lineHeight: 18 },

  // Tab bar
  tabBar: {
    flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#E5E5E0', backgroundColor: COLORS.white,
    paddingTop: 8, paddingBottom: 10,
  },
  tabButton: { flex: 1, alignItems: 'center' },
  tabIcon: { fontSize: 20, opacity: 0.4, marginBottom: 2 },
  tabLabel: { fontSize: 11, color: COLORS.charcoal, opacity: 0.6 },
  tabLabelActive: { color: COLORS.forest, fontWeight: '700', opacity: 1 },
});