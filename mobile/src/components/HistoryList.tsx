import { Text, View } from "react-native";
import { SwipeRow } from "@/components/SwipeRow";
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
    return (
      <Text className="py-10 text-center text-label-secondary">
        Nothin' here yet, Doc. Add your first one above.
      </Text>
    );
  }

  return (
    <View className="flex flex-col gap-1.5">
      {rows.map((tx) => (
        <View key={tx.id}>
          <SwipeRow tx={tx} onEdit={onEdit} onDelete={onDelete} />
        </View>
      ))}
    </View>
  );
}
