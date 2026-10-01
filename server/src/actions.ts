import { z } from "zod";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import * as schema from "./schema";
import { db } from "./db";

// Minimal replacement for the hosted platform's action wrapper:
// validates the request with zod, runs the handler, validates the response.
type ActionDef<Req extends z.ZodTypeAny, Res extends z.ZodTypeAny> = {
  request: Req;
  response: Res;
  handler: (args: z.infer<Req>) => Promise<z.infer<Res>>;
};

function defineAction<Req extends z.ZodTypeAny, Res extends z.ZodTypeAny>(
  def: ActionDef<Req, Res>,
): ActionDef<Req, Res> {
  return def;
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

const appointmentInput = z.object({
  member_id: z.number().int().positive(),
  title: z.string().trim().min(1).max(120),
  appointment_date: z.string().regex(datePattern),
  start_time: z.string().regex(timePattern).nullable(),
  end_time: z.string().regex(timePattern).nullable(),
  all_day: z.boolean(),
  location: z.string().trim().max(200),
  notes: z.string().trim().max(1000),
});

const appointmentRecord = z.object({
  id: z.number(),
  member_id: z.number(),
  member_name: z.string(),
  member_color: z.string(),
  title: z.string(),
  appointment_date: z.string(),
  start_time: z.string().nullable(),
  end_time: z.string().nullable(),
  all_day: z.boolean(),
  location: z.string(),
  notes: z.string(),
});

function validateTimes(args: z.infer<typeof appointmentInput>): string | null {
  if (args.all_day) return null;
  if (!args.start_time) return "Choose a start time or mark the appointment all day.";
  if (args.end_time && args.end_time <= args.start_time) {
    return "End time must be later than start time.";
  }
  return null;
}

export const Actions = {
  listMembers: defineAction({
    request: z.object({}),
    response: z.object({
      members: z.array(
        z.object({
          id: z.number(),
          name: z.string(),
          color: z.string(),
          sort_order: z.number(),
        }),
      ),
    }),
    async handler() {
      const rows = await db
        .select()
        .from(schema.familyMembers)
        .orderBy(asc(schema.familyMembers.sortOrder));
      return {
        members: rows.map((row) => ({
          id: row.id,
          name: row.name,
          color: row.color,
          sort_order: row.sortOrder,
        })),
      };
    },
  }),

  listAppointments: defineAction({
    request: z.object({
      start_date: z.string().regex(datePattern),
      end_date: z.string().regex(datePattern),
    }),
    response: z.object({ appointments: z.array(appointmentRecord) }),
    async handler(args) {
      const rows = await db
        .select({
          id: schema.appointments.id,
          memberId: schema.appointments.memberId,
          memberName: schema.familyMembers.name,
          memberColor: schema.familyMembers.color,
          title: schema.appointments.title,
          appointmentDate: schema.appointments.appointmentDate,
          startTime: schema.appointments.startTime,
          endTime: schema.appointments.endTime,
          allDay: schema.appointments.allDay,
          location: schema.appointments.location,
          notes: schema.appointments.notes,
        })
        .from(schema.appointments)
        .innerJoin(schema.familyMembers, eq(schema.appointments.memberId, schema.familyMembers.id))
        .where(
          and(
            gte(schema.appointments.appointmentDate, args.start_date),
            lte(schema.appointments.appointmentDate, args.end_date),
          ),
        )
        .orderBy(
          asc(schema.appointments.appointmentDate),
          asc(schema.appointments.allDay),
          asc(schema.appointments.startTime),
          asc(schema.appointments.id),
        );
      return {
        appointments: rows.map((row) => ({
          id: row.id,
          member_id: row.memberId,
          member_name: row.memberName,
          member_color: row.memberColor,
          title: row.title,
          appointment_date: row.appointmentDate,
          start_time: row.startTime,
          end_time: row.endTime,
          all_day: row.allDay,
          location: row.location ?? "",
          notes: row.notes ?? "",
        })),
      };
    },
  }),

  searchAppointments: defineAction({
    request: z.object({ pattern: z.string().trim().min(1).max(120) }),
    response: z.object({ appointments: z.array(appointmentRecord) }),
    async handler(args) {
      const rows = await db
        .select({
          id: schema.appointments.id,
          memberId: schema.appointments.memberId,
          memberName: schema.familyMembers.name,
          memberColor: schema.familyMembers.color,
          title: schema.appointments.title,
          appointmentDate: schema.appointments.appointmentDate,
          startTime: schema.appointments.startTime,
          endTime: schema.appointments.endTime,
          allDay: schema.appointments.allDay,
          location: schema.appointments.location,
          notes: schema.appointments.notes,
        })
        .from(schema.appointments)
        .innerJoin(schema.familyMembers, eq(schema.appointments.memberId, schema.familyMembers.id))
        .where(sql`instr(lower(${schema.appointments.title}), lower(${args.pattern})) > 0`)
        .orderBy(
          asc(schema.appointments.appointmentDate),
          asc(schema.appointments.allDay),
          asc(schema.appointments.startTime),
          asc(schema.appointments.id),
        );
      return {
        appointments: rows.map((row) => ({
          id: row.id,
          member_id: row.memberId,
          member_name: row.memberName,
          member_color: row.memberColor,
          title: row.title,
          appointment_date: row.appointmentDate,
          start_time: row.startTime,
          end_time: row.endTime,
          all_day: row.allDay,
          location: row.location ?? "",
          notes: row.notes ?? "",
        })),
      };
    },
  }),

  createAppointment: defineAction({
    request: appointmentInput,
    response: z.object({ ok: z.boolean(), id: z.number().optional(), error: z.string().optional() }),
    async handler(args) {
      const timeError = validateTimes(args);
      if (timeError) return { ok: false, error: timeError };
      const member = await db
        .select({ id: schema.familyMembers.id })
        .from(schema.familyMembers)
        .where(eq(schema.familyMembers.id, args.member_id))
        .limit(1);
      if (!member[0]) return { ok: false, error: "Choose a family member." };
      const result = await db
        .insert(schema.appointments)
        .values({
          memberId: args.member_id,
          title: args.title,
          appointmentDate: args.appointment_date,
          startTime: args.all_day ? null : args.start_time,
          endTime: args.all_day ? null : args.end_time,
          allDay: args.all_day,
          location: args.location || null,
          notes: args.notes || null,
        })
        .returning({ id: schema.appointments.id });
      const inserted = result[0];
      if (!inserted) return { ok: false, error: "The appointment could not be saved." };
      return { ok: true, id: inserted.id };
    },
  }),

  createAppointments: defineAction({
    request: appointmentInput.omit({ appointment_date: true }).extend({
      appointment_dates: z.array(z.string().regex(datePattern)).min(1).max(200),
    }),
    response: z.object({ ok: z.boolean(), count: z.number().optional(), error: z.string().optional() }),
    async handler(args) {
      const timeError = validateTimes({ ...args, appointment_date: args.appointment_dates[0] ?? "" });
      if (timeError) return { ok: false, error: timeError };
      const dates = [...new Set(args.appointment_dates)].sort();
      if (dates.length === 0) return { ok: false, error: "Choose at least one date." };
      const member = await db
        .select({ id: schema.familyMembers.id })
        .from(schema.familyMembers)
        .where(eq(schema.familyMembers.id, args.member_id))
        .limit(1);
      if (!member[0]) return { ok: false, error: "Choose a family member." };
      const result = await db
        .insert(schema.appointments)
        .values(dates.map((appointmentDate) => ({
          memberId: args.member_id,
          title: args.title,
          appointmentDate,
          startTime: args.all_day ? null : args.start_time,
          endTime: args.all_day ? null : args.end_time,
          allDay: args.all_day,
          location: args.location || null,
          notes: args.notes || null,
        })))
        .returning({ id: schema.appointments.id });
      if (result.length !== dates.length) return { ok: false, error: "The appointments could not be saved." };
      return { ok: true, count: result.length };
    },
  }),

  updateAppointment: defineAction({
    request: appointmentInput.extend({ id: z.number().int().positive() }),
    response: z.object({ ok: z.boolean(), error: z.string().optional() }),
    async handler(args) {
      const timeError = validateTimes(args);
      if (timeError) return { ok: false, error: timeError };
      const existing = await db
        .select({ id: schema.appointments.id })
        .from(schema.appointments)
        .where(eq(schema.appointments.id, args.id))
        .limit(1);
      if (!existing[0]) return { ok: false, error: "This appointment no longer exists." };
      await db
        .update(schema.appointments)
        .set({
          memberId: args.member_id,
          title: args.title,
          appointmentDate: args.appointment_date,
          startTime: args.all_day ? null : args.start_time,
          endTime: args.all_day ? null : args.end_time,
          allDay: args.all_day,
          location: args.location || null,
          notes: args.notes || null,
          updatedAt: new Date(),
        })
        .where(eq(schema.appointments.id, args.id));
      return { ok: true };
    },
  }),

  deleteAppointment: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ ok: z.boolean(), error: z.string().optional() }),
    async handler(args) {
      const existing = await db
        .select({ id: schema.appointments.id })
        .from(schema.appointments)
        .where(eq(schema.appointments.id, args.id))
        .limit(1);
      if (!existing[0]) return { ok: false, error: "This appointment no longer exists." };
      await db.delete(schema.appointments).where(eq(schema.appointments.id, args.id));
      return { ok: true };
    },
  }),

  listHolidays: defineAction({
    request: z.object({
      start_date: z.string().regex(datePattern),
      end_date: z.string().regex(datePattern),
    }),
    response: z.object({
      holidays: z.array(z.object({
        id: z.number(),
        member_id: z.number().nullable(),
        member_name: z.string(),
        member_color: z.string().nullable(),
        title: z.string(),
        holiday_date: z.string(),
        notes: z.string(),
      })),
    }),
    async handler(args) {
      const rows = await db
        .select({
          id: schema.holidays.id,
          memberId: schema.holidays.memberId,
          memberName: schema.familyMembers.name,
          memberColor: schema.familyMembers.color,
          title: schema.holidays.title,
          holidayDate: schema.holidays.holidayDate,
          notes: schema.holidays.notes,
        })
        .from(schema.holidays)
        .leftJoin(schema.familyMembers, eq(schema.holidays.memberId, schema.familyMembers.id))
        .where(
          and(
            gte(schema.holidays.holidayDate, args.start_date),
            lte(schema.holidays.holidayDate, args.end_date),
          ),
        )
        .orderBy(asc(schema.holidays.holidayDate), asc(schema.holidays.id));
      return {
        holidays: rows.map((row) => ({
          id: row.id,
          member_id: row.memberId,
          member_name: row.memberName ?? "Entire family",
          member_color: row.memberColor,
          title: row.title,
          holiday_date: row.holidayDate,
          notes: row.notes ?? "",
        })),
      };
    },
  }),

  createHoliday: defineAction({
    request: z.object({
      member_id: z.number().int().positive().nullable(),
      title: z.string().trim().min(1).max(120),
      holiday_date: z.string().regex(datePattern),
      notes: z.string().trim().max(1000),
    }),
    response: z.object({ ok: z.boolean(), id: z.number().optional(), error: z.string().optional() }),
    async handler(args) {
      if (args.member_id !== null) {
        const member = await db
          .select({ id: schema.familyMembers.id })
          .from(schema.familyMembers)
          .where(eq(schema.familyMembers.id, args.member_id))
          .limit(1);
        if (!member[0]) return { ok: false, error: "Choose a family member or the entire family." };
      }
      const result = await db
        .insert(schema.holidays)
        .values({
          memberId: args.member_id,
          title: args.title,
          holidayDate: args.holiday_date,
          notes: args.notes || null,
        })
        .returning({ id: schema.holidays.id });
      const inserted = result[0];
      if (!inserted) return { ok: false, error: "The holiday could not be saved." };
      return { ok: true, id: inserted.id };
    },
  }),

  createHolidays: defineAction({
    request: z.object({
      member_id: z.number().int().positive().nullable(),
      title: z.string().trim().min(1).max(120),
      holiday_dates: z.array(z.string().regex(datePattern)).min(1).max(200),
      notes: z.string().trim().max(1000),
    }),
    response: z.object({ ok: z.boolean(), count: z.number().optional(), error: z.string().optional() }),
    async handler(args) {
      const dates = [...new Set(args.holiday_dates)].sort();
      if (dates.length === 0) return { ok: false, error: "Choose at least one holiday date." };
      if (args.member_id !== null) {
        const member = await db
          .select({ id: schema.familyMembers.id })
          .from(schema.familyMembers)
          .where(eq(schema.familyMembers.id, args.member_id))
          .limit(1);
        if (!member[0]) return { ok: false, error: "Choose a family member or the entire family." };
      }
      const result = await db
        .insert(schema.holidays)
        .values(dates.map((holidayDate) => ({
          memberId: args.member_id,
          title: args.title,
          holidayDate,
          notes: args.notes || null,
        })))
        .returning({ id: schema.holidays.id });
      if (result.length !== dates.length) return { ok: false, error: "The holidays could not be saved." };
      return { ok: true, count: result.length };
    },
  }),

  updateHoliday: defineAction({
    request: z.object({
      id: z.number().int().positive(),
      member_id: z.number().int().positive().nullable(),
      title: z.string().trim().min(1).max(120),
      holiday_date: z.string().regex(datePattern),
      notes: z.string().trim().max(1000),
    }),
    response: z.object({ ok: z.boolean(), error: z.string().optional() }),
    async handler(args) {
      const existing = await db
        .select({ id: schema.holidays.id })
        .from(schema.holidays)
        .where(eq(schema.holidays.id, args.id))
        .limit(1);
      if (!existing[0]) return { ok: false, error: "This holiday no longer exists." };
      if (args.member_id !== null) {
        const member = await db
          .select({ id: schema.familyMembers.id })
          .from(schema.familyMembers)
          .where(eq(schema.familyMembers.id, args.member_id))
          .limit(1);
        if (!member[0]) return { ok: false, error: "Choose a family member or the entire family." };
      }
      await db
        .update(schema.holidays)
        .set({
          memberId: args.member_id,
          title: args.title,
          holidayDate: args.holiday_date,
          notes: args.notes || null,
          updatedAt: new Date(),
        })
        .where(eq(schema.holidays.id, args.id));
      return { ok: true };
    },
  }),

  deleteHoliday: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ ok: z.boolean(), error: z.string().optional() }),
    async handler(args) {
      const existing = await db
        .select({ id: schema.holidays.id })
        .from(schema.holidays)
        .where(eq(schema.holidays.id, args.id))
        .limit(1);
      if (!existing[0]) return { ok: false, error: "This holiday no longer exists." };
      await db.delete(schema.holidays).where(eq(schema.holidays.id, args.id));
      return { ok: true };
    },
  }),
};

export type Actions = typeof Actions;

// Validates args against the action's request schema, runs it, and validates
// the response. Used by the HTTP server in index.ts.
export async function dispatchAction(name: string, args: unknown): Promise<unknown> {
  const action = (Actions as Record<string, ActionDef<z.ZodTypeAny, z.ZodTypeAny>>)[name];
  if (!action) throw new Error(`Unknown action: ${name}`);
  const parsedArgs = action.request.parse(args);
  const result = await action.handler(parsedArgs);
  return action.response.parse(result);
}
