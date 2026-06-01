import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { transactionsToCsv } from "@/lib/csv";
import type { Transaction } from "@/types/db";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .order("occurred_at", { ascending: true });

  if (error) {
    return new NextResponse(error.message, { status: 500 });
  }

  const csv = transactionsToCsv((data ?? []) as Transaction[]);
  const filename = `bucksbuddy-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
