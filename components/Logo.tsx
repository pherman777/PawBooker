import Svg, { Ellipse, Path } from 'react-native-svg';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Colors } from '@/constants/theme';

type Props = {
  /** Overall footprint in dp — the tile (or the bare mark, when tile={false}). */
  size?: number;
  /** Render the mark on a rounded sage tile, like the app icon. */
  tile?: boolean;
  /** Mark color when tile is false. Ignored when tile is true. */
  color?: string;
  style?: StyleProp<ViewStyle>;
};

// "Confirmed Paw" mark: a paw print with a checkmark cut into the palm,
// drawn on a 100x100 viewBox. Toe/palm proportions and the checkmark path
// come from the approved logo exploration (2026-07-27).
export function Logo({ size = 40, tile = true, color = Colors.light.tint, style }: Props) {
  const markBox = tile ? size * 0.6 : size;
  // The mark needs to contrast against the sage tile behind it (when
  // tiled) - `text` (dark ink) does that; `background` used to be dark too
  // (the old all-dark theme) but is now light and would nearly disappear.
  const markColor = tile ? Colors.light.text : color;
  const checkColor = tile ? Colors.light.tint : Colors.light.text;

  const mark = (
    <Svg width={markBox} height={markBox} viewBox="0 0 100 100">
      <Ellipse cx={50} cy={63} rx={23} ry={17} fill={markColor} />
      <Ellipse cx={23} cy={40} rx={10.5} ry={13.5} rotation={-24} origin="23, 40" fill={markColor} />
      <Ellipse cx={39} cy={25} rx={10.5} ry={14} rotation={-8} origin="39, 25" fill={markColor} />
      <Ellipse cx={61} cy={25} rx={10.5} ry={14} rotation={8} origin="61, 25" fill={markColor} />
      <Ellipse cx={77} cy={40} rx={10.5} ry={13.5} rotation={24} origin="77, 40" fill={markColor} />
      <Path
        d="M40 66 L47 73 L61 58"
        stroke={checkColor}
        strokeWidth={7}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );

  if (!tile) return mark;

  return (
    <View style={[styles.tile, { width: size, height: size, borderRadius: size * 0.22 }, style]}>
      {mark}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: Colors.light.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
