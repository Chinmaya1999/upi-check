import React from 'react';
import { Image, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { useAvatar } from '../data/avatar';

/** Profile photo, or the first letter of the name on the brand colour when none is set. */
export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const { colors } = useTheme();
  const uri = useAvatar();
  if (uri) return <Image source={{ uri }} accessibilityLabel="Profile photo" style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.card }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.onBrand, fontWeight: '800', fontSize: size * 0.4 }}>{name[0]?.toUpperCase()}</Text>
    </View>
  );
}
