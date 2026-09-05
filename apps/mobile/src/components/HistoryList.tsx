import { Text, View } from "react-native";

import { SwipeRow } from "@/components/SwipeRow";
import type { Transaction } from "@bucksbuddy/core/types";

// Mirrors src/components/HistoryList.tsx.
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
    return <Text className="py-10 text-center text-label-secondary">Nothin' here yet, Doc. Add your first one above.</Text>;
  }

  return (
    <View className="gap-1.5">
      {rows.map((tx) => (
        <SwipeRow key={tx.id} tx={tx} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </View>
  );
}
