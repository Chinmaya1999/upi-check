import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, radius } from '../theme';

/** Shown next to every emailed-code step: the message often lands in Spam / Promotions the first time. */
export function SpamHint({ email }: { email?: string }) {
  const { colors } = useTheme();
  return (
    <View accessible style={{ flexDirection: 'row', gap: 12, backgroundColor: colors.warning + '1F', borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: colors.warning + '55' }}>
      <Ionicons name="alert-circle" size={22} color={colors.warning} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>Can’t see the email?</Text>
        <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 2 }}>
          Look in your <Text style={{ fontWeight: '700', color: colors.text }}>Spam</Text> or <Text style={{ fontWeight: '700', color: colors.text }}>Promotions</Text> folder{email ? ` for a message to ${email}` : ''}. If it’s there, tap “Not spam” so future codes arrive in your inbox. The code is valid for 10 minutes.
        </Text>
      </View>
    </View>
  );
}
