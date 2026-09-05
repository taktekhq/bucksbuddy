import Svg, { Path } from "react-native-svg";
import type { StyleProp, ViewStyle } from "react-native";

import { buildAreaPath, SPARKLINE_VIEW_BOX } from "@bucksbuddy/core/sparkline";

// Native counterpart to src/components/ui/SparkArea.tsx — same path math
// (@bucksbuddy/core/sparkline), rendered with react-native-svg instead of a
// plain <svg>.
type Props = {
  values: number[];
  /**
   * Line color. Omit it for a fill-only wash — as a faded backdrop, the area
   * silhouette reads soft where a crisp line would read jagged.
   */
  stroke?: string;
  fill: string;
  style?: StyleProp<ViewStyle>;
};

export function SparkArea({ values, stroke, fill, style }: Props) {
  const paths = buildAreaPath(values);
  if (!paths) return null;
  return (
    <Svg viewBox={SPARKLINE_VIEW_BOX} preserveAspectRatio="none" style={style}>
      <Path d={paths.area} fill={fill} />
      {stroke && (
        <Path
          d={paths.line}
          fill="none"
          stroke={stroke}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          // The svg is stretched non-uniformly; keep the stroke width honest.
          vectorEffect="non-scaling-stroke"
        />
      )}
    </Svg>
  );
}
