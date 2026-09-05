import { StyleSheet, Text, View } from "react-native";
import { SwipeRow } from "@/components/SwipeRow";
import { colors, text } from "@/lib/theme";
import type { Transaction } from "@/types/db";

export function HistoryList({
  rows,
  onEdit,
  onDelete,
}: {
  rows: Transaction[];
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
}) {
  if (rows.length === 0) {
    return <Text style={styles.empty}>Nothin' here yet, Doc. Add your first one above.</Text>;
  }

  return (
    <View style={styles.list}>
      {rows.map((tx) => (
        <SwipeRow key={tx.id} tx={tx} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // py-10 text-center text-label-secondary
  empty: {
    paddingVertical: 40,
    textAlign: "center",
    ...text.base,
    color: colors.labelSecondary,
  },
  // flex flex-col gap-1.5
  list: { gap: 6 },
});
