import { Ionicons } from '@expo/vector-icons';
import { Link, usePathname } from 'expo-router';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { webContentWidth } from '@/constants/webLayout';
import { Logo } from '@/components/Logo';

type NavLink = {
  href: '/(salon)' | '/(salon)/business-info' | '/(salon)/services' | '/(salon)/staff' | '/(salon)/supplies' | '/(salon)/insights';
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  match: string;
};

const LINKS: NavLink[] = [
  { href: '/(salon)', label: 'Dashboard', icon: 'grid-outline', match: '' },
  { href: '/(salon)/business-info', label: 'Business info', icon: 'briefcase-outline', match: 'business-info' },
  { href: '/(salon)/services', label: 'Services', icon: 'cut-outline', match: 'services' },
  { href: '/(salon)/staff', label: 'Staff', icon: 'people-outline', match: 'staff' },
  { href: '/(salon)/supplies', label: 'Supplies', icon: 'cube-outline', match: 'supplies' },
  { href: '/(salon)/insights', label: 'Insights', icon: 'stats-chart-outline', match: 'insights' },
];

// The salon side had no persistent navigation at all before this - every
// screen was an island reachable only through the per-screen hamburger
// menu (still there, still used for the long tail of settings screens plus
// sign-out/delete-account). Web-only: native keeps using the hamburger menu
// exclusively, since a persistent top bar isn't a native app pattern.
export function SalonWebNav() {
  if (Platform.OS !== 'web') return null;
  const pathname = usePathname();

  return (
    <View style={styles.bar}>
      <View style={[styles.inner, webContentWidth('dashboard')]}>
        <Logo size={26} tile={false} />
        <View style={styles.links}>
          {LINKS.map((link) => {
            const active = link.match ? pathname.includes(link.match) : pathname === '/' || pathname === '/(salon)';
            return (
              <Link key={link.href} href={link.href} style={[styles.link, active && styles.linkActive]}>
                <Ionicons
                  name={link.icon}
                  size={15}
                  color={active ? Colors.light.tint : Colors.light.textMuted}
                  style={styles.linkIcon}
                />
                <Text style={[styles.linkText, active && styles.linkTextActive]}>{link.label}</Text>
              </Link>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'sticky',
    top: 0,
    zIndex: 10,
    backgroundColor: Colors.light.band,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.light.border,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 28,
    paddingHorizontal: 28,
    height: 60,
  },
  links: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  linkActive: {
    backgroundColor: Colors.light.surface,
  },
  linkIcon: {
    marginTop: -1,
  },
  linkText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.textMuted,
  },
  linkTextActive: {
    color: Colors.light.text,
  },
});
