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
  type SectionListProps,
  type SectionListRenderItem,
} from "react-native";
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type ScrollHandlerProcessed,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft } from "lucide-react-native";
import { Press } from "@/components/ui/Press";
import { GradientLayer, ScreenFrame } from "@/components/ui/Screen";
import { MonthSwitcher } from "@/components/ui/MonthSwitcher";
import { HistoryStack } from "@/components/HistoryStack";
import { DayHeader, toSections, type TimelineSection } from "@/components/HistoryTimeline";
import { useStore } from "@/lib/store";
import { navigate } from "@/lib/router";
import { requestEdit } from "@/lib/editIntent";
import { currentMonthRange, monthAnchor, monthLabel } from "@/lib/dates";
import { groupByCategory, groupByDay, type HistoryGroup } from "@/lib/history";
import { useHistoryGrouping, type HistoryGrouping } from "@/lib/useHistoryGrouping";
import posthog from "@/lib/posthog";
import { colors, RABBIT_HOLE } from "@/lib/theme";
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
// The one structural change from the web: this page can render 500 rows, so
// both views share a single virtualized SectionList (PORTING.md §5) instead of
// a mapped `<main>`. The Timeline's sections are the days; By category rides in
// one headerless section, so the nav, the segmented control and the month
// switcher stay mounted in the list header across a switch. The `<main>`'s own
// classes move onto the list's content container.

// pt-[calc(1rem+var(--safe-top))] / pb-[calc(2rem+var(--safe-bottom))]. A class
// can't add a safe-area inset to itself, so these are the two the web writes
// (1rem / 2rem) and the inset goes on top — the same split Screen makes.
const PAD_TOP = 16;
const PAD_BOTTOM = 32;

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

// The By-category view is one section with no header of its own.
const MONTH_SECTION = "month";

// Stable across deletes: a run is identified by its direction/category and its
// newest row, never by its position in the day — so a delete above it neither
// re-keys it nor hands its open state to a neighbour.
const stackKey = (g: HistoryGroup) => `${g.key}:${g.rows[0].id}`;

// `gap-1.5` between the rows of a section.
const RowGap = () => <View className="h-1.5" />;

// The day's `<header>`, plus the gaps the web gets from the flex columns:
// `gap-1.5` down to its rows, `gap-5` up to the previous day.
const renderSectionHeader = ({ section }: { section: TimelineSection }) =>
  section.key === MONTH_SECTION ? null : (
    <View className={section.first ? "mb-1.5" : "mb-1.5 mt-5"}>
      <DayHeader day={section} />
    </View>
  );

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
  const openStack = useCallback(
    (key: string) => setOpenKeys((prev) => new Set(prev).add(key)),
    [],
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
  const handleDelete = useCallback((tx: Transaction) => {
    // window.confirm("Delete this entry?")
    Alert.alert("Delete this entry?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            await deleteRef.current(tx.id);
            posthog.capture("transaction_deleted", {
              category: tx.category,
              is_income: tx.is_income,
            });
          })();
        },
      },
    ]);
  }, []);

  // One list for both views, so the header (and its segmented control) stays
  // mounted across a switch and only the data changes. By category rides in a
  // single headerless section. Until the saved preference is read, no rows:
  // the right view is the first one that paints.
  const isTimeline = grouping === "timeline";
  const listSections = useMemo<TimelineSection[]>(() => {
    if (!hydrated || transactions.length === 0) return [];
    if (isTimeline) return sections;
    if (groups.length === 0) return [];
    return [
      {
        key: MONTH_SECTION,
        label: "",
        totalCents: 0,
        masked: false,
        groups,
        data: groups,
        first: true,
      },
    ];
  }, [hydrated, transactions.length, isTimeline, sections, groups]);

  // Switching views replaces the content wholesale: the list is already back at
  // the top because its data changed, so this only realigns the gradient. (A
  // Reanimated-wrapped list exposes no scroll methods — never call
  // getScrollResponder/scrollTo on it.)
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

  const showTabs = hydrated && transactions.length > 0;

  return (
    <ScreenFrame gradient={RABBIT_HOLE} statusBar="light">
      {/* The web paints the gradient on the scrolling <main> and keeps a fixed
          floor behind it. ScreenFrame owns the floor; this layer is the
          gradient, moved by the scroll offset so it travels with the content.
          StyleSheet because a gradient layer is one of the three things a class
          can't express (PORTING.md §7). */}
      <Animated.View pointerEvents="none" style={[styles.gradient, gradientStyle]}>
        <GradientLayer gradient={RABBIT_HOLE} />
      </Animated.View>

      <AnimatedSectionList
        className="flex-1"
        // The web's <main>, minus the gaps (a list's children can't share one)
        // and the safe-area padding, which is added below. `grow` is min-h-full.
        contentContainerClassName="mx-auto w-full max-w-md grow px-4 text-white"
        contentContainerStyle={{
          paddingTop: PAD_TOP + insets.top,
          paddingBottom: PAD_BOTTOM + insets.bottom,
        }}
        showsVerticalScrollIndicator={false}
        initialNumToRender={12}
        windowSize={7}
        onScroll={onScroll}
        scrollEventThrottle={16}
        extraData={openKeys}
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
            // gap-5 down to a day section, gap-3 down to the category stacks.
            gapBelow={isTimeline ? "mb-5" : "mb-3"}
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
            <Text className="py-10 text-center text-white/45">Nothin' here yet, Doc.</Text>
          ) : (
            <Text className="py-10 text-center text-white/45">
              Nothin&apos; logged this month, Doc.
            </Text>
          )
        }
      />
    </ScreenFrame>
  );
}

// Everything above the rows: the dark nav, the segmented control (only when
// there's history to group) and, for By category, the month switcher. The
// column's `gap-5` runs between them; `gapBelow` is the gap to what follows.
const Header = memo(function Header({
  grouping,
  onGrouping,
  gapBelow,
  children,
}: {
  grouping?: HistoryGrouping;
  onGrouping: (value: HistoryGrouping) => void;
  gapBelow: string;
  children?: ReactNode;
}) {
  return (
    <View className={`flex flex-col gap-5 ${gapBelow}`}>
      {/* Dark nav: back chevron + centered title. */}
      <View className="relative flex flex-row items-center justify-center py-1">
        <Press
          onPress={goHome}
          accessibilityLabel="Back"
          className="absolute left-0 -m-2 p-2 text-carrot"
        >
          <ChevronLeft size={24} strokeWidth={2.5} color={colors.carrot} />
        </Press>
        <Text className="font-display text-base font-bold uppercase tracking-wide text-white/90">
          All History
        </Text>
      </View>

      {/* Segmented control: flip between the day-by-day timeline and the
          all-time per-category stacks. */}
      {grouping && (
        <View
          accessibilityRole="tablist"
          aria-label="Group history by"
          className="flex flex-row rounded-pill bg-white/10 p-0.5 text-xs font-semibold"
        >
          {TABS.map(([value, label]) => (
            <Press
              key={value}
              accessibilityRole="tab"
              accessibilityState={{ selected: grouping === value }}
              onPress={() => onGrouping(value)}
              className={`flex-1 rounded-pill px-3 py-1.5 transition-colors ${
                grouping === value
                  ? "bg-white text-[#1C1C1E] shadow-segment"
                  : "text-white/55"
              }`}
            >
              {/* Text doesn't inherit (PORTING.md §2a); `text-center` is what a
                  browser gives a <button> for free. */}
              <Text
                className={`text-center text-xs font-semibold ${
                  grouping === value ? "text-[#1C1C1E]" : "text-white/55"
                }`}
              >
                {label}
              </Text>
            </Press>
          ))}
        </View>
      )}

      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  // The gradient's own layer: absolutely positioned, as tall as the gradient's
  // last stop, so it can slide up behind the scrolling content.
  gradient: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: RABBIT_HOLE.stops[RABBIT_HOLE.stops.length - 1],
  },
});
