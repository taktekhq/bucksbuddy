// Bugs-isms used as the random section title above the month-net card. Kept
// short and PG; one is picked per mount so it's stable while you're on screen.
const BUGS_LINES = [
  "What's up, Doc?",
  "Eh, what's cookin'?",
  "Of course you realize, this means money.",
  "Th-th-th-that's the dough, folks!",
  "Be vewy vewy quiet, I'm countin' wabbits.",
  "Nyaah, how's the loot, Doc?",
  "I knew I shoulda taken that left turn at the bank.",
  "Ain't I a saver?",
  "What's all the hubbub, bub?",
  "Here today, gone to lunch.",
];

export function randomBugsLine(): string {
  return BUGS_LINES[Math.floor(Math.random() * BUGS_LINES.length)];
}
