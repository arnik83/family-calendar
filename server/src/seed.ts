// Seeds a fresh database with sample members, appointments, and holidays so
// the app looks alive on first run. Only runs when the members table is empty,
// so it never touches real data. Run manually with: bun ./server/src/seed.ts
import { db } from "./db";
import * as schema from "./schema";

function dateKey(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export async function seedIfEmpty(): Promise<void> {
  const existing = await db.select({ id: schema.familyMembers.id }).from(schema.familyMembers).limit(1);
  if (existing.length > 0) return;

  const members = await db
    .insert(schema.familyMembers)
    .values([
      { name: "Alex", color: "#287f78", sortOrder: 1 },
      { name: "Jordan", color: "#c76545", sortOrder: 2 },
      { name: "Sam", color: "#d39a24", sortOrder: 3 },
      { name: "Riley", color: "#4b70b8", sortOrder: 4 },
    ])
    .returning({ id: schema.familyMembers.id, name: schema.familyMembers.name });
  const idOf = (name: string) => members.find((m) => m.name === name)!.id;

  await db.insert(schema.appointments).values([
    { memberId: idOf("Sam"), title: "Soccer practice", appointmentDate: dateKey(1), startTime: "17:30", endTime: "18:30", allDay: false, location: "Community field", notes: "" },
    { memberId: idOf("Sam"), title: "Soccer practice", appointmentDate: dateKey(8), startTime: "17:30", endTime: "18:30", allDay: false, location: "Community field", notes: "" },
    { memberId: idOf("Riley"), title: "Piano lesson", appointmentDate: dateKey(2), startTime: "16:00", endTime: "16:45", allDay: false, location: "", notes: "Bring theory book" },
    { memberId: idOf("Alex"), title: "Dentist appointment", appointmentDate: dateKey(3), startTime: "09:15", endTime: "10:00", allDay: false, location: "Bright Smile Dental", notes: "" },
    { memberId: idOf("Jordan"), title: "Book club", appointmentDate: dateKey(4), startTime: "19:00", endTime: "20:30", allDay: false, location: "Library, room B", notes: "" },
    { memberId: idOf("Riley"), title: "Swim meet", appointmentDate: dateKey(6), startTime: "08:00", endTime: "12:00", allDay: false, location: "Aquatic center", notes: "" },
    { memberId: idOf("Sam"), title: "Science fair", appointmentDate: dateKey(9), startTime: null, endTime: null, allDay: true, location: "School gym", notes: "" },
    { memberId: idOf("Alex"), title: "Weekend hike", appointmentDate: dateKey(10), startTime: "08:30", endTime: "11:30", allDay: false, location: "Ridgeline trailhead", notes: "" },
  ]);

  await db.insert(schema.holidays).values([
    { memberId: null, title: "Sample family day", holidayDate: dateKey(14), notes: "A sample all-family holiday." },
    { memberId: idOf("Jordan"), title: "Jordan's birthday", holidayDate: dateKey(21), notes: "" },
  ]);

  console.log("Seeded sample family data.");
}

if (import.meta.main) {
  await seedIfEmpty();
}
