import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  Alert,
  SectionList,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type SectionListProps,
  type SectionListRenderItem,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  LinearTransition,
  interpolateColor,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type ScrollHandlerProcessed,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Press } from "@/components/ui/Press";
import { COLUMN_MAX_WIDTH, GradientLayer, ScreenFrame, type Gradient } from "@/components/ui/Screen";
import { NavHeader } from "@/components/ui/NavHeader";
import { HistoryStack } from "@/components/HistoryStack";
import { DayHeader, ROW_GAP, SECTION_GAP, toSections, type TimelineSection } from "@/components/HistoryTimeline";
import { MonthSwitcher } from "@/components/ui/MonthSwitcher";
import { useStore } from "@/lib/store";
import { navigate } from "@/lib/router";
import { requestEdit } from "@/lib/editIntent";
import { currentMonthRange, monthAnchor, monthLabel } from "@/lib/dates";
import { groupByCategory, groupByDay, type HistoryGroup } from "@/lib/history";
import { useHistoryGrouping, type HistoryGrouping } from "@/lib/useHistoryGrouping";
import posthog from "@/lib/posthog";
import { colors, motion, radius, shadows, text, weight, white } from "@/lib/theme";
import type { Transaction } from "@/types/db";

// The full history in its own page — a deep, neutral-charcoal "rabbit hole"
// you drop into to see everything, deliberately distinct from the bright daily
// tracker and from the Safe's green vault. The page scrolls naturally. Editing
// happens back on Home (where the composer lives), so tapping edit stashes the
// target and navigates there.
//
// Two ways to read it, switchable from the header (remembered across sessions):
// a day-by-day Timeline (the default) or the old all-time By-category stacks.
//
// Both views share one virtualized SectionList (PORTING.md §5): the Timeline's
// sections are the days, By category is a single headerless section; the nav bar, the
// segmented control (and the month switcher) ride along as the list header.
const RABBIT_HOLE: Gradient = {
  colors: ["#2C2C2E", "#232325", "#1C1C1E"],
  stops: [0, 220, 460],
  floor: "#1C1C1E",
};

// Reanimated's own Animated.SectionList reserves `CellRendererComponent` for
// itself, so wrap the plain list: the same UI-thread `onScroll`, our cells.
type AnimatedListProps<P> = Omit<P, "onScroll"> & { onScroll?: ScrollHandlerProcessed };
const AnimatedSectionList = Animated.createAnimatedComponent(
  SectionList,
) as unknown as ComponentType<
  AnimatedListProps<SectionListProps<HistoryGroup, TimelineSection>>
>;

const TABS = [
  ["timeline", "Timeline"],
  ["category", "By category"],
] as const;

const goHome = () => navigate("/");

export function History() {
  const { transactions, deleteTransaction } = useStore();
  const [grouping, setGrouping, hydrated] = useHistoryGrouping();
  const days = useMemo(() => groupByDay(transactions), [transactions]);
  const sections = useMemo(() => toSections(days), [days]);
  const insets = useSafeAreaInsets();

  // The "By category" view is scoped to one month at a time, paged with the
  // switcher (this month, last month, or further back). The timeline stays
  // all-time. Default to the current month.
  const [monthOffset, setMonthOffset] = useState(0);
  const anchor = useMemo(() => monthAnchor(monthOffset), [monthOffset]);
  const monthTx = useMemo(() => {
    const { from, to } = currentMonthRange(anchor);
    return transactions.filter((t) => {
      const d = new Date(t.occurred_at);
      return d >= from && d < to;
    });
  }, [transactions, anchor]);
  const groups = useMemo(() => groupByCategory(monthTx), [monthTx]);
  const hasOlder = useMemo(() => {
    const { from } = currentMonthRange(anchor);
    return transactions.some((t) => new Date(t.occurred_at) < from);
  }, [transactions, anchor]);

  // Which stacks are open. On the web each stack owns this; here the list is
  // virtualized and a cell scrolled far away is unmounted, so the page keeps
  // the set — otherwise a stack you opened would fold back up behind your
  // back. Switching views remounts everything on the web, so reset there.
  const [openKeys, setOpenKeys] = useState<ReadonlySet<string>>(() => new Set());
  const { CellRenderer, cellTick, withCellAnimation } = useAnimatedCells();
  const openStack = useCallback(
    (key: string) =>
      withCellAnimation(() => setOpenKeys((prev) => new Set(prev).add(key))),
    [withCellAnimation],
  );
  const changeGrouping = useCallback(
    (value: HistoryGrouping) => {
      setGrouping(value);
      setOpenKeys(new Set());
    },
    [setGrouping],
  );

  // The gradient scrolls with the content, like the web's `<main>` background,
  // and the frame's floor shows through on an overscroll bounce.
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  const gradientStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -scrollY.value }],
  }));

  const handleEdit = useCallback((tx: Transaction) => {
    requestEdit(tx.id);
    navigate("/");
  }, []);

  // Keep the row callbacks stable across store updates so a delete doesn't
  // re-render every memoized row in the list.
  const deleteRef = useRef(deleteTransaction);
  deleteRef.current = deleteTransaction;
  const handleDelete = useCallback(
    (tx: Transaction) => {
      Alert.alert("Delete this entry?", undefined, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            withCellAnimation(() => {
              void (async () => {
                await deleteRef.current(tx.id);
                posthog.capture("transaction_deleted", {
                  category: tx.category,
                  is_income: tx.is_income,
                });
              })();
            }),
        },
      ]);
    },
    [withCellAnimation],
  );

  // One list for both views, so the header (and its sliding segment) stays
  // mounted across a switch and only the data changes. By category rides in a
  // single headerless section. Until the saved preference is read, no rows:
  // the right view is the first one that paints.
  const isTimeline = grouping === "timeline";
  const listSections = useMemo<TimelineSection[]>(() => {
    if (!hydrated || transactions.length === 0) return [];
    if (isTimeline) return sections;
    if (groups.length === 0) return [];
    return [
      { key: MONTH_SECTION, label: "", totalCents: 0, masked: false, groups, data: groups, first: true },
    ];
  }, [hydrated, transactions.length, isTimeline, sections, groups]);

  // Switching views replaces the content wholesale: start it from the top and
  // keep the gradient aligned with it. (A Reanimated-wrapped list exposes no
  // scroll methods, so this only resets the gradient's offset; the list is
  // already at the top because its data changed.)
  useEffect(() => {
    scrollY.value = 0;
  }, [grouping, scrollY]);

  const renderGroup = useCallback<SectionListRenderItem<HistoryGroup, TimelineSection>>(
    ({ item }) => {
      const key = stackKey(item);
      return (
        <HistoryStack
          group={item}
          stackKey={key}
          open={openKeys.has(key)}
          onOpen={openStack}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      );
    },
    [openKeys, openStack, handleEdit, handleDelete],
  );
  const extraData = useMemo(() => ({ openKeys, cellTick }), [openKeys, cellTick]);
  const showTabs = hydrated && transactions.length > 0;

  return (
    <ScreenFrame gradient={RABBIT_HOLE} statusBar="light">
      <Animated.View pointerEvents="none" style={[styles.gradient, gradientStyle]}>
        <GradientLayer gradient={RABBIT_HOLE} />
      </Animated.View>

      <AnimatedSectionList
        style={styles.list}
        contentContainerStyle={[
          styles.content,
          { paddingTop: 16 + insets.top, paddingBottom: 32 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
        initialNumToRender={12}
        windowSize={7}
        onScroll={onScroll}
        scrollEventThrottle={16}
        CellRendererComponent={CellRenderer}
        extraData={extraData}
        sections={listSections}
        renderItem={renderGroup}
        renderSectionHeader={renderSectionHeader}
        keyExtractor={stackKey}
        stickySectionHeadersEnabled={false}
        ItemSeparatorComponent={RowGap}
        ListHeaderComponent={
          <Header
            grouping={showTabs ? grouping : undefined}
            onGrouping={changeGrouping}
            gapBelow={isTimeline ? SECTION_GAP : 12}
          >
            {showTabs && !isTimeline && (
              <MonthSwitcher
                label={monthLabel(anchor)}
                onPrev={() => setMonthOffset((o) => o - 1)}
                onNext={() => setMonthOffset((o) => Math.min(o + 1, 0))}
                canPrev={hasOlder}
                canNext={monthOffset < 0}
              />
            )}
          </Header>
        }
        ListEmptyComponent={
          !hydrated ? null : transactions.length === 0 ? (
            <Text style={styles.empty}>Nothin' here yet, Doc.</Text>
          ) : (
            <Text style={styles.empty}>Nothin' logged this month, Doc.</Text>
          )
        }
      />
    </ScreenFrame>
  );
}

const MONTH_SECTION = "month";
// Stable across deletes: a run is identified by its direction/category and its
// newest row, never by its position in the day — so a delete above it neither
// re-keys it nor hands its open state to a neighbour.
const stackKey = (g: HistoryGroup) => `${g.key}:${g.rows[0].id}`;
const renderSectionHeader = ({ section }: { section: TimelineSection }) =>
  section.key === MONTH_SECTION ? null : <DayHeader day={section} first={section.first} />;
// gap-1.5 between rows (the section header carries its own gap).
const RowGap = () => <View style={{ height: ROW_GAP }} />;

// Everything above the rows: the dark nav, the segmented control (only when
// there's history to group) and, for By category, the month switcher. The
// column's `gap-5` runs between them; `gapBelow` is the gap to what follows
// (`gap-5` to a day section, `gap-3` to the category stacks).
const Header = memo(function Header({
  grouping,
  onGrouping,
  gapBelow,
  children,
}: {
  grouping?: HistoryGrouping;
  onGrouping?: (value: HistoryGrouping) => void;
  gapBelow: number;
  children?: ReactNode;
}) {
  return (
    <View style={[styles.header, { marginBottom: gapBelow }]}>
      {/* Dark nav: back chevron + centered title. */}
      <NavHeader title="All History" onBack={goHome} dark />
      {grouping && onGrouping && <GroupingTabs value={grouping} onChange={onGrouping} />}
      {children}
    </View>
  );
});

// Segmented control: flip between the day-by-day timeline and the all-time
// per-category stacks. The white segment slides between the tabs and the
// labels cross-fade over the web's `transition` (150ms).
function GroupingTabs({
  value,
  onChange,
}: {
  value: HistoryGrouping;
  onChange: (value: HistoryGrouping) => void;
}) {
  const [width, setWidth] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width), []);
  // 0 = Timeline, 1 = By category.
  const progress = useSharedValue(value === "category" ? 1 : 0);
  useEffect(() => {
    progress.value = withTiming(value === "category" ? 1 : 0, { duration: motion.transition });
  }, [progress, value]);
  const segment = Math.max(0, (width - 4) / 2); // p-0.5 either side
  const highlight = useAnimatedStyle(
    () => ({ transform: [{ translateX: progress.value * segment }] }),
    [segment],
  );

  return (
    <View style={styles.tabs} accessibilityRole="tablist" onLayout={onLayout}>
      <Animated.View pointerEvents="none" style={[styles.tabHighlight, { width: segment }, highlight]} />
      {TABS.map(([tab, label], i) => (
        <Press
          key={tab}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === tab }}
          onPress={() => onChange(tab)}
          style={styles.tab}
        >
          <TabLabel progress={progress} index={i}>
            {label}
          </TabLabel>
        </Press>
      ))}
    </View>
  );
}

function TabLabel({
  progress,
  index,
  children,
}: {
  progress: { value: number };
  index: number;
  children: string;
}) {
  // text-[#1C1C1E] when this tab is active, text-white/55 otherwise.
  const style = useAnimatedStyle(() => ({
    color: interpolateColor(
      progress.value,
      [0, 1],
      index === 0 ? [colors.label, white(0.55)] : [white(0.55), colors.label],
    ),
  }));
  return <Animated.Text style={[styles.tabText, style]}>{children}</Animated.Text>;
}

// Cells animate their layout (LinearTransition, 220ms) only around a change we
// make on purpose — a stack expanding, a row deleted — so the rows below slide
// out of the way like the web's height tween, while ordinary scrolling and the
// list's own re-measuring never wobble. `withCellAnimation` arms the cells on
// one render, applies the change on the next commit, and disarms afterwards.
const CELL_LAYOUT = LinearTransition.duration(motion.pop);

type CellProps = {
  children?: ReactNode;
  onLayout?: (e: LayoutChangeEvent) => void;
  style?: StyleProp<ViewStyle>;
};

function useAnimatedCells() {
  const armed = useRef(false);
  const pending = useRef<(() => void) | null>(null);
  const disarm = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cellTick, setCellTick] = useState(0);

  const CellRenderer = useMemo(
    () =>
      function AnimatedCell({ children, onLayout, style }: CellProps) {
        return (
          <Animated.View layout={armed.current ? CELL_LAYOUT : undefined} onLayout={onLayout} style={style}>
            {children}
          </Animated.View>
        );
      },
    [],
  );

  const withCellAnimation = useCallback((change: () => void) => {
    pending.current = change;
    armed.current = true;
    if (disarm.current) clearTimeout(disarm.current);
    setCellTick((t) => t + 1);
  }, []);

  // The arming render has committed (and Reanimated has registered the cells'
  // layout transition); now make the change so the next layout animates.
  useEffect(() => {
    const change = pending.current;
    if (!change) return;
    pending.current = null;
    change();
    disarm.current = setTimeout(() => {
      disarm.current = null;
      armed.current = false;
      setCellTick((t) => t + 1);
    }, motion.pop + 100);
  }, [cellTick]);

  useEffect(
    () => () => {
      if (disarm.current) clearTimeout(disarm.current);
    },
    [],
  );

  return { CellRenderer, cellTick, withCellAnimation };
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  gradient: { position: "absolute", left: 0, right: 0, top: 0, height: 460 },
  // mx-auto max-w-md px-4 pb-[calc(2rem+safe)] pt-[calc(1rem+safe)]
  content: {
    width: "100%",
    maxWidth: COLUMN_MAX_WIDTH,
    alignSelf: "center",
    paddingHorizontal: 16,
  },
  // gap-5 between the nav, the tabs and the month switcher.
  header: { gap: SECTION_GAP },
  // py-10 text-center text-white/45
  empty: {
    paddingVertical: 40,
    textAlign: "center",
    ...text.base,
    color: white(0.45),
  },
  // flex rounded-pill bg-white/10 p-0.5 text-xs font-semibold
  tabs: {
    position: "relative",
    flexDirection: "row",
    borderRadius: radius.pill,
    backgroundColor: white(0.1),
    padding: 2,
  },
  // bg-white shadow-segment, sliding under the active tab.
  tabHighlight: {
    position: "absolute",
    top: 2,
    bottom: 2,
    left: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    boxShadow: shadows.segment,
  },
  // press flex-1 rounded-pill px-3 py-1.5
  tab: {
    flex: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: "center",
  },
  tabText: { ...text.xs, fontWeight: weight.semibold },
});
