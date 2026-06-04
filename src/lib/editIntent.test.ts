import { describe, it, expect } from "vitest";
import { requestEdit, takePendingEdit } from "@/lib/editIntent";

describe("editIntent", () => {
  it("hands back the requested id once, then clears it", () => {
    requestEdit("tx-42");
    expect(takePendingEdit()).toBe("tx-42");
    // Reading consumes it, so a second read is empty.
    expect(takePendingEdit()).toBeNull();
  });

  it("returns null when nothing was requested", () => {
    expect(takePendingEdit()).toBeNull();
  });
});
