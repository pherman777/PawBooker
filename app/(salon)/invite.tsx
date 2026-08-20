import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Colors } from '@/constants/theme';
import { notify } from '@/utils/confirm';
import { supabase } from '@/services/supabase';
import { useAuth } from '@/services/auth-context';
import { webContentWidth } from '@/constants/webLayout';
import { webFlushScroll } from '@/constants/webScroll';

export default function InviteScreen() {
  const router = useRouter();
  const { groomerProfile } = useAuth();
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!groomerProfile) return;
      const { data } = await supabase.from('groomers').select('invite_code').eq('id', groomerProfile.id).single();
      if (cancelled) return;
      setCode(data?.invite_code ?? null);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [groomerProfile]);

  async function handleShare() {
    if (!code) return;
    try {
      await Share.share({
        message: `Book your pet's grooming with ${groomerProfile?.name ?? 'me'} on PawBooker! Download the app, then enter my invite code ${code} in Profile so we stay connected. https://paw-booker.com`,
      });
    } catch {
      notify('Could not open share', 'Try again in a moment.');
    }
  }

  return (
    <SafeAreaView style={[styles.container, webContentWidth('form')]} edges={['top', 'bottom']}>
      <View style={styles.topRow}>
        <Text style={styles.backLink} onPress={() => router.back()}>
          ← Back
        </Text>
      </View>
      <ScrollView style={webFlushScroll} showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, webContentWidth('form')]}>
        <Text style={styles.title}>Invite your customers</Text>
        <Text style={styles.subtitle}>
          Bring your existing clients onto PawBooker with your personal code. Customers who join with
          your code are yours — no acquisition fee, ever. (New customers who find you through the app&apos;s
          search have a one-time 5% fee on their first booking.)
        </Text>

        {loading ? (
          <ActivityIndicator style={styles.loading} color={Colors.light.tint} />
        ) : (
          <>
            <View style={styles.codeCard}>
              <Text style={styles.codeLabel}>Your invite code</Text>
              <Text style={styles.code}>{code ?? '—'}</Text>
            </View>

            <Button label="Share invite" onPress={handleShare} disabled={!code} style={styles.shareButton} />

            <Text style={styles.howTo}>
              Tell customers to download PawBooker, then open Profile → &ldquo;Have an invite code?&rdquo; and enter{' '}
              <Text style={styles.howToCode}>{code}</Text>.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
    padding: 20,
  },
  topRow: {
    flexDirection: 'row',
  },
  backLink: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.tint,
  },
  content: {
    paddingTop: 12,
    paddingBottom: 40,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.light.text,
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 24,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.textMuted,
  },
  loading: {
    marginTop: 40,
  },
  codeCard: {
    alignItems: 'center',
    paddingVertical: 28,
    borderRadius: 16,
    backgroundColor: Colors.light.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 2,
  },
  codeLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.textMuted,
    marginBottom: 8,
  },
  code: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 4,
    color: Colors.light.text,
  },
  shareButton: {
    marginTop: 20,
    width: '100%',
  },
  howTo: {
    marginTop: 24,
    fontSize: 14,
    lineHeight: 21,
    color: Colors.light.textMuted,
  },
  howToCode: {
    fontWeight: '700',
    color: Colors.light.text,
  },
});
