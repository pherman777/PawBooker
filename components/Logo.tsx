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

export function Logo({ size = 40, tile = true, color = Colors.light.tint, style }: Props) {
  const markBox = tile ? size * 0.58 : size;
  const markColor = tile ? Colors.light.background : color;

  const palmW = markBox * 0.54;
  const palmH = markBox * 0.4;
  const toeOuterW = markBox * 0.21;
  const toeOuterH = markBox * 0.27;
  const toeInnerW = markBox * 0.23;
  const toeInnerH = markBox * 0.31;

  const mark = (
    <View style={{ width: markBox, height: markBox }}>
      <View
        style={{
          position: 'absolute',
          backgroundColor: markColor,
          width: palmW,
          height: palmH,
          left: markBox * 0.23,
          top: markBox * 0.5,
          borderRadius: palmH / 2,
        }}
      />
      <View
        style={{
          position: 'absolute',
          backgroundColor: markColor,
          width: toeOuterW,
          height: toeOuterH,
          left: markBox * 0.05,
          top: markBox * 0.2,
          borderRadius: toeOuterW / 2,
          transform: [{ rotate: '-20deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          backgroundColor: markColor,
          width: toeInnerW,
          height: toeInnerH,
          left: markBox * 0.27,
          top: markBox * 0.04,
          borderRadius: toeInnerW / 2,
          transform: [{ rotate: '-7deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          backgroundColor: markColor,
          width: toeInnerW,
          height: toeInnerH,
          left: markBox * 0.51,
          top: markBox * 0.04,
          borderRadius: toeInnerW / 2,
          transform: [{ rotate: '7deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          backgroundColor: markColor,
          width: toeOuterW,
          height: toeOuterH,
          left: markBox * 0.74,
          top: markBox * 0.2,
          borderRadius: toeOuterW / 2,
          transform: [{ rotate: '20deg' }],
        }}
      />
      {tile && (
        <>
          <View
            style={{
              position: 'absolute',
              backgroundColor: Colors.light.tint,
              width: markBox * 0.2,
              height: markBox * 0.07,
              left: markBox * 0.4,
              top: markBox * 0.66,
              borderRadius: 3,
              transform: [{ rotate: '38deg' }],
            }}
          />
          <View
            style={{
              position: 'absolute',
              backgroundColor: Colors.light.tint,
              width: markBox * 0.12,
              height: markBox * 0.07,
              left: markBox * 0.34,
              top: markBox * 0.63,
              borderRadius: 3,
              transform: [{ rotate: '-38deg' }],
            }}
          />
        </>
      )}
    </View>
  );

  if (!tile) return mark;

  return (
    <View
      style={[
        styles.tile,
        { width: size, height: size, borderRadius: size * 0.22 },
        style,
      ]}>
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
