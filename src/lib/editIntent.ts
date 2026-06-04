// Editing a transaction happens on the Home page (the composer lives there). The
// full-history page is a separate route, so when you tap "edit" on a row over
// there we stash the target id here and navigate home, where the composer picks
// it up on mount. A plain module variable is enough — it's read synchronously
// the moment Home mounts, right after navigation.
let pendingEditId: string | null = null;

/** Remember which transaction to edit, then navigate to Home. */
export function requestEdit(id: string) {
  pendingEditId = id;
}

/** Read and clear the pending edit target (null when there isn't one). */
export function takePendingEdit(): string | null {
  const id = pendingEditId;
  pendingEditId = null;
  return id;
}
