import { SafeAreaTopScrim } from "./safe-area";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api, type ApiResponse } from "./api";

type Appointment = ApiResponse<"listAppointments">["appointments"][number];
type Member = ApiResponse<"listMembers">["members"][number];
type Holiday = ApiResponse<"listHolidays">["holidays"][number];

type HolidayScheduleMode = "once" | "range" | "multiple";

type HolidayDraft = {
  id?: number;
  member_id: number | null;
  title: string;
  holiday_date: string;
  schedule_mode: HolidayScheduleMode;
  range_end_date: string;
  additional_dates: string[];
  date_to_add: string;
  notes: string;
};

type ScheduleMode = "once" | "multiple" | "repeat";
type RepeatUnit = "day" | "week" | "month";

type AppointmentDraft = {
  id?: number;
  duplicate_of_date?: string;
  member_id: number;
  title: string;
  appointment_date: string;
  schedule_mode: ScheduleMode;
  additional_dates: string[];
  date_to_add: string;
  repeat_unit: RepeatUnit;
  repeat_interval: number;
  repeat_until: string;
  repeat_weekdays: number[];
  start_time: string;
  end_time: string;
  all_day: boolean;
  location: string;
  notes: string;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(value: string) {
  const [year = 1970, month = 1, day = 1] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function sameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function calendarDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function addMonthsKeepingDay(date: Date, amount: number) {
  const targetDay = date.getDate();
  const next = new Date(date.getFullYear(), date.getMonth() + amount, 1);
  next.setDate(Math.min(targetDay, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
  return next;
}

function scheduledDates(draft: AppointmentDraft) {
  if (!draft.appointment_date) return [];
  if (draft.schedule_mode === "once") return [draft.appointment_date];
  if (draft.schedule_mode === "multiple") {
    return [...new Set([draft.appointment_date, ...draft.additional_dates])].sort();
  }
  if (!draft.repeat_until || draft.repeat_until < draft.appointment_date) return [];

  const start = parseDateKey(draft.appointment_date);
  const end = parseDateKey(draft.repeat_until);
  const dates: string[] = [];
  const interval = Math.max(1, Math.min(12, draft.repeat_interval));
  if (draft.repeat_unit === "week") {
    const weekdays = draft.repeat_weekdays.length ? draft.repeat_weekdays : [start.getDay()];
    for (let cursor = new Date(start); cursor <= end && dates.length < 200; cursor = addDays(cursor, 1)) {
      const elapsedDays = Math.round((cursor.getTime() - start.getTime()) / 86_400_000);
      const weekIndex = Math.floor(elapsedDays / 7);
      if (weekIndex % interval === 0 && weekdays.includes(cursor.getDay())) dates.push(dateKey(cursor));
    }
  } else if (draft.repeat_unit === "day") {
    for (let cursor = new Date(start); cursor <= end && dates.length < 200; cursor = addDays(cursor, interval)) {
      dates.push(dateKey(cursor));
    }
  } else {
    for (let monthOffset = 0; dates.length < 200; monthOffset += interval) {
      const cursor = addMonthsKeepingDay(start, monthOffset);
      if (cursor > end) break;
      dates.push(dateKey(cursor));
    }
  }
  return [...new Set(dates)];
}

function holidayDates(draft: HolidayDraft) {
  if (!draft.holiday_date) return [];
  if (draft.schedule_mode === "once") return [draft.holiday_date];
  if (draft.schedule_mode === "multiple") {
    return [...new Set([draft.holiday_date, ...draft.additional_dates])].sort();
  }
  if (!draft.range_end_date || draft.range_end_date < draft.holiday_date) return [];
  const start = parseDateKey(draft.holiday_date);
  const end = parseDateKey(draft.range_end_date);
  const dates: string[] = [];
  for (let cursor = new Date(start); cursor <= end && dates.length < 200; cursor = addDays(cursor, 1)) {
    dates.push(dateKey(cursor));
  }
  return dates;
}

function formatShortDate(value: string) {
  return parseDateKey(value).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(value: string | null) {
  if (!value) return "";
  const [hours = 0, minutes = 0] = value.split(":").map(Number);
  const date = new Date(2000, 0, 1, hours, minutes);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function appointmentTime(appointment: Appointment) {
  if (appointment.all_day) return "All day";
  const start = formatTime(appointment.start_time);
  const end = formatTime(appointment.end_time);
  return end ? `${start}–${end}` : start;
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={direction === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function HolidayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v3M4.2 7.5l2.6 1.4M19.8 7.5l-2.6 1.4M5 21h14M7 21v-5a5 5 0 0 1 10 0v5M10 16h4" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

function DuplicateIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function initialDraft(date: string, memberId: number): AppointmentDraft {
  return {
    member_id: memberId,
    title: "",
    appointment_date: date,
    schedule_mode: "once",
    additional_dates: [],
    date_to_add: "",
    repeat_unit: "week",
    repeat_interval: 1,
    repeat_until: "",
    repeat_weekdays: [parseDateKey(date).getDay()],
    start_time: "09:00",
    end_time: "",
    all_day: false,
    location: "",
    notes: "",
  };
}

export function App() {
  const today = useMemo(() => new Date(), []);
  const todayKey = dateKey(today);
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [selectedMember, setSelectedMember] = useState<number | null>(null);
  const [view, setView] = useState<"schedule" | "holidays" | "free" | "freeAfter">("schedule");
  const [freeAfterTime, setFreeAfterTime] = useState("17:00");
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [dateFilterStart, setDateFilterStart] = useState("");
  const [dateFilterEnd, setDateFilterEnd] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [draft, setDraft] = useState<AppointmentDraft | null>(null);
  const [holidayDraft, setHolidayDraft] = useState<HolidayDraft | null>(null);
  const [formError, setFormError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const queryClient = useQueryClient();

  const days = useMemo(() => calendarDays(month), [month]);
  const visibleStart = dateKey(days[0] ?? month);
  const visibleEnd = dateKey(days[days.length - 1] ?? month);
  const dateFilterActive = dateFilterStart !== "";
  const queryStart = dateFilterStart && dateFilterStart < visibleStart ? dateFilterStart : visibleStart;
  const filterLastDay = dateFilterEnd || dateFilterStart;
  const queryEnd = filterLastDay && filterLastDay > visibleEnd ? filterLastDay : visibleEnd;

  const membersQuery = useQuery({
    queryKey: ["members"],
    queryFn: () => api.listMembers({}),
  });

  const appointmentsQuery = useQuery({
    queryKey: ["appointments", queryStart, queryEnd],
    queryFn: () => api.listAppointments({ start_date: queryStart, end_date: queryEnd }),
  });

  const holidaysQuery = useQuery({
    queryKey: ["holidays", queryStart, queryEnd],
    queryFn: () => api.listHolidays({ start_date: queryStart, end_date: queryEnd }),
  });

  const searchQuery = useQuery({
    queryKey: ["appointment-search", searchTerm],
    queryFn: () => api.searchAppointments({ pattern: searchTerm }),
    enabled: searchTerm !== "",
  });

  const members = membersQuery.data?.members ?? [];
  const appointments = appointmentsQuery.data?.appointments ?? [];
  const holidays = holidaysQuery.data?.holidays ?? [];
  const visibleHolidays = holidays.filter((holiday) => {
    if (selectedMember !== null && holiday.member_id !== null && holiday.member_id !== selectedMember) return false;
    if (!dateFilterStart) return true;
    if (!dateFilterEnd) return holiday.holiday_date === dateFilterStart;
    return holiday.holiday_date >= dateFilterStart && holiday.holiday_date <= dateFilterEnd;
  });
  const visibleAppointments = appointments.filter((appointment) => {
    if (selectedMember !== null && appointment.member_id !== selectedMember) return false;
    if (!dateFilterStart) return true;
    if (!dateFilterEnd) return appointment.appointment_date === dateFilterStart;
    return appointment.appointment_date >= dateFilterStart && appointment.appointment_date <= dateFilterEnd;
  });

  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const appointment of visibleAppointments) {
      const list = map.get(appointment.appointment_date) ?? [];
      list.push(appointment);
      map.set(appointment.appointment_date, list);
    }
    return map;
  }, [visibleAppointments]);

  const allAppointmentsByDate = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const appointment of appointments) {
      const list = map.get(appointment.appointment_date) ?? [];
      list.push(appointment);
      map.set(appointment.appointment_date, list);
    }
    return map;
  }, [appointments]);

  const holidaysByDate = useMemo(() => {
    const map = new Map<string, Holiday[]>();
    for (const holiday of visibleHolidays) {
      const list = map.get(holiday.holiday_date) ?? [];
      list.push(holiday);
      map.set(holiday.holiday_date, list);
    }
    return map;
  }, [visibleHolidays]);

  const selectedAppointments = appointmentsByDate.get(selectedDate) ?? [];
  const selectedHolidays = holidaysByDate.get(selectedDate) ?? [];
  const searchActive = searchTerm !== "";
  const searchAppointments = (searchQuery.data?.appointments ?? []).filter((appointment) => {
    if (selectedMember !== null && appointment.member_id !== selectedMember) return false;
    if (!dateFilterStart) return true;
    if (!dateFilterEnd) return appointment.appointment_date === dateFilterStart;
    return appointment.appointment_date >= dateFilterStart && appointment.appointment_date <= dateFilterEnd;
  });
  const agendaAppointments = searchActive
    ? searchAppointments
    : view === "holidays"
      ? []
      : dateFilterActive
        ? visibleAppointments
        : selectedAppointments;
  const agendaHolidays = searchActive ? [] : dateFilterActive ? visibleHolidays : selectedHolidays;
  const agendaCount = agendaAppointments.length + agendaHolidays.length;
  const selectedDateValue = parseDateKey(selectedDate);
  const filterLabel = dateFilterEnd
    ? `${parseDateKey(dateFilterStart).toLocaleDateString([], { month: "short", day: "numeric" })} – ${parseDateKey(dateFilterEnd).toLocaleDateString([], { month: "short", day: "numeric" })}`
    : dateFilterStart
      ? parseDateKey(dateFilterStart).toLocaleDateString([], { month: "long", day: "numeric" })
      : "";
  const freeAfterLabel = formatTime(freeAfterTime);

  function hasActivityAtOrAfter(appointmentsForDay: Appointment[]) {
    return appointmentsForDay.some((appointment) => {
      if (appointment.all_day) return true;
      if (appointment.end_time) return appointment.end_time > freeAfterTime;
      return Boolean(appointment.start_time && appointment.start_time >= freeAfterTime);
    });
  }

  const freeAfterCount = days.filter((day) => {
    const key = dateKey(day);
    const weekday = day.getDay();
    const insideDateWindow = !dateFilterStart || (!dateFilterEnd ? key === dateFilterStart : key >= dateFilterStart && key <= dateFilterEnd);
    return sameMonth(day, month)
      && weekday >= 1
      && weekday <= 5
      && insideDateWindow
      && !hasActivityAtOrAfter(allAppointmentsByDate.get(key) ?? []);
  }).length;

  const saveMutation = useMutation({
    mutationFn: async (data: AppointmentDraft) => {
      const common = {
        member_id: data.member_id,
        title: data.title,
        start_time: data.all_day ? null : data.start_time || null,
        end_time: data.all_day ? null : data.end_time || null,
        all_day: data.all_day,
        location: data.location,
        notes: data.notes,
      };
      return data.id
        ? api.updateAppointment({ ...common, appointment_date: data.appointment_date, id: data.id })
        : api.createAppointments({ ...common, appointment_dates: scheduledDates(data) });
    },
    onSuccess: async (result, variables) => {
      if (!result.ok) {
        setFormError(result.error ?? "The appointment could not be saved.");
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["appointments"] }),
        queryClient.invalidateQueries({ queryKey: ["appointment-search"] }),
      ]);
      const savedDate = parseDateKey(variables.appointment_date);
      setMonth(new Date(savedDate.getFullYear(), savedDate.getMonth(), 1));
      setSelectedDate(variables.appointment_date);
      setDraft(null);
      setFormError("");
    },
    onError: () => setFormError("The appointment could not be saved. Try again."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteAppointment({ id }),
    onSuccess: async (result) => {
      if (!result.ok) {
        setFormError(result.error ?? "The appointment could not be deleted.");
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["appointments"] }),
        queryClient.invalidateQueries({ queryKey: ["appointment-search"] }),
      ]);
      setDraft(null);
      setConfirmDelete(false);
      setFormError("");
    },
    onError: () => setFormError("The appointment could not be deleted. Try again."),
  });

  const saveHolidayMutation = useMutation({
    mutationFn: (data: HolidayDraft) => data.id
      ? api.updateHoliday({ id: data.id, member_id: data.member_id, title: data.title, holiday_date: data.holiday_date, notes: data.notes })
      : api.createHolidays({ member_id: data.member_id, title: data.title, holiday_dates: holidayDates(data), notes: data.notes }),
    onSuccess: async (result, variables) => {
      if (!result.ok) {
        setFormError(result.error ?? "The holiday could not be saved.");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["holidays"] });
      const savedDate = parseDateKey(variables.holiday_date);
      setMonth(new Date(savedDate.getFullYear(), savedDate.getMonth(), 1));
      setSelectedDate(variables.holiday_date);
      setHolidayDraft(null);
      setFormError("");
    },
    onError: () => setFormError("The holiday could not be saved. Try again."),
  });

  const deleteHolidayMutation = useMutation({
    mutationFn: (id: number) => api.deleteHoliday({ id }),
    onSuccess: async (result) => {
      if (!result.ok) {
        setFormError(result.error ?? "The holiday could not be deleted.");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["holidays"] });
      setHolidayDraft(null);
      setConfirmDelete(false);
      setFormError("");
    },
    onError: () => setFormError("The holiday could not be deleted. Try again."),
  });

  useEffect(() => {
    if (!draft && !holidayDraft) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDraft(null);
        setHolidayDraft(null);
        setConfirmDelete(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [draft, holidayDraft]);

  function moveMonth(offset: number) {
    const next = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    setMonth(next);
    setSelectedDate(dateKey(next));
  }

  function goToday() {
    setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(todayKey);
  }

  function openNew(date = selectedDate) {
    const firstMember = members[0];
    if (!firstMember) return;
    setHolidayDraft(null);
    setDraft(initialDraft(date, selectedMember ?? firstMember.id));
    setConfirmDelete(false);
    setFormError("");
  }

  function openEdit(appointment: Appointment) {
    setHolidayDraft(null);
    setDraft({
      id: appointment.id,
      member_id: appointment.member_id,
      title: appointment.title,
      appointment_date: appointment.appointment_date,
      schedule_mode: "once",
      additional_dates: [],
      date_to_add: "",
      repeat_unit: "week",
      repeat_interval: 1,
      repeat_until: "",
      repeat_weekdays: [parseDateKey(appointment.appointment_date).getDay()],
      start_time: appointment.start_time ?? "09:00",
      end_time: appointment.end_time ?? "",
      all_day: appointment.all_day,
      location: appointment.location,
      notes: appointment.notes,
    });
    setConfirmDelete(false);
    setFormError("");
  }

  function openNewHoliday(date = selectedDate) {
    setDraft(null);
    setHolidayDraft({
      member_id: null,
      title: "",
      holiday_date: date,
      schedule_mode: "once",
      range_end_date: "",
      additional_dates: [],
      date_to_add: "",
      notes: "",
    });
    setConfirmDelete(false);
    setFormError("");
  }

  function openEditHoliday(holiday: Holiday) {
    setDraft(null);
    setHolidayDraft({
      id: holiday.id,
      member_id: holiday.member_id,
      title: holiday.title,
      holiday_date: holiday.holiday_date,
      schedule_mode: "once",
      range_end_date: "",
      additional_dates: [],
      date_to_add: "",
      notes: holiday.notes,
    });
    setConfirmDelete(false);
    setFormError("");
  }

  function startDuplicate() {
    if (!draft?.id) return;
    setDraft({
      ...draft,
      id: undefined,
      duplicate_of_date: draft.appointment_date,
      appointment_date: "",
      schedule_mode: "once",
      additional_dates: [],
      date_to_add: "",
      repeat_until: "",
    });
    setConfirmDelete(false);
    setFormError("");
  }

  function submitAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    if (draft.duplicate_of_date && draft.appointment_date === draft.duplicate_of_date) {
      setFormError("Choose a different date for the duplicate.");
      return;
    }
    if (draft.schedule_mode === "repeat" && !draft.repeat_until) {
      setFormError("Choose when the repeating appointments should end.");
      return;
    }
    if (draft.schedule_mode === "repeat" && draft.repeat_until < draft.appointment_date) {
      setFormError("The repeat end date must be on or after the start date.");
      return;
    }
    const dates = scheduledDates(draft);
    if (dates.length === 0) {
      setFormError("Choose at least one appointment date.");
      return;
    }
    if (dates.length >= 200 && dateKey(parseDateKey(dates[dates.length - 1] ?? draft.appointment_date)) < draft.repeat_until) {
      setFormError("This pattern creates more than 200 appointments. Choose a shorter range.");
      return;
    }
    setFormError("");
    saveMutation.mutate(draft);
  }

  function submitHoliday(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!holidayDraft) return;
    if (holidayDraft.schedule_mode === "range" && !holidayDraft.range_end_date) {
      setFormError("Choose the last day of the holiday.");
      return;
    }
    if (holidayDraft.schedule_mode === "range" && holidayDraft.range_end_date < holidayDraft.holiday_date) {
      setFormError("The last day must be on or after the first day.");
      return;
    }
    const dates = holidayDates(holidayDraft);
    if (dates.length === 0) {
      setFormError("Choose at least one holiday date.");
      return;
    }
    if (dates.length >= 200 && dates[dates.length - 1] !== holidayDraft.range_end_date) {
      setFormError("A holiday range can include up to 200 days.");
      return;
    }
    setFormError("");
    saveHolidayMutation.mutate(holidayDraft);
  }

  function applyDateWindow(dayCount: number) {
    const end = addDays(today, dayCount - 1);
    setDateFilterStart(todayKey);
    setDateFilterEnd(dateKey(end));
    setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(todayKey);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = searchInput.trim();
    setSearchInput(next);
    setSearchTerm(next);
    if (next) setView("schedule");
  }

  const loading = membersQuery.isPending || appointmentsQuery.isPending || holidaysQuery.isPending;
  const loadError = membersQuery.isError || appointmentsQuery.isError || holidaysQuery.isError;

  return (
    <div className="app-shell">
      <SafeAreaTopScrim backgroundColor="var(--bg)" />
      <main className="calendar-page">
        <section className="calendar-panel" aria-label="Calendar">
          <header className="month-toolbar">
            <div>
              <p className="month-year">{month.toLocaleDateString([], { year: "numeric" })}</p>
              <h1>{month.toLocaleDateString([], { month: "long" })}</h1>
            </div>
            <div className="month-actions">
              <button className="today-button" type="button" onClick={goToday}>Today</button>
              <div className="stepper" aria-label="Change month">
                <button type="button" aria-label="Previous month" onClick={() => moveMonth(-1)}>
                  <ChevronIcon direction="left" />
                </button>
                <button type="button" aria-label="Next month" onClick={() => moveMonth(1)}>
                  <ChevronIcon direction="right" />
                </button>
              </div>
            </div>
          </header>

          <div className="member-filters" aria-label="Filter by family member">
            <button
              type="button"
              className={selectedMember === null ? "active" : ""}
              onClick={() => { setSelectedMember(null); if (view === "free" || view === "freeAfter") setView("schedule"); }}
            >
              Everyone
            </button>
            {members.map((member) => (
              <button
                key={member.id}
                type="button"
                className={selectedMember === member.id ? "active" : ""}
                onClick={() => { setSelectedMember(member.id); if (view === "free" || view === "freeAfter") setView("schedule"); }}
              >
                <span className="member-dot" style={{ backgroundColor: member.color }} />
                {member.name}
              </button>
            ))}
          </div>

          <div className="calendar-tools">
            <div className="view-switch" aria-label="Calendar view">
              <button type="button" className={view === "schedule" ? "active" : ""} onClick={() => setView("schedule")}>Schedule</button>
              <button type="button" className={view === "holidays" ? "active" : ""} onClick={() => setView("holidays")}>Holidays</button>
              <button
                type="button"
                className={view === "free" ? "active" : ""}
                onClick={() => { setView("free"); setSelectedMember(null); }}
              >
                Free days
              </button>
              <button
                type="button"
                className={view === "freeAfter" ? "active" : ""}
                onClick={() => { setView("freeAfter"); setSelectedMember(null); }}
              >
                Free after
              </button>
            </div>
            <button
              type="button"
              className={`date-filter-button ${dateFilterActive ? "active" : ""}`}
              aria-expanded={showDateFilter}
              onClick={() => setShowDateFilter((shown) => !shown)}
            >
              {dateFilterActive ? filterLabel : "Date window"}
            </button>
          </div>

          {view === "freeAfter" ? (
            <div className="free-after-panel">
              <label>
                <span>No activity after</span>
                <input
                  type="time"
                  aria-label="Show weekdays with no activity after"
                  value={freeAfterTime}
                  onChange={(event) => setFreeAfterTime(event.target.value || "17:00")}
                />
              </label>
              <p>
                <strong>{freeAfterCount} weekday{freeAfterCount === 1 ? "" : "s"}</strong> in {month.toLocaleDateString([], { month: "long" })}. All-day appointments count as busy.
              </p>
            </div>
          ) : null}

          {showDateFilter ? (
            <div className="date-filter-panel">
              <div className="date-window-presets" aria-label="Quick date windows">
                <span>Starting today</span>
                {[30, 60, 90].map((dayCount) => {
                  const presetEnd = dateKey(addDays(today, dayCount - 1));
                  const active = dateFilterStart === todayKey && dateFilterEnd === presetEnd;
                  return (
                    <button
                      type="button"
                      key={dayCount}
                      className={active ? "active" : ""}
                      aria-pressed={active}
                      onClick={() => applyDateWindow(dayCount)}
                    >
                      {dayCount} days
                    </button>
                  );
                })}
              </div>
              <label>
                <span>From</span>
                <input
                  type="date"
                  aria-label="Filter start date"
                  value={dateFilterStart}
                  onChange={(event) => {
                    const next = event.target.value;
                    setDateFilterStart(next);
                    if (next) {
                      const nextDate = parseDateKey(next);
                      setMonth(new Date(nextDate.getFullYear(), nextDate.getMonth(), 1));
                      setSelectedDate(next);
                    }
                    if (dateFilterEnd && next && dateFilterEnd < next) setDateFilterEnd("");
                  }}
                />
              </label>
              <span className="range-connector">to</span>
              <label>
                <span>To <small>optional</small></span>
                <input
                  type="date"
                  aria-label="Filter end date"
                  min={dateFilterStart || undefined}
                  disabled={!dateFilterStart}
                  value={dateFilterEnd}
                  onChange={(event) => setDateFilterEnd(event.target.value)}
                />
              </label>
              {dateFilterActive ? (
                <button type="button" className="clear-filter" onClick={() => { setDateFilterStart(""); setDateFilterEnd(""); }}>
                  Clear
                </button>
              ) : <p>Choose only “From” for one day.</p>}
            </div>
          ) : null}

          {loadError ? (
            <div className="load-state" role="alert">
              <p>We couldn’t load the calendar.</p>
              <button type="button" onClick={() => { void appointmentsQuery.refetch(); void holidaysQuery.refetch(); }}>Try again</button>
            </div>
          ) : (
            <div className={`month-grid-wrap ${loading ? "is-loading" : ""}`} aria-busy={loading}>
              <div className="weekday-row" aria-hidden="true">
                {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
              </div>
              <div className="month-grid">
                {days.map((day) => {
                  const key = dateKey(day);
                  const dayAppointments = appointmentsByDate.get(key) ?? [];
                  const allDayAppointments = allAppointmentsByDate.get(key) ?? [];
                  const dayHolidays = holidaysByDate.get(key) ?? [];
                  const isSelected = key === selectedDate;
                  const isToday = key === todayKey;
                  const insideDateWindow = !dateFilterStart || (!dateFilterEnd ? key === dateFilterStart : key >= dateFilterStart && key <= dateFilterEnd);
                  const isWeekday = day.getDay() >= 1 && day.getDay() <= 5;
                  const isFree = view === "free" && sameMonth(day, month) && insideDateWindow && allDayAppointments.length === 0;
                  const isFreeAfter = view === "freeAfter"
                    && sameMonth(day, month)
                    && insideDateWindow
                    && isWeekday
                    && !hasActivityAtOrAfter(allDayAppointments);
                  const hasHoliday = view === "holidays" && dayHolidays.length > 0;
                  const spokenStatus = view === "holidays"
                    ? hasHoliday ? `, ${dayHolidays.length} holiday${dayHolidays.length === 1 ? "" : "s"}` : ", no holidays"
                    : view === "free"
                      ? isFree ? ", free all day" : allDayAppointments.length ? `, ${allDayAppointments.length} appointments` : ""
                      : view === "freeAfter"
                        ? !isWeekday ? ", weekend" : isFreeAfter ? `, no activity after ${freeAfterLabel}` : `, activity after ${freeAfterLabel}`
                        : dayAppointments.length || dayHolidays.length
                          ? `, ${dayAppointments.length} appointments${dayHolidays.length ? ` and ${dayHolidays.length} holidays` : ""}`
                          : "";
                  return (
                    <button
                      type="button"
                      key={key}
                      className={`day-cell ${sameMonth(day, month) ? "" : "outside"} ${isSelected ? "selected" : ""} ${isFree || isFreeAfter ? "free" : ""} ${hasHoliday ? "holiday-day" : ""} ${view === "freeAfter" && !isWeekday ? "weekend" : ""} ${insideDateWindow ? "" : "outside-window"}`}
                      aria-label={`${day.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}${spokenStatus}`}
                      aria-pressed={isSelected}
                      onClick={() => setSelectedDate(key)}
                    >
                      <span className={isToday ? "date-number today" : "date-number"}>{day.getDate()}</span>
                      {view === "holidays" ? (
                        hasHoliday ? (
                          <span className="holiday-label" aria-hidden="true">
                            <span />
                            {dayHolidays.length === 1 ? dayHolidays[0]?.title : `${dayHolidays.length} holidays`}
                          </span>
                        ) : null
                      ) : view === "free" ? (
                        isFree ? <span className="free-label" aria-hidden="true">Free</span> : null
                      ) : view === "freeAfter" ? (
                        isFreeAfter ? <span className="free-label" aria-hidden="true">After {formatTime(freeAfterTime)}</span> : null
                      ) : (
                        <span className="event-dots" aria-hidden="true">
                          {dayHolidays.length ? <span className="holiday-dot" /> : null}
                          {dayAppointments.slice(0, dayHolidays.length ? 2 : 3).map((appointment) => (
                            <span key={appointment.id} style={{ backgroundColor: appointment.member_color }} />
                          ))}
                          {dayAppointments.length + dayHolidays.length > 3 ? <small>+{dayAppointments.length + dayHolidays.length - 3}</small> : null}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        <section className="agenda-panel" aria-labelledby="agenda-title">
          <div className="agenda-heading">
            <div className={`selected-date-block ${dateFilterActive || searchActive ? "range" : ""} ${view === "holidays" && !searchActive ? "holiday-view" : ""}`} aria-hidden="true">
              <strong>{dateFilterActive || searchActive ? agendaCount : selectedDateValue.getDate()}</strong>
              <span>{searchActive ? "matches" : dateFilterActive ? view === "holidays" ? "holidays" : "items" : selectedDateValue.toLocaleDateString([], { weekday: "short" })}</span>
            </div>
            <div>
              <p>{searchActive ? "Title search" : view === "holidays" ? "Holiday view" : dateFilterActive ? "Filtered schedule" : selectedDateValue.toLocaleDateString([], { month: "long", year: "numeric" })}</p>
              <h2 id="agenda-title">{searchActive ? `“${searchTerm}”` : dateFilterActive ? filterLabel : selectedDateValue.toLocaleDateString([], { weekday: "long" })}</h2>
            </div>
            <div className="agenda-actions">
              <button
                type="button"
                className="holiday-button"
                onClick={() => openNewHoliday(dateFilterStart || selectedDate)}
                aria-label={`Add holiday on ${selectedDateValue.toLocaleDateString([], { month: "long", day: "numeric" })}`}
              >
                <HolidayIcon />
                <span>Holiday</span>
              </button>
              <button
                type="button"
                className="add-button"
                onClick={() => openNew()}
                disabled={!members.length}
                aria-label={`Add appointment on ${selectedDateValue.toLocaleDateString([], { month: "long", day: "numeric" })}`}
              >
                <PlusIcon />
                <span>Add</span>
              </button>
            </div>
          </div>

          <form className="appointment-search" role="search" onSubmit={submitSearch}>
            <div className="search-field">
              <SearchIcon />
              <input
                type="search"
                aria-label="Search appointment titles"
                placeholder="Search appointment titles"
                value={searchInput}
                maxLength={120}
                onChange={(event) => setSearchInput(event.target.value)}
              />
              {searchInput || searchActive ? (
                <button
                  type="button"
                  className="search-clear"
                  aria-label="Clear appointment search"
                  onClick={() => { setSearchInput(""); setSearchTerm(""); }}
                >
                  <CloseIcon />
                </button>
              ) : null}
            </div>
            <button type="submit" className="search-submit" disabled={!searchInput.trim()}>Search</button>
            {searchActive ? <p>Person and date window filters also apply.</p> : null}
          </form>

          <div className="agenda-list">
            {searchActive && searchQuery.isError ? (
              <div className="agenda-empty" role="alert">
                <h3>Search unavailable</h3>
                <p>We couldn’t search appointment titles.</p>
                <button type="button" onClick={() => void searchQuery.refetch()}>Try again</button>
              </div>
            ) : loading || (searchActive && searchQuery.isPending) ? (
              <div className="agenda-empty"><p>Loading appointments…</p></div>
            ) : agendaCount === 0 ? (
              <div className="agenda-empty">
                <div className={`empty-mark ${view === "holidays" ? "holiday-empty-mark" : ""}`} aria-hidden="true"><span /><span /><span /></div>
                <h3>{searchActive ? "No matching appointments" : view === "holidays" ? "No holidays" : "Nothing scheduled"}</h3>
                <p>{searchActive
                  ? `No appointment titles contain “${searchTerm}”${dateFilterActive ? ` in ${filterLabel}` : ""}.`
                  : view === "holidays"
                    ? dateFilterActive
                      ? `No holidays in ${filterLabel}.`
                      : `No holidays on this day for ${selectedMember === null ? "the family" : members.find((member) => member.id === selectedMember)?.name ?? "this person"}.`
                    : dateFilterActive
                      ? `No appointments or holidays in ${filterLabel}.`
                      : `This day is clear for ${selectedMember === null ? "everyone" : members.find((member) => member.id === selectedMember)?.name ?? "this person"}.`}</p>
                {searchActive ? (
                  <button type="button" onClick={() => { setSearchInput(""); setSearchTerm(""); }}>Clear search</button>
                ) : (
                  <div className="empty-actions">
                    <button type="button" onClick={() => openNew(dateFilterStart || selectedDate)}>Add an appointment</button>
                    <button type="button" onClick={() => openNewHoliday(dateFilterStart || selectedDate)}>Add a holiday</button>
                  </div>
                )}
              </div>
            ) : (
              <>
                {agendaHolidays.map((holiday) => (
                  <button
                    type="button"
                    key={`holiday-${holiday.id}`}
                    className="appointment-row holiday-row"
                    onClick={() => openEditHoliday(holiday)}
                    aria-label={`Edit holiday ${holiday.title}`}
                  >
                    <span
                      className={`appointment-color ${holiday.member_id === null ? "holiday-color" : ""}`}
                      style={holiday.member_color ? { backgroundColor: holiday.member_color } : undefined}
                    />
                    <span className="appointment-time">
                      {dateFilterActive ? <small>{parseDateKey(holiday.holiday_date).toLocaleDateString([], { month: "short", day: "numeric" })}</small> : null}
                      All day
                    </span>
                    <span className="appointment-details">
                      <strong>{holiday.title}</strong>
                      <span>Holiday · {holiday.member_name}</span>
                    </span>
                    <ChevronIcon direction="right" />
                  </button>
                ))}
                {agendaAppointments.map((appointment) => (
                  <button
                    type="button"
                    key={appointment.id}
                    className="appointment-row"
                    onClick={() => openEdit(appointment)}
                    aria-label={`Edit ${appointment.title} for ${appointment.member_name}`}
                  >
                    <span className="appointment-color" style={{ backgroundColor: appointment.member_color }} />
                    <span className="appointment-time">
                      {dateFilterActive || searchActive ? <small>{parseDateKey(appointment.appointment_date).toLocaleDateString([], { month: "short", day: "numeric" })}</small> : null}
                      {appointmentTime(appointment)}
                    </span>
                    <span className="appointment-details">
                      <strong>{appointment.title}</strong>
                      <span>{appointment.member_name}{appointment.location ? ` · ${appointment.location}` : ""}</span>
                    </span>
                    <ChevronIcon direction="right" />
                  </button>
                ))}
              </>
            )}
          </div>
        </section>
      </main>

      {draft ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setDraft(null);
        }}>
          <section className="appointment-modal" role="dialog" aria-modal="true" aria-labelledby="appointment-form-title">
            <div className="modal-header">
              <div>
                <p>{draft.id ? "Appointment details" : draft.duplicate_of_date ? "Copy appointment" : "New appointment"}</p>
                <h2 id="appointment-form-title">{draft.id ? "Edit schedule" : draft.duplicate_of_date ? "Choose a new date" : "Add to the day"}</h2>
              </div>
              <button type="button" className="icon-button" aria-label="Close appointment form" onClick={() => setDraft(null)}>
                <CloseIcon />
              </button>
            </div>

            <form onSubmit={submitAppointment}>
              <fieldset className="person-picker">
                <legend>Family member</legend>
                <div>
                  {members.map((member: Member) => (
                    <label key={member.id} className={draft.member_id === member.id ? "selected" : ""}>
                      <input
                        type="radio"
                        name="member"
                        value={member.id}
                        checked={draft.member_id === member.id}
                        onChange={() => setDraft({ ...draft, member_id: member.id })}
                      />
                      <span className="avatar" style={{ backgroundColor: member.color }}>{member.name.charAt(0)}</span>
                      <span>{member.name}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="field full-field">
                <span>Appointment</span>
                <input
                  autoFocus={!draft.duplicate_of_date}
                  required
                  maxLength={120}
                  value={draft.title}
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                  placeholder="Dentist, checkup, class…"
                />
              </label>

              {!draft.id && !draft.duplicate_of_date ? (
                <fieldset className="schedule-picker">
                  <legend>Dates</legend>
                  <div className="schedule-tabs" aria-label="Appointment date options">
                    {([
                      ["once", "One date"],
                      ["multiple", "Multiple dates"],
                      ["repeat", "Repeat"],
                    ] as const).map(([mode, label]) => (
                      <button
                        type="button"
                        key={mode}
                        className={draft.schedule_mode === mode ? "active" : ""}
                        aria-pressed={draft.schedule_mode === mode}
                        onClick={() => {
                          const startDay = draft.appointment_date ? parseDateKey(draft.appointment_date).getDay() : 0;
                          setDraft({ ...draft, schedule_mode: mode, repeat_weekdays: mode === "repeat" ? [startDay] : draft.repeat_weekdays });
                          setFormError("");
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </fieldset>
              ) : null}

              <div className="field-row date-and-day-row">
                <label className="field">
                  <span>{draft.duplicate_of_date ? "New date" : draft.schedule_mode === "repeat" ? "Starts" : draft.schedule_mode === "multiple" ? "First date" : "Date"}</span>
                  <input
                    type="date"
                    autoFocus={Boolean(draft.duplicate_of_date)}
                    required
                    value={draft.appointment_date}
                    onChange={(event) => {
                      const nextDate = event.target.value;
                      const nextWeekday = nextDate ? parseDateKey(nextDate).getDay() : 0;
                      setDraft({
                        ...draft,
                        appointment_date: nextDate,
                        additional_dates: draft.additional_dates.filter((date) => date !== nextDate),
                        repeat_weekdays: draft.schedule_mode === "repeat" ? [nextWeekday] : draft.repeat_weekdays,
                      });
                      setFormError("");
                    }}
                  />
                </label>
                <label className="all-day-toggle">
                  <input
                    type="checkbox"
                    checked={draft.all_day}
                    onChange={(event) => setDraft({ ...draft, all_day: event.target.checked })}
                  />
                  <span aria-hidden="true" />
                  All day
                </label>
              </div>

              {!draft.id && draft.schedule_mode === "multiple" ? (
                <div className="multi-date-panel">
                  <div className="add-date-row">
                    <label className="field">
                      <span>Add another date</span>
                      <input
                        type="date"
                        aria-label="Additional appointment date"
                        value={draft.date_to_add}
                        onChange={(event) => setDraft({ ...draft, date_to_add: event.target.value })}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={!draft.date_to_add || draft.date_to_add === draft.appointment_date || draft.additional_dates.includes(draft.date_to_add)}
                      onClick={() => setDraft({
                        ...draft,
                        additional_dates: [...draft.additional_dates, draft.date_to_add].sort(),
                        date_to_add: "",
                      })}
                    >
                      Add date
                    </button>
                  </div>
                  {draft.additional_dates.length ? (
                    <div className="date-chip-list" aria-label="Additional dates">
                      {draft.additional_dates.map((date) => (
                        <span key={date}>
                          {formatShortDate(date)}
                          <button
                            type="button"
                            aria-label={`Remove ${formatShortDate(date)}`}
                            onClick={() => setDraft({ ...draft, additional_dates: draft.additional_dates.filter((item) => item !== date) })}
                          >
                            <CloseIcon />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : <p className="schedule-hint">Add any dates you want. They do not need to follow a pattern.</p>}
                </div>
              ) : null}

              {!draft.id && draft.schedule_mode === "repeat" ? (
                <div className="repeat-panel">
                  <div className="repeat-rule-row">
                    <label className="field interval-field">
                      <span>Every</span>
                      <input
                        type="number"
                        min={1}
                        max={12}
                        value={draft.repeat_interval}
                        onChange={(event) => setDraft({ ...draft, repeat_interval: Math.max(1, Math.min(12, Number(event.target.value) || 1)) })}
                      />
                    </label>
                    <label className="field">
                      <span>Frequency</span>
                      <select
                        value={draft.repeat_unit}
                        onChange={(event) => setDraft({ ...draft, repeat_unit: event.target.value as RepeatUnit })}
                      >
                        <option value="day">day{draft.repeat_interval === 1 ? "" : "s"}</option>
                        <option value="week">week{draft.repeat_interval === 1 ? "" : "s"}</option>
                        <option value="month">month{draft.repeat_interval === 1 ? "" : "s"}</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>Until</span>
                      <input
                        type="date"
                        required
                        min={draft.appointment_date || undefined}
                        value={draft.repeat_until}
                        onChange={(event) => { setDraft({ ...draft, repeat_until: event.target.value }); setFormError(""); }}
                      />
                    </label>
                  </div>
                  {draft.repeat_unit === "week" ? (
                    <fieldset className="weekday-picker">
                      <legend>On these days</legend>
                      <div>
                        {WEEKDAYS.map((day, index) => {
                          const selected = draft.repeat_weekdays.includes(index);
                          return (
                            <button
                              type="button"
                              key={day}
                              className={selected ? "active" : ""}
                              aria-label={`${WEEKDAY_LONG[index] ?? day}${selected ? ", selected" : ""}`}
                              aria-pressed={selected}
                              onClick={() => {
                                const next = selected
                                  ? draft.repeat_weekdays.filter((weekday) => weekday !== index)
                                  : [...draft.repeat_weekdays, index].sort();
                                if (next.length) setDraft({ ...draft, repeat_weekdays: next });
                              }}
                            >
                              {day.charAt(0)}
                            </button>
                          );
                        })}
                      </div>
                    </fieldset>
                  ) : null}
                  {draft.repeat_until && scheduledDates(draft).length ? (
                    <p className="repeat-summary">{scheduledDates(draft).length} appointment{scheduledDates(draft).length === 1 ? "" : "s"} through {formatShortDate(draft.repeat_until)}</p>
                  ) : <p className="schedule-hint">Choose an end date to preview the series.</p>}
                </div>
              ) : null}

              {!draft.all_day ? (
                <div className="field-row time-row">
                  <label className="field">
                    <span>Starts</span>
                    <input
                      type="time"
                      required
                      value={draft.start_time}
                      onChange={(event) => setDraft({ ...draft, start_time: event.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Ends <small>optional</small></span>
                    <input
                      type="time"
                      value={draft.end_time}
                      onChange={(event) => setDraft({ ...draft, end_time: event.target.value })}
                    />
                  </label>
                </div>
              ) : null}

              <label className="field full-field">
                <span>Location <small>optional</small></span>
                <input
                  maxLength={200}
                  value={draft.location}
                  onChange={(event) => setDraft({ ...draft, location: event.target.value })}
                  placeholder="Clinic, school, address…"
                />
              </label>

              <label className="field full-field">
                <span>Notes <small>optional</small></span>
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={draft.notes}
                  onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                  placeholder="What to bring or remember"
                />
              </label>

              {formError ? <p className="form-error" role="alert">{formError}</p> : null}

              {confirmDelete ? (
                <div className="delete-confirm" role="alert">
                  <p>Delete this appointment?</p>
                  <div>
                    <button type="button" onClick={() => setConfirmDelete(false)}>Keep it</button>
                    <button
                      type="button"
                      className="danger"
                      disabled={deleteMutation.isPending}
                      onClick={() => draft.id && deleteMutation.mutate(draft.id)}
                    >
                      {deleteMutation.isPending ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="form-actions">
                  {draft.id ? (
                    <div className="form-secondary-actions">
                      <button type="button" className="duplicate-button" onClick={startDuplicate}>
                        <DuplicateIcon />
                        Duplicate
                      </button>
                      <button type="button" className="delete-button" onClick={() => setConfirmDelete(true)}>Delete</button>
                    </div>
                  ) : <span />}
                  <button type="submit" className="save-button" disabled={saveMutation.isPending}>
                    {saveMutation.isPending
                      ? "Saving…"
                      : draft.id
                        ? "Save changes"
                        : draft.duplicate_of_date
                          ? "Create duplicate"
                          : scheduledDates(draft).length > 1
                            ? `Add ${scheduledDates(draft).length} appointments`
                            : "Add appointment"}
                  </button>
                </div>
              )}
            </form>
          </section>
        </div>
      ) : null}

      {holidayDraft ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setHolidayDraft(null);
        }}>
          <section className="appointment-modal holiday-modal" role="dialog" aria-modal="true" aria-labelledby="holiday-form-title">
            <div className="modal-header">
              <div>
                <p>{holidayDraft.id ? "Holiday details" : "New holiday"}</p>
                <h2 id="holiday-form-title">{holidayDraft.id ? "Edit holiday" : "Mark the day"}</h2>
              </div>
              <button type="button" className="icon-button" aria-label="Close holiday form" onClick={() => setHolidayDraft(null)}>
                <CloseIcon />
              </button>
            </div>

            <form onSubmit={submitHoliday}>
              <div className="holiday-intro">
                <span className="holiday-symbol" aria-hidden="true"><HolidayIcon /></span>
                <p>Mark one day, a continuous range, or selected days for the whole family or one person.</p>
              </div>

              <fieldset className="person-picker holiday-scope-picker">
                <legend>Who is this holiday for?</legend>
                <div>
                  <label className={holidayDraft.member_id === null ? "selected" : ""}>
                    <input
                      type="radio"
                      name="holiday-member"
                      checked={holidayDraft.member_id === null}
                      onChange={() => setHolidayDraft({ ...holidayDraft, member_id: null })}
                    />
                    <span className="avatar family-avatar">All</span>
                    <span>Entire family</span>
                  </label>
                  {members.map((member: Member) => (
                    <label key={member.id} className={holidayDraft.member_id === member.id ? "selected" : ""}>
                      <input
                        type="radio"
                        name="holiday-member"
                        value={member.id}
                        checked={holidayDraft.member_id === member.id}
                        onChange={() => setHolidayDraft({ ...holidayDraft, member_id: member.id })}
                      />
                      <span className="avatar" style={{ backgroundColor: member.color }}>{member.name.charAt(0)}</span>
                      <span>{member.name}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="field full-field">
                <span>Holiday name</span>
                <input
                  autoFocus
                  required
                  maxLength={120}
                  value={holidayDraft.title}
                  onChange={(event) => setHolidayDraft({ ...holidayDraft, title: event.target.value })}
                  placeholder="School holiday, festival, day off…"
                />
              </label>

              {!holidayDraft.id ? (
                <fieldset className="schedule-picker holiday-date-picker">
                  <legend>Days</legend>
                  <div className="schedule-tabs" aria-label="Holiday date options">
                    {([
                      ["once", "One day"],
                      ["range", "Date range"],
                      ["multiple", "Multiple days"],
                    ] as const).map(([mode, label]) => (
                      <button
                        type="button"
                        key={mode}
                        className={holidayDraft.schedule_mode === mode ? "active" : ""}
                        aria-pressed={holidayDraft.schedule_mode === mode}
                        onClick={() => {
                          setHolidayDraft({ ...holidayDraft, schedule_mode: mode });
                          setFormError("");
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </fieldset>
              ) : null}

              <label className="field full-field">
                <span>{holidayDraft.schedule_mode === "range" ? "First day" : holidayDraft.schedule_mode === "multiple" ? "First day" : "Date"}</span>
                <input
                  type="date"
                  required
                  value={holidayDraft.holiday_date}
                  onChange={(event) => {
                    const nextDate = event.target.value;
                    setHolidayDraft({
                      ...holidayDraft,
                      holiday_date: nextDate,
                      additional_dates: holidayDraft.additional_dates.filter((date) => date !== nextDate),
                      range_end_date: holidayDraft.range_end_date && holidayDraft.range_end_date < nextDate ? "" : holidayDraft.range_end_date,
                    });
                    setFormError("");
                  }}
                />
              </label>

              {!holidayDraft.id && holidayDraft.schedule_mode === "range" ? (
                <div className="holiday-range-panel">
                  <label className="field">
                    <span>Last day</span>
                    <input
                      type="date"
                      required
                      min={holidayDraft.holiday_date || undefined}
                      value={holidayDraft.range_end_date}
                      onChange={(event) => {
                        setHolidayDraft({ ...holidayDraft, range_end_date: event.target.value });
                        setFormError("");
                      }}
                    />
                  </label>
                  {holidayDates(holidayDraft).length ? (
                    <p className="repeat-summary">
                      {holidayDates(holidayDraft).length} continuous day{holidayDates(holidayDraft).length === 1 ? "" : "s"}
                    </p>
                  ) : <p className="schedule-hint">Every day from the first through the last day will be marked.</p>}
                </div>
              ) : null}

              {!holidayDraft.id && holidayDraft.schedule_mode === "multiple" ? (
                <div className="multi-date-panel holiday-multi-date-panel">
                  <div className="add-date-row">
                    <label className="field">
                      <span>Add another day</span>
                      <input
                        type="date"
                        aria-label="Additional holiday date"
                        value={holidayDraft.date_to_add}
                        onChange={(event) => setHolidayDraft({ ...holidayDraft, date_to_add: event.target.value })}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={!holidayDraft.date_to_add || holidayDraft.date_to_add === holidayDraft.holiday_date || holidayDraft.additional_dates.includes(holidayDraft.date_to_add)}
                      onClick={() => setHolidayDraft({
                        ...holidayDraft,
                        additional_dates: [...holidayDraft.additional_dates, holidayDraft.date_to_add].sort(),
                        date_to_add: "",
                      })}
                    >
                      Add day
                    </button>
                  </div>
                  {holidayDraft.additional_dates.length ? (
                    <div className="date-chip-list" aria-label="Additional holiday dates">
                      {holidayDraft.additional_dates.map((date) => (
                        <span key={date}>
                          {formatShortDate(date)}
                          <button
                            type="button"
                            aria-label={`Remove ${formatShortDate(date)}`}
                            onClick={() => setHolidayDraft({ ...holidayDraft, additional_dates: holidayDraft.additional_dates.filter((item) => item !== date) })}
                          >
                            <CloseIcon />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : <p className="schedule-hint">Pick any days you need. They do not have to be next to each other.</p>}
                </div>
              ) : null}

              <label className="field full-field">
                <span>Notes <small>optional</small></span>
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={holidayDraft.notes}
                  onChange={(event) => setHolidayDraft({ ...holidayDraft, notes: event.target.value })}
                  placeholder="Plans or a reminder for the family"
                />
              </label>

              {formError ? <p className="form-error" role="alert">{formError}</p> : null}

              {confirmDelete ? (
                <div className="delete-confirm" role="alert">
                  <p>Delete this holiday?</p>
                  <div>
                    <button type="button" onClick={() => setConfirmDelete(false)}>Keep it</button>
                    <button
                      type="button"
                      className="danger"
                      disabled={deleteHolidayMutation.isPending}
                      onClick={() => holidayDraft.id && deleteHolidayMutation.mutate(holidayDraft.id)}
                    >
                      {deleteHolidayMutation.isPending ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="form-actions">
                  {holidayDraft.id ? (
                    <button type="button" className="delete-button" onClick={() => setConfirmDelete(true)}>Delete holiday</button>
                  ) : <span />}
                  <button type="submit" className="save-button" disabled={saveHolidayMutation.isPending}>
                    {saveHolidayMutation.isPending
                      ? "Saving…"
                      : holidayDraft.id
                        ? "Save changes"
                        : holidayDates(holidayDraft).length > 1
                          ? `Add ${holidayDates(holidayDraft).length} holiday days`
                          : "Add holiday"}
                  </button>
                </div>
              )}
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
