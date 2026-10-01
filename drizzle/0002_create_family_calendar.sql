DROP TABLE entries;
--> statement-breakpoint
CREATE TABLE family_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL REFERENCES family_members(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  appointment_date TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  all_day INTEGER NOT NULL DEFAULT 0,
  location TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX appointments_date_idx ON appointments(appointment_date);
--> statement-breakpoint
CREATE INDEX appointments_member_idx ON appointments(member_id);
