CREATE TABLE round_history (
  id TEXT PRIMARY KEY NOT NULL,
  ended_at INTEGER NOT NULL,
  summary TEXT NOT NULL,
  snapshot TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX round_history_ended_at ON round_history (ended_at DESC, id DESC);
