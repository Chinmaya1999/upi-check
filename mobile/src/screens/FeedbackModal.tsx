import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, space, radius } from '../theme';
import { Button, Tap } from '../components/ui';
import { APP_VERSION } from '../config';
import * as api from '../data/api';

const CATS = [
  { id: 'idea', label: 'Idea', icon: 'bulb' },
  { id: 'bug', label: 'Problem', icon: 'bug' },
  { id: 'praise', label: 'Love it', icon: 'heart' },
  { id: 'other', label: 'Other', icon: 'chatbubble' },
] as const;
const MAX = 2000;

/** Free-text feedback + optional star rating. Goes to the Paisa team's admin dashboard. */
export function FeedbackModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [cat, setCat] = useState<(typeof CATS)[number]['id']>('idea');
  const [rating, setRating] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  useEffect(() => { if (visible) { setCat('idea'); setRating(null); setText(''); setErr(null); setSent(false); } }, [visible]);

  const submit = async () => {
    if (text.trim().length < 5) { setErr('Please write a few words so we can understand.'); return; }
    setBusy(true); setErr(null);
    try {
      const c = (Platform.constants ?? {}) as { Model?: string; Release?: string };
      await api.sendFeedback({ category: cat, rating, message: text.trim(), appVersion: APP_VERSION, device: `${Platform.OS} ${c.Release ?? Platform.Version}${c.Model ? ` · ${c.Model}` : ''}` });
      setSent(true);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: insets.top + 8, paddingHorizontal: space.lg, paddingBottom: 8, gap: 12 }}>
          <Tap onPress={onClose} label="Close" style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="close" size={22} color={colors.text} />
          </Tap>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 }}>Send feedback</Text>
        </View>

        {sent ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: 16 }}>
            <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: colors.income + '22', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="checkmark" size={46} color={colors.income} />
            </View>
            <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800', textAlign: 'center' }}>Thank you!</Text>
            <Text style={{ color: colors.textMuted, fontSize: 15.5, lineHeight: 23, textAlign: 'center' }}>Your feedback reached the Paisa team. It helps us make the app better for everyone.</Text>
            <View style={{ alignSelf: 'stretch', marginTop: 8 }}><Button title="Done" onPress={onClose} /></View>
          </View>
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.lg, paddingBottom: insets.bottom + 32, gap: space.lg }}>
            <Text style={{ color: colors.textMuted, fontSize: 15, lineHeight: 22 }}>How is Paisa working for you? Share an idea, report a problem, or tell us what you love.</Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {CATS.map((c) => {
                const on = cat === c.id;
                return (
                  <Tap key={c.id} onPress={() => setCat(c.id)} label={c.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 40, borderRadius: 20, backgroundColor: on ? colors.brand : colors.card, borderWidth: 1, borderColor: on ? colors.brand : colors.border }}>
                    <Ionicons name={c.icon as never} size={16} color={on ? colors.onBrand : colors.textMuted} />
                    <Text style={{ color: on ? colors.onBrand : colors.text, fontWeight: '700' }}>{c.label}</Text>
                  </Tap>
                );
              })}
            </View>

            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.text, fontWeight: '600' }}>Your experience <Text style={{ color: colors.textMuted, fontWeight: '400' }}>(optional)</Text></Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Tap key={n} onPress={() => setRating(rating === n ? null : n)} label={`${n} star${n > 1 ? 's' : ''}`} style={{ padding: 2 }}>
                    <Ionicons name={rating && n <= rating ? 'star' : 'star-outline'} size={36} color={rating && n <= rating ? '#F59E0B' : colors.textMuted} />
                  </Tap>
                ))}
              </View>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.text, fontWeight: '600' }}>{cat === 'bug' ? 'What went wrong?' : cat === 'praise' ? 'What do you like?' : 'What would you like to tell us?'}</Text>
              <TextInput value={text} onChangeText={(t) => setText(t.slice(0, MAX))} multiline textAlignVertical="top" accessibilityLabel="Feedback message"
                placeholder={cat === 'bug' ? 'Describe what happened and where in the app…' : 'Write here…'} placeholderTextColor={colors.textMuted}
                style={{ minHeight: 160, backgroundColor: colors.card, borderRadius: radius.md, padding: 14, color: colors.text, fontSize: 16, lineHeight: 23, borderWidth: 1.5, borderColor: colors.border }} />
              <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: 'right' }}>{text.length}/{MAX}</Text>
            </View>

            <Text style={{ color: colors.textMuted, fontSize: 12.5, lineHeight: 18 }}>
              We attach your name, app version and phone model to help us follow up. Please don’t include passwords or card numbers.
            </Text>
            {!!err && <Text style={{ color: colors.expense, fontSize: 14 }} accessibilityLiveRegion="polite">{err}</Text>}
            <Button title={busy ? 'Sending…' : 'Send feedback'} disabled={busy || text.trim().length < 5} onPress={submit} />
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}
