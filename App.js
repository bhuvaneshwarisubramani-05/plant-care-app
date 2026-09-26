/*
  SMART PLANT CARE SYSTEM — React Native Dashboard (single screen)
  --------------------------------------------------------------------
  Talks directly to your ESP32's local web server — no backend needed.

  HOW TO RUN:
    1. Install Expo Go on your phone (from Play Store / App Store).
    2. On your computer: npx create-expo-app plant-care-app
    3. Replace the contents of App.js with this entire file.
    4. cd plant-care-app && npx expo start
    5. Scan the QR code with Expo Go.
    6. Make sure your PHONE is connected to the ESP32's WiFi
       ("PlantCareBot") before opening the app.

  If your ESP32's IP is different from 192.168.4.1, change ESP32_IP below.
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

const COLORS = {
  forest: '#1F6F5C',
  darkGreen: '#1B3A2B',
  moss: '#6E9B4E',
  mossLight: '#97BC62',
  marigold: '#F2A541',
  cream: '#F7F7F2',
  charcoal: '#2B2B26',
  white: '#FFFFFF',
  danger: '#D9534F',
};

const MOOD_EMOJI = {
  Happy: '😊',
  Thirsty: '😰',
  TooHot: '🥵',
  NeedsLight: '🌑',
};

const MOOD_LABEL = {
  Happy: 'Happy',
  Thirsty: 'Thirsty',
  TooHot: 'Too Hot',
  NeedsLight: 'Needs Light',
};

export default function App() {
  const [data, setData] = useState(null);
  const [connected, setConnected] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [watering, setWatering] = useState(false);
  const [wateredJustNow, setWateredJustNow] = useState(false);

  const bounceAnim = useRef(new Animated.Value(0)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;
  const moistureAnim = useRef(new Animated.Value(0)).current;

  // Gentle looping float animation for the mood emoji
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
      Animated.timing(moistureAnim, {
        toValue: json.moisture,
        duration: 500,
        useNativeDriver: false,
      }).start();
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
    } catch (err) {
      // silently fail - connection dot already shows offline state
    } finally {
      setTimeout(() => {
        setWatering(false);
        fetchStatus();
      }, 3200);
    }
  };

  const toggleMode = async (value) => {
    setData((prev) => (prev ? { ...prev, autoMode: value } : prev)); // optimistic update
    try {
      await fetch(`http://${ESP32_IP}/mode?auto=${value ? 1 : 0}`);
    } catch (err) {
      // will resync on next poll
    }
  };

  const mood = data?.mood || 'Happy';
  const moistureWidth = moistureAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.darkGreen} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.forest} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>🌱 My Plant</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: connected ? COLORS.moss : '#B0B0B0' }]} />
            <Text style={styles.statusText}>{connected ? 'Connected' : 'Offline'}</Text>
          </View>
        </View>

        {/* Hero mood section */}
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
              <Text style={styles.predictionText}>
                💧 Will need water in ~{data.predictedHours.toFixed(1)}h
              </Text>
            </View>
          )}
        </View>

        {/* Moisture progress */}
        <View style={styles.moistureCard}>
          <View style={styles.moistureHeaderRow}>
            <Text style={styles.moistureLabel}>Soil Moisture</Text>
            <Text style={styles.moistureValue}>{data?.moisture ?? '--'}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, { width: moistureWidth }]} />
          </View>
        </View>

        {/* Stat grid */}
        <View style={styles.statGrid}>
          <StatCard icon="🌡️" label="Temperature" value={data ? `${data.temperature.toFixed(1)}°C` : '--'} />
          <StatCard icon="💦" label="Humidity" value={data ? `${data.humidity.toFixed(0)}%` : '--'} />
          <StatCard icon="☀️" label="Light" value={data ? `${data.light}%` : '--'} />
          <StatCard icon="⚙️" label="Mode" value={data?.autoMode ? 'Auto' : 'Manual'} />
        </View>

        {/* Mode toggle */}
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Auto-Watering</Text>
          <Switch
            value={!!data?.autoMode}
            onValueChange={toggleMode}
            trackColor={{ false: '#D0D0D0', true: COLORS.mossLight }}
            thumbColor={COLORS.forest}
          />
        </View>

        {/* Water Now button */}
        <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
          <TouchableOpacity
            style={[styles.waterButton, watering && styles.waterButtonDisabled]}
            onPress={handleWaterNow}
            disabled={watering}
            activeOpacity={0.8}
          >
            {watering ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={styles.waterButtonText}>{wateredJustNow ? '✓ Watered!' : '💧 Water Now'}</Text>
            )}
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
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

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.cream },
  scrollContent: { padding: 20, paddingBottom: 40 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: COLORS.darkGreen },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  statusText: { fontSize: 13, color: COLORS.charcoal },

  heroCard: {
    backgroundColor: COLORS.forest,
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  moodEmoji: { fontSize: 72, marginBottom: 4 },
  moodLabel: { fontSize: 20, fontWeight: '700', color: COLORS.white, marginBottom: 14 },
  speechBubble: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  speechText: { color: COLORS.white, fontSize: 14, textAlign: 'center', fontStyle: 'italic' },
  predictionBanner: {
    marginTop: 14,
    backgroundColor: 'rgba(242,165,65,0.18)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  predictionText: { color: COLORS.marigold, fontWeight: '700', fontSize: 13 },

  moistureCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  moistureHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  moistureLabel: { fontSize: 14, color: COLORS.charcoal, fontWeight: '600' },
  moistureValue: { fontSize: 14, color: COLORS.forest, fontWeight: '700' },
  progressTrack: { height: 10, backgroundColor: '#E7EDE8', borderRadius: 5, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: COLORS.moss, borderRadius: 5 },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 16 },
  statCard: {
    width: '48%',
    backgroundColor: COLORS.white,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  statIcon: { fontSize: 24, marginBottom: 6 },
  statValue: { fontSize: 18, fontWeight: '700', color: COLORS.darkGreen },
  statLabel: { fontSize: 12, color: COLORS.charcoal, marginTop: 2 },

  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 18,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: COLORS.charcoal },

  waterButton: {
    backgroundColor: COLORS.marigold,
    borderRadius: 18,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: COLORS.marigold,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  waterButtonDisabled: { backgroundColor: '#E0B370' },
  waterButtonText: { color: COLORS.white, fontSize: 17, fontWeight: '700' },
});