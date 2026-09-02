import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { supabase } from "@/lib/supabase";

type TransactionPreview = {
  id: string;
  category: string;
  is_income: boolean;
  occurred_at: string;
  amount_usd_cents_enc: string | null;
};

type Props = { userId: string };

export function TransactionsScreen({ userId }: Props) {
  const [rows, setRows] = useState<TransactionPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: queryError } = await supabase
      .from("transactions")
      .select("id,category,is_income,occurred_at,amount_usd_cents_enc")
      .eq("user_id", userId)
      .order("occurred_at", { ascending: false })
      .limit(50);

    if (queryError) setError(queryError.message);
    else setRows(data ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <View accessibilityLabel="Loading transactions" style={styles.centered}>
        <ActivityIndicator color="#1FB85A" size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View>
          <Text accessibilityRole="header" style={styles.title}>Transactions</Text>
          <Text style={styles.subtitle}>Native parity probe</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => void supabase.auth.signOut()}>
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/crypto-check")}
        style={styles.cryptoGate}
      >
        <Text style={styles.cryptoGateText}>Run crypto compatibility gate</Text>
      </Pressable>
      <FlatList
        contentContainerStyle={rows.length === 0 ? styles.emptyList : styles.list}
        data={rows}
        keyExtractor={(row) => row.id}
        refreshControl={
          <RefreshControl
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            refreshing={refreshing}
            tintColor="#1FB85A"
          />
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowCopy}>
              <Text style={styles.category}>{item.category}</Text>
              <Text style={styles.date}>{new Date(item.occurred_at).toLocaleDateString("en-US")}</Text>
            </View>
            <Text accessibilityLabel="Encrypted amount" style={styles.encrypted}>
              {item.amount_usd_cents_enc ? "••••" : "—"}
            </Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No transactions yet.</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F2F2F7" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F2F2F7" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: { fontSize: 32, fontWeight: "800", color: "#111111" },
  subtitle: { marginTop: 2, color: "#6C6C70" },
  signOut: { color: "#007AFF", fontSize: 16, fontWeight: "600" },
  error: { marginHorizontal: 20, marginBottom: 12, color: "#FF3B30" },
  cryptoGate: { marginHorizontal: 20, marginBottom: 12 },
  cryptoGateText: { color: "#007AFF", fontSize: 15, fontWeight: "600" },
  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 1 },
  emptyList: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
  empty: { color: "#6C6C70" },
  row: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    backgroundColor: "#FFFFFF",
  },
  rowCopy: { gap: 4 },
  category: { fontSize: 17, fontWeight: "600", color: "#111111" },
  date: { fontSize: 13, color: "#8E8E93" },
  encrypted: { fontSize: 18, fontWeight: "700", color: "#8E8E93" },
});
