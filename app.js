(() => {
  "use strict";

  const STORAGE_KEY = "seaPlanner.state.v1";
  const MIN_DATE = "1900-01-01";
  const MAX_DATE = "9999-12-31";
  const DAY_MS = 86400000;
  const MAX_EXPORT_BYTES = 2097152;
  const QUOTES = ["Двигаться можно мягко. Главное — слышать себя", "Сегодня достаточно одного бережного шага", "У твоего ритма есть место для отдыха"];
  const STATUS_LABELS = { planned: "Запланировано", done: "Выполнено", skipped: "Пропущено" };
  const IMAGES = [
    ["strength", "Силовые"], ["pilates", "Пилатес"], ["tribal", "Трайбл"], ["yoga", "Йога"],
    ["swimming", "Плавание"], ["running", "Бег"], ["walking", "Прогулка"], ["cycling", "Велосипед"],
    ["stretching", "Растяжка"], ["breathing", "Дыхание"], ["mobility", "Подвижность"], ["balance", "Баланс"]
  ];
  const COLORS = [
    ["#F0B2A6", "Коралловый"], ["#B8D5BB", "Шалфей"], ["#C9B9DD", "Сирень"], ["#B5D8EB", "Голубой"],
    ["#B9DAD5", "Бирюза"], ["#E5BED0", "Розовый"], ["#D8DFA8", "Светло-зелёный"], ["#BFCDE8", "Барвинок"]
  ];
  const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

  function calendarDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split("-").map(Number);
    const result = new Date(0);
    result.setUTCHours(0, 0, 0, 0);
    result.setUTCFullYear(year, month - 1, day);
    if (result.getUTCFullYear() !== year || result.getUTCMonth() !== month - 1 || result.getUTCDate() !== day) return null;
    return result;
  }

  function isValidDate(value) { return !!calendarDate(value) && value >= MIN_DATE && value <= MAX_DATE; }
  function dayNumber(value) { return Math.floor(calendarDate(value).getTime() / DAY_MS); }
  function dateFromDay(value) {
    const date = new Date(value * DAY_MS);
    return `${String(date.getUTCFullYear()).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  }
  function addDays(value, amount) { return dateFromDay(dayNumber(value) + amount); }
  function monday(value) {
    const date = calendarDate(value);
    return dateFromDay(dayNumber(value) - (date.getUTCDay() + 6) % 7);
  }
  function localDate(date) { return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
  function today() {
    const value = localDate(new Date());
    return value < MIN_DATE ? MIN_DATE : value > MAX_DATE ? MAX_DATE : value;
  }
  function humanDate(value) {
    const [year, month, day] = value.split("-").map(Number);
    return `${day} ${MONTHS[month - 1]} ${year}`;
  }
  function weekLabel(start) {
    const end = dateFromDay(dayNumber(start) + 6);
    const [y1, m1, d1] = start.split("-").map(Number);
    const [y2, m2, d2] = end.split("-").map(Number);
    if (y1 !== y2) return `${d1} ${MONTHS[m1 - 1]} ${y1} — ${d2} ${MONTHS[m2 - 1]} ${y2}`;
    if (m1 !== m2) return `${d1} ${MONTHS[m1 - 1]} — ${d2} ${MONTHS[m2 - 1]} ${y1}`;
    return `${d1}–${d2} ${MONTHS[m1 - 1]} ${y1}`;
  }
  function normalizeText(value, collapseSpaces = false) { const text = value.trim().toLocaleLowerCase("ru-RU").replace(/ё/g, "е"); return collapseSpaces ? text.replace(/\s+/g, " ") : text; }
  function normalizeName(value) { return normalizeText(value, true); }
  function timeMinutes(value) { const [hours, minutes] = value.split(":").map(Number); return hours * 60 + minutes; }
  function timeLabel(minutes) { return minutes === 1440 ? "24:00" : `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`; }
  function clone(value) { return structuredClone(value); }

  function initialState() {
    return {
      schemaVersion: 1, revision: 0, updatedAt: new Date().toISOString(),
      types: [
        { id: "strength", name: "Силовые", color: "#F0B2A6", imageId: "strength", archived: false },
        { id: "pilates", name: "Пилатес", color: "#B8D5BB", imageId: "pilates", archived: false },
        { id: "tribal", name: "Танцы — Трайбл", color: "#C9B9DD", imageId: "tribal", archived: false },
        { id: "yoga", name: "Йога и медитация", color: "#B5D8EB", imageId: "yoga", archived: false }
      ],
      workouts: [], series: [], exceptions: [], goals: [], remindersShown: [],
      settings: { remindersEnabled: true, quotesVisible: true },
      backup: { startedDate: today(), lastExportDate: null, reminderDismissedDate: null }
    };
  }

  function workoutErrors(workout, types) {
    const errors = {};
    if (!types.some(type => type.id === workout.typeId)) errors.typeId = "Выбери вид тренировки";
    if (!isValidDate(workout.date)) errors.date = "Выбери существующую дату от 1900 до 9999 года";
    if (workout.time !== null && (typeof workout.time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(workout.time))) errors.time = "Укажи время в формате 09:00";
    if (!Number.isInteger(workout.durationMinutes) || workout.durationMinutes < 1 || workout.durationMinutes > 1440) errors.durationMinutes = "От 1 до 1440 минут, целое число";
    if (!errors.time && !errors.durationMinutes && workout.time !== null && timeMinutes(workout.time) + workout.durationMinutes > 1440) errors.durationMinutes = "Занятие должно закончиться не позже полуночи";
    if (typeof workout.note !== "string" || workout.note.length > 2000) errors.note = "Заметка не длиннее 2000 символов";
    if (!Object.hasOwn(STATUS_LABELS, workout.status)) errors.status = "Выбери статус занятия";
    return errors;
  }

  function conflicts(workout, workouts) {
    if (!workout.time || workout.status === "skipped") return [];
    const start = timeMinutes(workout.time);
    const end = start + workout.durationMinutes;
    return workouts.filter(other => other.id !== workout.id && other.date === workout.date && other.time && other.status !== "skipped" && start < timeMinutes(other.time) + other.durationMinutes && timeMinutes(other.time) < end)
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.id.localeCompare(b.id));
  }

  function exactKeys(value, keys) {
    return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
  }

  function isIsoMoment(value) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value; }
  function quoteFor(date) { return QUOTES[(dayNumber(date) - dayNumber("0001-01-01")) % 3]; }
  function backupDue(data, date) {
    const last = [data.backup.startedDate, data.backup.lastExportDate, data.backup.reminderDismissedDate].filter(Boolean).sort().at(-1);
    return dayNumber(date) - dayNumber(last) >= 30;
  }
  function localStart(workout) {
    const [year, month, day] = workout.date.split("-").map(Number); const [hours, minutes] = workout.time.split(":").map(Number);
    const result = new Date(year, month - 1, day, hours, minutes, 0, 0);
    const requested = dayNumber(workout.date) * 1440 + hours * 60 + minutes;
    const wallMinute = date => dayNumber(localDate(date)) * 1440 + date.getHours() * 60 + date.getMinutes();
    // In a skipped local interval, use the first real minute after the gap.
    if (wallMinute(result) !== requested) {
      for (let count = 0; count < 2880; count++) { const previous = new Date(result.getTime() - 60000); if (wallMinute(previous) < requested) break; result.setTime(previous.getTime()); }
    }
    return result.getTime();
  }
  function reminderPlan(data, now) {
    const due = []; let next = Infinity;
    if (!data.settings.remindersEnabled) return { due, delay: null };
    const shown = new Set(data.remindersShown.map(item => item.occurrenceId));
    for (const workout of occurrences(data, localDate(now), MAX_DATE)) {
      if (!workout.time || workout.status !== "planned" || shown.has(workout.id)) continue;
      const delta = localStart(workout) - now.getTime(); if (delta <= 0) continue;
      if (delta <= 900000) due.push(workout); else next = Math.min(next, delta - 900000);
    }
    due.sort((a, b) => localStart(a) - localStart(b) || a.id.localeCompare(b.id));
    return { due, delay: Number.isFinite(next) ? Math.min(DAY_MS, Math.max(1, next)) : null };
  }
  function parseStateJSON(text) {
    let value; try { value = JSON.parse(text); } catch { throw new Error("Некорректный JSON"); }
    let cursor = 0;
    const whitespace = () => { while (/\s/.test(text[cursor] || "") && cursor < text.length) cursor++; };
    const string = () => { const start = cursor++; while (cursor < text.length) { if (text[cursor] === "\\") cursor += 2; else if (text[cursor++] === '"') break; } return JSON.parse(text.slice(start, cursor)); };
    // JSON.parse validates syntax; this walk rejects duplicate object keys it would hide.
    function walk() {
      whitespace(); const token = text[cursor];
      if (token === "{") {
        cursor++; whitespace(); const keys = new Set(); if (text[cursor] === "}") { cursor++; return; }
        for (;;) { const key = string(); if (keys.has(key)) throw new Error("В JSON повторяется ключ: " + key); keys.add(key); whitespace(); cursor++; walk(); whitespace(); if (text[cursor++] === "}") break; whitespace(); }
      } else if (token === "[") {
        cursor++; whitespace(); if (text[cursor] === "]") { cursor++; return; }
        for (;;) { walk(); whitespace(); if (text[cursor++] === "]") break; }
      } else if (token === '"') string();
      else while (cursor < text.length && !/[\s,}\]]/.test(text[cursor])) cursor++;
    }
    walk(); return value;
  }

  function addYears(value, years) {
    const [year, month, day] = value.split("-").map(Number);
    if (year + years > 9999) return MAX_DATE;
    const candidate = `${year + years}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return calendarDate(candidate) ? candidate : `${year + years}-02-28`;
  }
  function segmentEnd(segment) { return segment.toDate && segment.toDate < segment.endDate ? segment.toDate : segment.endDate; }
  function matchesSegment(segment, date) {
    if (date < segment.fromDate || date > segmentEnd(segment)) return false;
    const weekday = (calendarDate(date).getUTCDay() + 6) % 7 + 1;
    return segment.weekdays.includes(weekday) && ((dayNumber(monday(date)) - dayNumber(monday(segment.fromDate))) / 7) % segment.intervalWeeks === 0;
  }
  function segmentFor(series, date) { return series.segments.find(segment => matchesSegment(segment, date)); }
  function* segmentDates(segment, from = MIN_DATE, to = MAX_DATE) {
    const end = dayNumber(segmentEnd(segment) < to ? segmentEnd(segment) : to);
    for (let number = dayNumber(segment.fromDate > from ? segment.fromDate : from); number <= end; number++) {
      const date = dateFromDay(number); if (matchesSegment(segment, date)) yield date;
    }
  }
  function snapshot(workout) { const { typeId, date, time, durationMinutes, note, status } = workout; return { typeId, date, time, durationMinutes, note, status }; }
  function occurrence(series, date, segment, override) {
    return { id: `${series.id}:${date}`, seriesId: series.id, scheduledDate: date, ...(override || { typeId: segment.typeId, date, time: segment.time, durationMinutes: segment.durationMinutes, note: segment.note, status: "planned" }) };
  }
  function resolveWorkout(data, id) {
    if (!id.includes(":")) return data.workouts.find(item => item.id === id);
    const [seriesId, date] = id.split(":"); const series = data.series.find(item => item.id === seriesId);
    const segment = series && segmentFor(series, date); if (!segment) return null;
    const exception = data.exceptions.find(item => item.seriesId === seriesId && item.scheduledDate === date);
    return exception?.kind === "deleted" ? null : occurrence(series, date, segment, exception?.workout);
  }
  function* occurrences(data, from = MIN_DATE, to = MAX_DATE) {
    if (from < MIN_DATE) from = MIN_DATE;
    if (to.length > 10) to = MAX_DATE;
    for (const workout of data.workouts) if (workout.date >= from && workout.date <= to) yield workout;
    const exceptions = new Map(data.exceptions.map(item => [`${item.seriesId}:${item.scheduledDate}`, item]));
    for (const series of data.series) for (const segment of series.segments) for (const date of segmentDates(segment, from, to)) {
      if (!exceptions.has(`${series.id}:${date}`)) yield occurrence(series, date, segment);
    }
    for (const exception of data.exceptions) if (exception.kind === "override" && exception.workout.date >= from && exception.workout.date <= to) {
      const series = data.series.find(item => item.id === exception.seriesId);
      yield occurrence(series, exception.scheduledDate, segmentFor(series, exception.scheduledDate), exception.workout);
    }
  }
  function scheduleConflicts(data) {
    const days = new Map(); const pairs = [];
    for (const workout of occurrences(data)) if (workout.time && workout.status !== "skipped") {
      if (!days.has(workout.date)) days.set(workout.date, []); days.get(workout.date).push(workout);
    }
    for (const list of days.values()) {
      list.sort((a, b) => a.time.localeCompare(b.time) || a.id.localeCompare(b.id));
      for (let index = 0; index < list.length; index++) {
        const a = list[index]; const end = timeMinutes(a.time) + a.durationMinutes;
        for (let other = index + 1; other < list.length && timeMinutes(list[other].time) < end; other++) pairs.push([a, list[other]]);
      }
    }
    return pairs.sort((a, b) => a[0].date.localeCompare(b[0].date) || a[0].time.localeCompare(b[0].time));
  }
  function replaceWorkout(data, workout) {
    if (workout.seriesId) {
      data.exceptions = data.exceptions.filter(item => `${item.seriesId}:${item.scheduledDate}` !== workout.id);
      data.exceptions.push({ seriesId: workout.seriesId, scheduledDate: workout.scheduledDate, kind: "override", workout: snapshot(workout) });
    } else {
      const index = data.workouts.findIndex(item => item.id === workout.id);
      if (index < 0) data.workouts.push(workout); else data.workouts[index] = workout;
    }
  }
  function removeWorkout(data, workout) {
    if (workout.seriesId) {
      data.exceptions = data.exceptions.filter(item => `${item.seriesId}:${item.scheduledDate}` !== workout.id);
      data.exceptions.push({ seriesId: workout.seriesId, scheduledDate: workout.scheduledDate, kind: "deleted", workout: null });
    } else data.workouts = data.workouts.filter(item => item.id !== workout.id);
  }
  // Rebuild the future rule atomically; preserve overrides moved into the past.
  function changeFollowing(data, original, replacement, currentDate, idFactory) {
    const series = data.series.find(item => item.id === original.seriesId); const boundary = original.scheduledDate;
    const oldExceptions = data.exceptions.filter(item => item.seriesId === series.id && item.scheduledDate >= boundary);
    series.segments = series.segments.filter(segment => segment.fromDate < boundary).map(segment => ({ ...segment, toDate: segmentEnd(segment) >= boundary ? addDays(boundary, -1) : segment.toDate }));
    series.segments = series.segments.filter(segment => [...segmentDates(segment)].length);
    if (replacement) series.segments.push(replacement);
    let retained = 0; let removed = 0; let preserved = 0;
    data.exceptions = data.exceptions.filter(item => item.seriesId !== series.id || item.scheduledDate < boundary);
    for (const exception of oldExceptions) {
      if (segmentFor(series, exception.scheduledDate)) { data.exceptions.push(exception); retained++; }
      else {
        removed++;
        if (exception.kind === "override" && exception.workout.date < currentDate) {
          const id = idFactory(); data.workouts.push({ id, ...exception.workout }); preserved++;
          const oldId = `${series.id}:${exception.scheduledDate}`;
          data.remindersShown = data.remindersShown.map(item => item.occurrenceId === oldId ? { ...item, occurrenceId: id } : item);
        }
      }
    }
    if (!series.segments.length) data.series = data.series.filter(item => item.id !== series.id);
    return { retained, removed, preserved };
  }
  function weekStats(data, start) {
    const stats = { planned: 0, done: 0, skipped: 0, minutes: 0, potentialCount: 0, potentialMinutes: 0, byType: new Map() };
    for (const workout of occurrences(data, start, addDays(start, 6))) {
      stats[workout.status]++;
      if (workout.status !== "skipped") { stats.potentialCount++; stats.potentialMinutes += workout.durationMinutes; }
      if (workout.status === "done") {
        stats.minutes += workout.durationMinutes;
        const item = stats.byType.get(workout.typeId) || { count: 0, minutes: 0 }; item.count++; item.minutes += workout.durationMinutes; stats.byType.set(workout.typeId, item);
      }
    }
    return stats;
  }
  function validTarget(value, maximum) { return value === null || Number.isInteger(value) && value >= 1 && value <= maximum; }
  function goalError(goal, types) {
    if (!exactKeys(goal, ["weekStart", "countTarget", "minutesTarget", "typeTargets"]) || !isValidDate(goal.weekStart) || monday(goal.weekStart) !== goal.weekStart || !Array.isArray(goal.typeTargets)) return "Некорректная цель недели";
    if (!validTarget(goal.countTarget, 99)) return "Цель по занятиям: целое число от 1 до 99 или пустое поле";
    if (!validTarget(goal.minutesTarget, 10080)) return "Цель по минутам: целое число от 1 до 10080 или пустое поле";
    const seen = new Set();
    for (const target of goal.typeTargets) {
      if (!exactKeys(target, ["typeId", "countTarget"]) || !types.some(type => type.id === target.typeId) || seen.has(target.typeId) || target.countTarget === null || !validTarget(target.countTarget, 99)) return "Цели по видам: уникальный вид и целое число от 1 до 99";
      seen.add(target.typeId);
    }
    return null;
  }
  function segmentError(segment, types) {
    if (!exactKeys(segment, ["fromDate", "toDate", "typeId", "time", "durationMinutes", "note", "weekdays", "intervalWeeks", "endDate"]) || !isValidDate(segment.fromDate) || !isValidDate(segment.endDate) || segment.endDate < segment.fromDate || segment.endDate > addYears(segment.fromDate, 2) || segment.toDate !== null && (!isValidDate(segment.toDate) || segment.toDate < segment.fromDate)) return "Конец повторений: от начала до двух календарных лет после него";
    const errors = workoutErrors({ ...segment, date: segment.fromDate, status: "planned" }, types);
    if (Object.keys(errors).length) return Object.values(errors).join(". ");
    if (!Number.isInteger(segment.intervalWeeks) || segment.intervalWeeks < 1 || segment.intervalWeeks > 12) return "Интервал: целое число от 1 до 12 недель";
    if (!Array.isArray(segment.weekdays) || !segment.weekdays.length || segment.weekdays.some((day, index) => !Number.isInteger(day) || day < 1 || day > 7 || index && day <= segment.weekdays[index - 1])) return "Выбери хотя бы один день недели";
    if (![...segmentDates(segment)].length) return "В выбранном периоде нет ни одного занятия";
    return null;
  }

  function validateState(value) {
    const fail = message => { throw new Error(message); };
    if (!value || value.schemaVersion !== 1) fail("Эта версия данных не поддерживается");
    if (!exactKeys(value, ["schemaVersion", "revision", "updatedAt", "types", "workouts", "series", "exceptions", "goals", "remindersShown", "settings", "backup"])) fail("Неверный формат сохранённых данных");
    if (!Number.isSafeInteger(value.revision) || value.revision < 0 || !isIsoMoment(value.updatedAt)) fail("Повреждены метаданные");
    for (const key of ["types", "workouts", "series", "exceptions", "goals", "remindersShown"]) if (!Array.isArray(value[key])) fail("Неверный формат списков");
    const ids = new Set();
    const names = new Set();
    for (const type of value.types) {
      if (!exactKeys(type, ["id", "name", "color", "imageId", "archived"]) || typeof type.id !== "string" || !/^(strength|pilates|tribal|yoga|type-[A-Za-z0-9_-]{1,100})$/.test(type.id) || ids.has(type.id)) fail("Неверный или повторяющийся ID вида");
      if (typeof type.name !== "string" || type.name.trim().length < 1 || type.name.length > 60 || names.has(normalizeName(type.name))) fail("Неверное или повторяющееся название вида");
      if (!COLORS.some(([color]) => color === type.color) || !IMAGES.some(([id]) => id === type.imageId) || typeof type.archived !== "boolean") fail("Неверное оформление вида");
      ids.add(type.id); names.add(normalizeName(type.name));
    }
    for (const workout of value.workouts) {
      if (!exactKeys(workout, ["id", "typeId", "date", "time", "durationMinutes", "note", "status"]) || typeof workout.id !== "string" || !/^workout-[A-Za-z0-9_-]{1,100}$/.test(workout.id) || ids.has(workout.id)) fail("Неверный или повторяющийся ID занятия");
      if (Object.keys(workoutErrors(workout, value.types)).length) fail("В сохранённых занятиях есть некорректные поля");
      ids.add(workout.id);
    }
    for (const series of value.series) {
      if (!exactKeys(series, ["id", "segments"]) || typeof series.id !== "string" || !/^series-[A-Za-z0-9_-]{1,100}$/.test(series.id) || ids.has(series.id) || !Array.isArray(series.segments) || !series.segments.length) fail("Некорректная серия");
      ids.add(series.id);
      let previousEnd = null;
      for (const segment of series.segments) {
        const error = segmentError(segment, value.types); if (error) fail(error);
        if (previousEnd && segment.fromDate <= previousEnd) fail("Сегменты серии пересекаются или не отсортированы"); previousEnd = segmentEnd(segment);
      }
    }
    const exceptionIds = new Set();
    for (const exception of value.exceptions) {
      if (!exactKeys(exception, ["seriesId", "scheduledDate", "kind", "workout"]) || !isValidDate(exception.scheduledDate)) fail("Некорректное исключение");
      const series = value.series.find(item => item.id === exception.seriesId); const id = `${exception.seriesId}:${exception.scheduledDate}`;
      if (!series || !segmentFor(series, exception.scheduledDate) || exceptionIds.has(id)) fail("Исключение не имеет исходного экземпляра или повторяется");
      exceptionIds.add(id);
      if (exception.kind === "deleted") { if (exception.workout !== null) fail("Удалённое исключение должно быть пустым"); }
      else if (exception.kind !== "override" || !exactKeys(exception.workout, ["typeId", "date", "time", "durationMinutes", "note", "status"]) || Object.keys(workoutErrors(exception.workout, value.types)).length) fail("Некорректный снимок исключения");
    }
    const weeks = new Set();
    for (const goal of value.goals) {
      const error = goalError(goal, value.types); if (error) fail(error);
      if (weeks.has(goal.weekStart) || goal.countTarget === null && goal.minutesTarget === null && !goal.typeTargets.length) fail("Повторяющаяся или пустая цель"); weeks.add(goal.weekStart);
    }
    const reminderIds = new Set();
    for (const item of value.remindersShown) {
      if (!exactKeys(item, ["occurrenceId", "shownAt"]) || typeof item.occurrenceId !== "string" || !/^(workout-[A-Za-z0-9_-]{1,100}|series-[A-Za-z0-9_-]{1,100}:\d{4}-\d{2}-\d{2})$/.test(item.occurrenceId) || item.occurrenceId.includes(":") && !isValidDate(item.occurrenceId.split(":")[1]) || reminderIds.has(item.occurrenceId) || !isIsoMoment(item.shownAt)) fail("Некорректный журнал напоминаний"); reminderIds.add(item.occurrenceId);
    }
    if (scheduleConflicts(value).length) fail("В сохранённых данных есть пересекающиеся занятия");
    if (!exactKeys(value.settings, ["remindersEnabled", "quotesVisible"]) || typeof value.settings.remindersEnabled !== "boolean" || typeof value.settings.quotesVisible !== "boolean") fail("Неверные настройки");
    if (!exactKeys(value.backup, ["startedDate", "lastExportDate", "reminderDismissedDate"]) || !isValidDate(value.backup.startedDate) || [value.backup.lastExportDate, value.backup.reminderDismissedDate].some(date => date !== null && !isValidDate(date))) fail("Неверные сведения о резервных копиях");
    if (new TextEncoder().encode(JSON.stringify(value, null, 2)).length > MAX_EXPORT_BYTES || JSON.stringify(value).length * 2 > 4194304) fail("Достигнут лимит объёма данных. Скачай копию и удали ненужные записи");
    return value;
  }

  const $ = id => document.getElementById(id);
  const assets = new Map([...$("image-assets").content.querySelectorAll("img")].map(img => [img.dataset.imageId, img.getAttribute("src")]));
  let state = initialState();
  let loadedRaw = null;
  let dirty = false;
  let blocked = false;
  let rawDamaged = null;
  let selectedDate = today();
  let selectedMonday = monday(selectedDate);
  let currentDay = today();
  let editingWorkout = null;
  let editingType = null;
  let workoutSnapshot = "";
  let typeSnapshot = "";
  let confirmation = null;
  let midnightTimer = null;
  let editingFollowing = false;
  let scopeRequest = null;
  let repeatEndTouched = false;
  let repeatWeekdaysTouched = false;
  let conflictCreation = null;
  let goalsSnapshot = "";
  let goalsWeek = null;
  let searchToken = 0;
  let searchResults = [];
  let searchLimit = 50;
  let highlightedId = null;
  let lastSavedWorkoutId = null;
  let pendingSavedScroll = null;
  let storageConflict = false;
  let reminderTimer = null;
  let reminderRows = [];
  let supportBusy = false;
  let pendingImport = null;
  let importReadToken = 0;
  let importing = false;
  const dialogOrigins = new WeakMap();

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function icon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("icon"); svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS(svg.namespaceURI, "use"); use.setAttribute("href", `#icon-${name}`); svg.append(use); return svg;
  }
  function iconButton(name, label, action, id) {
    const button = node("button", "icon-button"); button.type = "button"; button.title = label; button.setAttribute("aria-label", label); button.append(icon(name));
    if (action) button.dataset.action = action;
    if (id) button.dataset.recordId = id;
    return button;
  }
  function artwork(imageId, className) {
    const img = node("img", className); img.alt = ""; img.src = assets.get(imageId); img.width = 240; img.height = 160; return img;
  }
  function announce(message) { $("announcement").textContent = message; }
  function formSignature(form) { return JSON.stringify([...new FormData(form).entries()]); }
  function newId(prefix) {
    let id;
    const existing = new Set([...state.types, ...state.workouts, ...state.series].map(record => record.id));
    do { id = `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`}`; } while (existing.has(id));
    return id;
  }

  function storageWarning(message, damaged = false) {
    $("storage-warning").hidden = false; $("storage-message").textContent = message;
    $("retry-save").hidden = damaged || storageConflict; $("save-status-text").textContent = damaged ? "Данные требуют восстановления" : storageConflict ? "Данные изменились в другом окне" : "Изменения не сохранены в браузере";
    $("restore-data").hidden = !damaged; $("reset-data").hidden = !damaged; $("load-latest").hidden = !storageConflict;
    $("download-data").lastChild.textContent = damaged ? "Скачать исходные данные" : "Скачать копию";
  }
  function hasDrafts() {
    return $("workout-dialog").open && formSignature($("workout-form")) !== workoutSnapshot || $("type-editor-dialog").open && formSignature($("type-form")) !== typeSnapshot || $("goals-dialog").open && formSignature($("goals-form")) !== goalsSnapshot;
  }
  function showStorageConflict() {
    storageConflict = true; clearTimeout(reminderTimer); reminderTimer = null;
    reminderRows = []; $("workout-reminder").hidden = true;
    if (confirmation) answerConfirmation(false);
    if (conflictCreation) answerSeriesConflicts(false);
    storageWarning("Данные изменились в другом окне. Локальная копия и введённые поля сохранены в этой странице");
    if (!$("storage-conflict-dialog").open) openDialog($("storage-conflict-dialog"), $("conflict-load"));
  }
  function checkCurrentStorage() {
    if (storageConflict) return false;
    try { if (localStorage.getItem(STORAGE_KEY) !== loadedRaw) { showStorageConflict(); return false; } }
    catch { /* Memory-only editing remains available when storage cannot be read. */ }
    return true;
  }
  function closeWorkingDialogs() {
    if (confirmation) answerConfirmation(false);
    if (conflictCreation) answerSeriesConflicts(false);
    for (const dialog of document.querySelectorAll("dialog[open]")) dialog.close();
    pendingImport = null; importReadToken++; scopeRequest = null;
  }
  function applyRaw(raw) {
    let candidate;
    try { candidate = raw === null ? initialState() : validateState(parseStateJSON(raw)); }
    catch (error) {
      loadedRaw = raw; rawDamaged = raw; blocked = true; storageConflict = false; dirty = false; reminderRows = []; clearTimeout(reminderTimer); reminderTimer = null;
      $("planner").hidden = true; storageWarning(`${error.message}. Исходные данные оставлены без изменений`, true); render(); return;
    }
    state = candidate; loadedRaw = raw; rawDamaged = null; blocked = false; dirty = raw === null; storageConflict = false;
    reminderRows = []; $("planner").hidden = false; $("storage-warning").hidden = true; $("load-latest").hidden = true; $("restore-data").hidden = true; $("reset-data").hidden = true;
    $("save-status-text").textContent = "Сохранено в браузере";
    if (raw === null) persist(); render();
  }
  function storageChanged() {
    let raw; try { raw = localStorage.getItem(STORAGE_KEY); } catch { storageWarning("Хранилище браузера недоступно. Можно скачать локальную копию"); return; }
    if (raw === loadedRaw) return;
    if (dirty || hasDrafts() || confirmation || conflictCreation || pendingImport || savingWorkout) { showStorageConflict(); return; }
    closeWorkingDialogs(); applyRaw(raw);
  }
  async function loadLatest() {
    if ((dirty || hasDrafts() || pendingImport) && !(await ask("Загрузить актуальные данные?", "Несохранённые локальные изменения и введённые поля будут отменены", "Загрузить"))) return;
    let raw; try { raw = localStorage.getItem(STORAGE_KEY); } catch { storageWarning("Не удалось прочитать актуальные данные. Локальная копия сохранена"); return; }
    closeWorkingDialogs(); applyRaw(raw);
  }
  function persist() {
    if (blocked || !checkCurrentStorage()) return false;
    try {
      const candidate = { ...state, revision: state.revision + 1, updatedAt: new Date().toISOString() };
      validateState(candidate);
      if (!checkCurrentStorage()) return false;
      const serialized = JSON.stringify(candidate);
      localStorage.setItem(STORAGE_KEY, serialized);
      state = candidate; loadedRaw = serialized; dirty = false;
      $("storage-warning").hidden = true; $("save-status-text").textContent = "Сохранено в браузере";
      return true;
    } catch (error) {
      dirty = true;
      storageWarning(error.message.startsWith("Данные изменились") ? error.message : "Изменения не сохранены в браузере. Можно скачать копию и повторить сохранение");
      return false;
    }
  }
  function commit(candidate) {
    if (blocked) throw new Error("Сохранённые данные требуют восстановления");
    if (!checkCurrentStorage()) throw new Error("Данные изменились в другом окне. Сохранение приостановлено");
    validateState({ ...candidate, revision: candidate.revision + 1, updatedAt: new Date().toISOString() });
    state = candidate; dirty = true; persist(); render();
  }
  function load() {
    try { loadedRaw = localStorage.getItem(STORAGE_KEY); }
    catch { dirty = true; storageWarning("Хранилище браузера недоступно. Данные остаются только в этой открытой странице"); return; }
    if (loadedRaw === null) { dirty = true; persist(); return; }
    try { state = validateState(parseStateJSON(loadedRaw)); }
    catch (error) {
      blocked = true; rawDamaged = loadedRaw;
      storageWarning(`${error.message}. Исходные данные оставлены без изменений. Скачай их копию перед восстановлением`, true);
      $("planner").hidden = true;
    }
  }

  function renderStrip() {
    const strip = $("type-strip"); strip.replaceChildren();
    const types = state.types.filter(type => !type.archived);
    if (!types.length) { strip.append(node("p", "empty-list", "Нет активных видов тренировок")); return; }
    for (const type of types) {
      const figure = node("figure", "type-figure"); figure.style.setProperty("--type-color", type.color);
      const caption = node("figcaption"); caption.append(node("span", "type-dot"), document.createTextNode(type.name));
      figure.append(artwork(type.imageId), caption); strip.append(figure);
    }
  }
  function renderWorkout(workout) {
    const type = state.types.find(item => item.id === workout.typeId);
    const article = node("article", `workout is-${workout.status}`); article.dataset.workoutId = workout.id;
    if (workout.id === highlightedId) { article.classList.add("is-highlighted"); article.tabIndex = -1; }
    article.setAttribute("aria-label", `${type.name}, ${workout.time || "без времени"}, ${workout.durationMinutes} мин, ${STATUS_LABELS[workout.status]}`);
    const details = node("div", "workout-details");
    details.append(node("h3", "workout-type", type.name), node("p", "workout-time", workout.time || "Без времени"), node("p", "workout-duration", `${workout.durationMinutes} мин`));
    const status = node("p", "workout-status"); status.append(icon(workout.status === "done" ? "check" : workout.status === "skipped" ? "x" : "calendar"), document.createTextNode(STATUS_LABELS[workout.status])); details.append(status);
    if (workout.note) details.append(node("p", "workout-note", workout.note));
    const actions = node("div", "workout-actions");
    const toggle = iconButton(workout.status === "done" ? "restore" : "check", workout.status === "done" ? "Вернуть в план" : "Отметить выполненным", "toggle", workout.id); toggle.classList.add("toggle-done");
    if (workout.date > currentDay) { toggle.disabled = true; toggle.title = "Доступно в день занятия"; toggle.setAttribute("aria-label", "Отметка доступна в день занятия"); }
    const edit = iconButton("pencil", "Редактировать занятие", "edit", workout.id);
    const copy = iconButton("copy", "Повторить занятие", "copy", workout.id);
    const remove = iconButton("trash", "Удалить занятие", "delete", workout.id); remove.classList.add("danger-action");
    actions.append(toggle, edit, copy, remove); article.append(artwork(type.imageId, "workout-image"), details, actions); return article;
  }
  function renderWeek() {
    $("week-range").textContent = weekLabel(selectedMonday); $("week-picker").value = selectedDate;
    $("previous-week").disabled = dayNumber(selectedMonday) <= dayNumber(monday(MIN_DATE));
    $("next-week").disabled = dayNumber(selectedMonday) >= dayNumber(monday(MAX_DATE));
    $("add-workout").disabled = blocked;
    const grid = $("week-grid"); grid.replaceChildren();
    const allWeekWorkouts = [...occurrences(state, selectedMonday, addDays(selectedMonday, 6))];
    const weekWorkouts = allWeekWorkouts.filter(matchesFilters);
    const searching = normalizeText($("search-query").value).length > 0;
    grid.hidden = searching; $("search-view").hidden = !searching;
    $("week-empty").hidden = searching || weekWorkouts.length > 0;
    $("week-empty").textContent = allWeekWorkouts.length ? "Нет совпадений фильтра" : "Неделя свободна";
    for (let offset = 0; offset < 7; offset++) {
      const date = dateFromDay(dayNumber(selectedMonday) + offset);
      const valid = isValidDate(date);
      const day = node("section", `day${date === currentDay ? " is-today" : ""}${offset > 4 ? " is-weekend" : ""}`); day.dataset.date = date;
      const heading = node("div", "day-header");
      const dateHeading = node("h3", "day-date"); dateHeading.id = `day-heading-${offset}`; day.setAttribute("aria-labelledby", dateHeading.id);
      dateHeading.append(node("span", "day-name", WEEKDAYS[offset]), node("span", "day-number", date.split("-")[2]));
      if (date === currentDay) dateHeading.append(node("span", "today-label", "Сегодня"));
      const add = iconButton("plus", valid ? `Добавить занятие на ${humanDate(date)}` : "Дата вне диапазона", "add"); add.dataset.date = date; add.disabled = !valid || blocked;
      heading.append(dateHeading, add); day.append(heading);
      const workouts = weekWorkouts.filter(workout => workout.date === date).sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99") || a.id.localeCompare(b.id));
      if (!workouts.length) day.append(node("p", "day-empty", valid ? "Нет занятий" : "Дата вне диапазона"));
      else { const list = node("div", "workout-list"); for (const workout of workouts) list.append(renderWorkout(workout)); day.append(list); }
      grid.append(day);
    }
    renderInsights(); renderSavedWorkoutNotice(); startSearch();
  }
  function renderSavedWorkoutNotice() {
    const workout = lastSavedWorkoutId && resolveWorkout(state, lastSavedWorkoutId);
    const notice = $("saved-workout-notice");
    const reason = !workout ? "" : workout.date < selectedMonday || workout.date > addDays(selectedMonday, 6) ? "Занятие в другой неделе" : !matchesFilters(workout) ? "Занятие скрыто фильтрами" : normalizeText($("search-query").value) ? "Открыт поиск занятий" : "";
    notice.hidden = !reason;
    if (reason) $("saved-workout-message").textContent = `${state.types.find(type => type.id === workout.typeId).name} · ${humanDate(workout.date)} · ${workout.time || "Без времени"}. ${reason}`;
  }
  function rememberSavedWorkout(workout) {
    lastSavedWorkoutId = workout?.id || null;
    renderSavedWorkoutNotice();
    pendingSavedScroll = workout && !$("week-grid").hidden && document.querySelector(`#week-grid [data-workout-id="${CSS.escape(workout.id)}"]`) ? workout.id : null;
  }
  function openWorkoutWeek(workout) {
    $("filter-type").value = ""; $("filter-status").value = ""; highlightedId = workout.id; navigate(workout.date);
    const target = document.querySelector(`[data-workout-id="${CSS.escape(workout.id)}"]`); target?.scrollIntoView({ block: "center" }); target?.focus();
  }
  function matchesFilters(workout) {
    return (!$("filter-type").value || workout.typeId === $("filter-type").value) && (!$("filter-status").value || workout.status === $("filter-status").value);
  }
  function renderFilters() {
    const select = $("filter-type"); const selected = select.value; select.replaceChildren();
    const all = node("option", null, "Все виды"); all.value = ""; select.append(all);
    for (const type of state.types) { const option = node("option", null, type.name + (type.archived ? " (в архиве)" : "")); option.value = type.id; select.append(option); }
    if (state.types.some(type => type.id === selected)) select.value = selected;
  }
  function progressRow(label, actual, target, potential) {
    const row = node("div", "goal-progress");
    const line = node("div", "goal-progress-label"); line.append(node("span", null, label), node("strong", null, `${actual} / ${target}`));
    const progress = node("progress"); progress.max = target; progress.value = Math.min(actual, target); progress.setAttribute("aria-label", label);
    row.append(line, progress, node("p", "field-hint", `По плану и выполнено: ${potential}`)); return row;
  }
  function renderInsights() {
    const stats = weekStats(state, selectedMonday); const goal = state.goals.find(item => item.weekStart === selectedMonday);
    const goals = $("goals-content"); goals.replaceChildren(); $("edit-goals").disabled = blocked;
    if (!goal) goals.append(node("p", "empty-list", "Цели не заданы"));
    else {
      if (goal.countTarget !== null) goals.append(progressRow("Занятия", stats.done, goal.countTarget, stats.potentialCount));
      if (goal.minutesTarget !== null) goals.append(progressRow("Минуты", stats.minutes, goal.minutesTarget, stats.potentialMinutes));
      const potentialTypes = new Map();
      for (const workout of occurrences(state, selectedMonday, addDays(selectedMonday, 6))) if (workout.status !== "skipped") potentialTypes.set(workout.typeId, (potentialTypes.get(workout.typeId) || 0) + 1);
      for (const target of goal.typeTargets) { const type = state.types.find(item => item.id === target.typeId); goals.append(progressRow(type.name + (type.archived ? " (в архиве)" : ""), stats.byType.get(type.id)?.count || 0, target.countTarget, potentialTypes.get(type.id) || 0)); }
    }
    const view = $("stats-content"); view.replaceChildren();
    if (document.querySelector("[name='statsView']:checked").value === "comparison") {
      const weeks = [-3, -2, -1, 0].map(offset => { const start = addDays(selectedMonday, offset * 7); return { start, ...weekStats(state, start) }; });
      const maxCount = Math.max(1, ...weeks.map(week => week.done)); const maxMinutes = Math.max(1, ...weeks.map(week => week.minutes));
      const table = node("table", "comparison-table"); const caption = node("caption", "sr-only", "Выполненные занятия за четыре недели"); const head = node("thead"); const heading = node("tr");
      for (const label of ["Неделя", "Занятия", "Минуты"]) { const th = node("th", null, label); th.scope = "col"; heading.append(th); } head.append(heading); const body = node("tbody");
      for (const week of weeks) { const row = node("tr"); const th = node("th", null, weekLabel(week.start)); th.scope = "row"; row.append(th);
        for (const [value, max, name] of [[week.done, maxCount, "Занятия"], [week.minutes, maxMinutes, "Минуты"]]) { const cell = node("td"); const meter = node("meter"); meter.min = 0; meter.max = max; meter.value = value; meter.setAttribute("aria-label", `${name}: ${value}`); cell.append(node("strong", null, value), meter); row.append(cell); } body.append(row); }
      table.append(caption, head, body); view.append(table); return;
    }
    const counts = node("dl", "stat-counts");
    for (const [label, value, key] of [["По плану", stats.planned, "planned"], ["Выполнено", stats.done, "done"], ["Пропущено", stats.skipped, "skipped"], ["Минут выполнено", stats.minutes, "minutes"]]) { const item = node("div"); item.dataset.stat = key; item.append(node("dt", null, label), node("dd", null, value)); counts.append(item); } view.append(counts);
    if (!stats.done) view.append(node("p", "empty-list", "Нет выполненных занятий"));
    for (const [typeId, values] of stats.byType) { const type = state.types.find(item => item.id === typeId); const row = node("div", "distribution-row"); row.style.setProperty("--type-color", type.color); row.append(node("span", "distribution-name", type.name), node("span", null, `${values.count} · ${values.minutes} мин · ${Math.round(values.count / stats.done * 100)}%`)); view.append(row); }
  }
  async function startSearch() {
    const token = ++searchToken; const query = normalizeText($("search-query").value); if (!query) return;
    const scope = document.querySelector("[name='searchScope']:checked").value;
    const from = scope === "history" ? MIN_DATE : selectedMonday; const rawEnd = scope === "history" ? currentDay : addDays(selectedMonday, 6); const to = rawEnd.length > 10 ? MAX_DATE : rawEnd;
    const data = state; const typeFilter = $("filter-type").value; const statusFilter = $("filter-status").value;
    const names = new Map(data.types.map(type => [type.id, normalizeText(type.name)])); const results = [];
    const matches = workout => (!typeFilter || workout.typeId === typeFilter) && (!statusFilter || workout.status === statusFilter) && (names.get(workout.typeId).includes(query) || normalizeText(workout.note).includes(query));
    $("search-summary").textContent = "Ищу…"; $("search-results").replaceChildren(); $("search-more").hidden = true;
    let processed = 0;
    // Yield by scanned dates, including dates with no matching occurrence.
    const pause = () => new Promise(resolve => setTimeout(resolve, 0));
    for (const workout of data.workouts) {
      if (workout.date >= from && workout.date <= to && matches(workout)) results.push(workout);
      if (++processed % 250 === 0) { await pause(); if (token !== searchToken) return; }
    }
    const exceptions = new Map(data.exceptions.map(item => [`${item.seriesId}:${item.scheduledDate}`, item]));
    for (const series of data.series) for (const segment of series.segments) {
      const end = dayNumber(segmentEnd(segment) < to ? segmentEnd(segment) : to);
      for (let day = dayNumber(segment.fromDate > from ? segment.fromDate : from); day <= end; day++) {
        const date = dateFromDay(day);
        if (matchesSegment(segment, date) && !exceptions.has(`${series.id}:${date}`)) { const workout = occurrence(series, date, segment); if (matches(workout)) results.push(workout); }
        if (++processed % 150 === 0) { await pause(); if (token !== searchToken) return; }
      }
    }
    for (const exception of data.exceptions) {
      if (exception.kind === "override" && exception.workout.date >= from && exception.workout.date <= to) { const workout = resolveWorkout(data, `${exception.seriesId}:${exception.scheduledDate}`); if (matches(workout)) results.push(workout); }
      if (++processed % 250 === 0) { await pause(); if (token !== searchToken) return; }
    }
    if (token !== searchToken) return;
    results.sort((a, b) => b.date.localeCompare(a.date) || (a.time || "99:99").localeCompare(b.time || "99:99") || a.id.localeCompare(b.id));
    searchResults = results; searchLimit = 50; renderSearchResults();
  }
  function renderSearchResults() {
    const list = $("search-results"); list.replaceChildren();
    for (const workout of searchResults.slice(0, searchLimit)) {
      const row = node("div", "search-result"); row.append(node("p", "search-date", humanDate(workout.date)));
      const article = renderWorkout(workout); const open = iconButton("calendar", "Открыть неделю", "open-week", workout.id); article.querySelector(".workout-actions").append(open); row.append(article); list.append(row);
    }
    $("search-summary").textContent = searchResults.length ? `Найдено: ${searchResults.length}. Показано: ${Math.min(searchLimit, searchResults.length)}` : "Нет совпадений";
    $("search-more").hidden = searchLimit >= searchResults.length;
  }
  function renderTypes() {
    for (const archived of [false, true]) {
      const list = $(archived ? "archived-types" : "active-types"); list.replaceChildren();
      const types = state.types.filter(type => type.archived === archived);
      if (!types.length) list.append(node("p", "empty-list", archived ? "Архив пуст" : "Нет активных видов"));
      for (const type of types) {
        const row = node("div", "type-row"); row.dataset.typeId = type.id;
        const name = node("p", "type-row-name"); name.style.setProperty("--type-color", type.color); name.append(node("span", "type-dot"), document.createTextNode(type.name));
        const actions = node("div", "type-row-actions");
        actions.append(iconButton("pencil", `Изменить вид: ${type.name}`, "edit-type", type.id), iconButton(archived ? "restore" : "archive", archived ? `Восстановить вид: ${type.name}` : `В архив: ${type.name}`, "archive-type", type.id));
        row.append(artwork(type.imageId), name, actions); list.append(row);
      }
    }
  }
  function render() {
    renderStrip(); renderFilters(); renderWeek();
    if ($("types-dialog").open) renderTypes();
    if ($("workout-dialog").open) { refreshWorkoutTypes(); updatePreview(); updateStatusAvailability(); }
    $("manage-types").disabled = blocked;
    $("open-settings").disabled = blocked;
    document.querySelector(".type-band").hidden = blocked;
    renderSettings(); refreshSupport();
  }

  function openDialog(dialog, focusElement) {
    const origin = document.activeElement;
    dialogOrigins.set(dialog, { element: origin, action: origin?.dataset.action, id: origin?.dataset.recordId });
    dialog.showModal(); if (focusElement) focusElement.focus();
  }
  function restoreDialogFocus(dialog) {
    const origin = dialogOrigins.get(dialog);
    if (origin?.element?.isConnected && !origin.element.disabled && origin.element.getClientRects().length) { origin.element.focus(); return; }
    if (origin?.action && origin.id) {
      const replacement = document.querySelector(`[data-action="${CSS.escape(origin.action)}"][data-record-id="${CSS.escape(origin.id)}"]`);
      if (replacement) { replacement.focus(); return; }
    }
    if (![...document.querySelectorAll("dialog")].some(item => item.open)) (blocked ? $("restore-data") : $("add-workout")).focus();
  }
  function ask(title, message, acceptLabel = "Подтвердить", danger = false) {
    if (confirmation) return Promise.resolve(false);
    $("confirm-heading").textContent = title; $("confirm-message").textContent = message; $("confirm-accept").textContent = acceptLabel;
    $("confirm-accept").classList.toggle("danger-action", danger);
    return new Promise(resolve => { confirmation = resolve; openDialog($("confirm-dialog"), $("confirm-cancel")); });
  }
  function answerConfirmation(answer) {
    const resolve = confirmation; confirmation = null; $("confirm-dialog").close(); if (resolve) resolve(answer);
  }
  async function requestClose(dialog) {
    if (dialog.id === "series-conflicts-dialog") { answerSeriesConflicts(false); return; }
    if (dialog.id === "import-dialog") { pendingImport = null; }
    if (dialog.id === "settings-dialog") importReadToken++;
    const changed = dialog.id === "workout-dialog" ? formSignature($("workout-form")) !== workoutSnapshot : dialog.id === "type-editor-dialog" ? formSignature($("type-form")) !== typeSnapshot : dialog.id === "goals-dialog" ? formSignature($("goals-form")) !== goalsSnapshot : false;
    if (changed && !(await ask("Закрыть без сохранения?", "Введённые изменения не будут сохранены", "Закрыть"))) return;
    dialog.close();
  }
  function clearErrors(formId) {
    const form = $(formId);
    form.querySelectorAll(".field-error").forEach(item => { item.textContent = ""; });
    form.querySelectorAll("[aria-invalid]").forEach(item => item.removeAttribute("aria-invalid"));
    const overall = $(formId === "workout-form" ? "workout-form-error" : "type-form-error"); overall.hidden = true; overall.textContent = "";
  }
  function showWorkoutErrors(errors) {
    const fields = { typeId: "type", date: "date", time: "time", durationMinutes: "duration", note: "note", status: "status" };
    for (const [key, message] of Object.entries(errors)) {
      const field = $(`workout-${fields[key]}`); field.setAttribute("aria-invalid", "true"); $(`workout-${fields[key]}-error`).textContent = message;
    }
    const first = Object.keys(errors)[0]; if (first) $(`workout-${fields[first]}`).focus();
  }
  function showFormError(id, message) { $(id).hidden = false; $(id).textContent = message; }
  function refreshWorkoutTypes() {
    const select = $("workout-type"); const selected = select.value;
    const stored = editingWorkout ? resolveWorkout(state, editingWorkout) : null;
    const originalTypeId = editingFollowing && stored ? segmentFor(state.series.find(item => item.id === stored.seriesId), stored.scheduledDate).typeId : stored?.typeId;
    const types = state.types.filter(type => !type.archived || type.id === originalTypeId);
    select.replaceChildren();
    for (const type of types) { const option = node("option", null, `${type.name}${type.archived ? " (в архиве)" : ""}`); option.value = type.id; select.append(option); }
    if (types.some(type => type.id === selected)) select.value = selected;
    if (!types.length) { const option = node("option", null, "Создай или восстанови вид"); option.value = ""; select.append(option); }
    $("save-workout").disabled = !types.length || blocked;
  }
  function updatePreview() {
    const type = state.types.find(item => item.id === $("workout-type").value);
    $("workout-preview").hidden = !type;
    if (type) { $("workout-preview-image").src = assets.get(type.imageId); $("workout-preview-label").textContent = type.name; }
  }
  function updateStatusAvailability() {
    const future = isValidDate($("workout-date").value) && $("workout-date").value > currentDay;
    for (const option of $("workout-status").options) option.disabled = future && option.value !== "planned";
    $("workout-status-hint").textContent = future ? "Отметки доступны в день занятия" : "";
    $("workout-status-field").hidden = !editingWorkout || editingFollowing;
  }
  function readSegment() {
    return { fromDate: $("workout-date").value, toDate: null, typeId: $("workout-type").value, time: $("workout-time").value || null, durationMinutes: Number($("workout-duration").value), note: $("workout-note").value.trim(), weekdays: [...$("repeat-weekdays").querySelectorAll("input:checked")].map(input => Number(input.value)), intervalWeeks: Number($("repeat-interval").value), endDate: $("repeat-end").value };
  }
  function updateRepeatSummary() {
    const active = $("workout-repeat").checked; $("repeat-fields").hidden = !active;
    if (!active) return;
    const segment = readSegment(); const error = segmentError(segment, state.types);
    if (error) { $("repeat-summary").textContent = error; return; }
    const dates = [...segmentDates(segment)];
    $("repeat-summary").textContent = `${segment.weekdays.map(day => WEEKDAYS[day - 1]).join(", ")} · интервал ${segment.intervalWeeks} нед. · до ${humanDate(segment.endDate)} включительно. Первое: ${humanDate(dates[0])}. Всего: ${dates.length}`;
  }
  function openWorkout(date, id = null, copy = false, following = false) {
    if (blocked) return;
    clearErrors("workout-form"); $("workout-form").reset();
    const original = id ? resolveWorkout(state, id) : null;
    editingWorkout = copy ? null : id;
    editingFollowing = following;
    const rule = following ? segmentFor(state.series.find(item => item.id === original.seriesId), original.scheduledDate) : null;
    const values = rule || original;
    refreshWorkoutTypes();
    if (values && (!copy || !state.types.find(type => type.id === values.typeId).archived)) $("workout-type").value = values.typeId;
    if (original && copy && state.types.find(type => type.id === original.typeId).archived) { $("workout-type").value = ""; showWorkoutErrors({ typeId: "Выбери активный вид для копии" }); }
    $("workout-heading").textContent = following ? "Изменить следующие занятия" : editingWorkout ? "Редактировать занятие" : copy ? "Повторить занятие" : "Новое занятие";
    $("workout-date").value = following ? original.scheduledDate : copy && original ? (original.date === MAX_DATE ? MAX_DATE : addDays(original.date, 1)) : original?.date || date;
    $("workout-date").disabled = following;
    $("workout-time").value = values?.time || ""; $("workout-duration").value = values?.durationMinutes || 45;
    $("workout-note").value = values?.note || ""; $("workout-status").value = editingWorkout && !following ? original.status : "planned";
    $("repeat-toggle-field").hidden = !!editingWorkout; $("workout-repeat").checked = following;
    $("repeat-weekdays").replaceChildren();
    for (let day = 1; day <= 7; day++) { const label = node("label"); const input = node("input"); input.type = "checkbox"; input.name = "weekday"; input.value = day; input.checked = rule ? rule.weekdays.includes(day) : day === (calendarDate($("workout-date").value).getUTCDay() + 6) % 7 + 1; label.append(input, document.createTextNode(WEEKDAYS[day - 1])); $("repeat-weekdays").append(label); }
    $("repeat-interval").value = rule?.intervalWeeks || 1; $("repeat-end").value = rule?.endDate || addYears($("workout-date").value, 1); repeatEndTouched = following;
    repeatWeekdaysTouched = following;
    $("series-boundary").hidden = !following; $("series-boundary").textContent = following ? `Действует с исходной даты ${humanDate(original.scheduledDate)}` : "";
    updateRepeatSummary();
    updatePreview(); updateStatusAvailability(); workoutSnapshot = formSignature($("workout-form"));
    openDialog($("workout-dialog"), $("workout-type"));
  }
  function conflictMessage(workout, existing) {
    return existing.map(item => `${humanDate(item.date)}: ${state.types.find(type => type.id === item.typeId).name}, ${item.time}–${timeLabel(timeMinutes(item.time) + item.durationMinutes)}`).join("; ") + ". Выбери другое время";
  }
  function pairsMessage(pairs) {
    return pairs.map(([a, b]) => `${humanDate(a.date)}: ${state.types.find(type => type.id === a.typeId).name} ${a.time}–${timeLabel(timeMinutes(a.time) + a.durationMinutes)} / ${state.types.find(type => type.id === b.typeId).name} ${b.time}–${timeLabel(timeMinutes(b.time) + b.durationMinutes)}`).join("\n");
  }
  function seriesConflictDates(data, seriesId) {
    const dates = new Map();
    for (const pair of scheduleConflicts(data)) {
      const added = pair.find(workout => workout.seriesId === seriesId); if (!added) continue;
      if (!dates.has(added.scheduledDate)) dates.set(added.scheduledDate, []); dates.get(added.scheduledDate).push(pair.find(workout => workout.id !== added.id));
    }
    return dates;
  }
  function answerSeriesConflicts(answer) {
    const resolve = conflictCreation; conflictCreation = null; $("series-conflicts-dialog").close(); resolve?.(answer);
  }
  function askSeriesConflicts(dates, total) {
    const remaining = total - dates.size;
    $("series-conflicts-summary").textContent = `Конфликтующих дат: ${dates.size}. Останется занятий: ${remaining}.${remaining ? "" : " Нет свободных дат для этой серии"}`;
    const list = $("series-conflicts-list"); list.replaceChildren();
    for (const [date, workouts] of [...dates].sort(([a], [b]) => a.localeCompare(b))) { const row = node("div", "conflict-row"); row.append(node("h3", null, humanDate(date))); for (const workout of workouts) row.append(node("p", null, `${state.types.find(type => type.id === workout.typeId).name}: ${workout.time}–${timeLabel(timeMinutes(workout.time) + workout.durationMinutes)}`)); list.append(row); }
    $("series-conflicts-create").disabled = !remaining;
    return new Promise(resolve => { conflictCreation = resolve; openDialog($("series-conflicts-dialog"), $("series-conflicts-back")); });
  }
  async function createSeries(segment) {
    const series = { id: newId("series"), segments: [segment] }; const total = [...segmentDates(segment)].length;
    for (;;) {
      if (!state.types.some(type => type.id === segment.typeId && !type.archived)) throw new Error("Выбери активный вид для новой серии");
      const candidate = clone(state); candidate.series.push(series); const dates = seriesConflictDates(candidate, series.id);
      if (dates.size && !(await askSeriesConflicts(dates, total))) return false;
      let latest;
      try { latest = localStorage.getItem(STORAGE_KEY); } catch { latest = loadedRaw; }
      if (latest !== loadedRaw) {
        if (dirty || latest === null) throw new Error("Расписание изменилось в другом окне. Скачай копию и открой страницу заново");
        state = validateState(parseStateJSON(latest)); loadedRaw = latest; render();
        if (!(await ask("Расписание изменилось", "Конфликты будут проверены заново перед созданием серии", "Проверить"))) return false;
        continue;
      }
      for (const date of dates.keys()) candidate.exceptions.push({ seriesId: series.id, scheduledDate: date, kind: "deleted", workout: null });
      commit(candidate); rememberSavedWorkout([...occurrences(state, segment.fromDate, segment.endDate)].find(workout => workout.seriesId === series.id)); announce(`Серия создана; исключено дат: ${dates.size}`); return true;
    }
  }
  let savingWorkout = false;
  async function saveWorkout(event) {
    event.preventDefault(); if (savingWorkout || blocked || !$("workout-dialog").open) return;
    savingWorkout = true; clearErrors("workout-form");
    try {
      const workout = {
        id: editingWorkout || newId("workout"), typeId: $("workout-type").value,
        date: $("workout-date").value, time: $("workout-time").value || null,
        durationMinutes: $("workout-duration").value.trim() === "" ? NaN : Number($("workout-duration").value),
        note: $("workout-note").value.trim(), status: editingWorkout ? $("workout-status").value : "planned"
      };
      const errors = workoutErrors(workout, state.types);
      const original = editingWorkout ? resolveWorkout(state, editingWorkout) : null;
      const type = state.types.find(item => item.id === workout.typeId);
      const originalTypeId = editingFollowing ? segmentFor(state.series.find(item => item.id === original.seriesId), original.scheduledDate).typeId : original?.typeId;
      if (type?.archived && originalTypeId !== type.id) errors.typeId = "Выбери активный вид тренировки";
      if (Object.keys(errors).length) { showWorkoutErrors(errors); return; }
      if (editingFollowing || !editingWorkout && $("workout-repeat").checked) {
        const segment = readSegment(); const error = segmentError(segment, state.types); if (error) { showFormError("workout-form-error", error); return; }
        if (!editingFollowing) { if (await createSeries(segment)) $("workout-dialog").close(); return; }
        const candidate = clone(state); const summary = changeFollowing(candidate, original, segment, currentDay, () => newId("workout"));
        const pairs = scheduleConflicts(candidate); if (pairs.length) { showFormError("workout-form-error", pairsMessage(pairs)); return; }
        const affected = [...occurrences(state, selectedMonday, addDays(selectedMonday, 6))].filter(item => item.seriesId === original.seriesId && item.scheduledDate >= original.scheduledDate).length;
        if (!(await ask("Изменить следующие занятия?", `С ${humanDate(original.scheduledDate)} до ${humanDate(segment.endDate)}. Занятий выбранной недели: ${affected}. Исключений сохраняется: ${summary.retained}; отменяется: ${summary.removed}. Прошлых переносов сохранено отдельно: ${summary.preserved}. Сохранённые исключения сохраняют личные изменения`, "Изменить"))) return;
        commit(candidate); $("workout-dialog").close(); announce("Правило серии изменено"); return;
      }
      if (workout.date > currentDay && workout.status !== "planned") {
        if (!(await ask("Перенести в будущее?", "Статус занятия изменится на «Запланировано»", "Перенести"))) return;
        workout.status = "planned";
      }
      const overlapping = conflicts(workout, [...occurrences(state, workout.date, workout.date)]);
      if (overlapping.length) { showFormError("workout-form-error", conflictMessage(workout, overlapping)); $("workout-time").focus(); return; }
      const candidate = clone(state);
      replaceWorkout(candidate, original?.seriesId ? { ...workout, seriesId: original.seriesId, scheduledDate: original.scheduledDate } : workout);
      commit(candidate); rememberSavedWorkout(resolveWorkout(state, workout.id)); $("workout-dialog").close(); announce("Занятие сохранено");
    } catch (error) { showFormError("workout-form-error", error.message); }
    finally { savingWorkout = false; }
  }
  async function workoutAction(button) {
    const id = button.dataset.recordId; const workout = id ? resolveWorkout(state, id) : null;
    if (button.dataset.action === "add") { openWorkout(button.dataset.date); return; }
    if (!workout) return;
    if (button.dataset.action === "open-week") {
      openWorkoutWeek(workout); return;
    }
    if (workout.seriesId && ["edit", "delete"].includes(button.dataset.action)) { openScope(workout, button.dataset.action); return; }
    if (button.dataset.action === "edit" || button.dataset.action === "copy") { openWorkout(workout.date, id, button.dataset.action === "copy"); return; }
    if (button.dataset.action === "delete") {
      if (!(await ask("Удалить занятие?", `${state.types.find(item => item.id === workout.typeId).name}\n${humanDate(workout.date)}`, "Удалить", true))) return;
      const candidate = clone(state); removeWorkout(candidate, workout); commit(candidate); announce("Занятие удалено"); return;
    }
    if (button.dataset.action === "toggle" && workout.date <= currentDay) {
      const updated = { ...workout, status: workout.status === "done" ? "planned" : "done" };
      const overlapping = conflicts(updated, [...occurrences(state, workout.date, workout.date)]);
      if (overlapping.length) { await ask("Время уже занято", conflictMessage(updated, overlapping), "Понятно"); return; }
      const candidate = clone(state); replaceWorkout(candidate, updated); commit(candidate);
      document.querySelector(`[data-action="toggle"][data-record-id="${CSS.escape(id)}"]`)?.focus(); announce(STATUS_LABELS[updated.status]);
    }
  }

  function openScope(workout, action) {
    scopeRequest = { id: workout.id, action }; $("scope-heading").textContent = action === "delete" ? "Удалить занятие" : "Изменить занятие";
    $("scope-description").textContent = `${state.types.find(type => type.id === workout.typeId).name}\n${humanDate(workout.date)}. Исходная дата: ${humanDate(workout.scheduledDate)}`;
    const allowed = workout.date >= currentDay && workout.scheduledDate >= currentDay;
    $("scope-following").disabled = !allowed; $("scope-hint").textContent = allowed ? "" : "Прошлые занятия меняются отдельно, чтобы сохранить историю";
    openDialog($("scope-dialog"), $("scope-one"));
  }
  async function applyScope(following) {
    const request = scopeRequest; if (!request || !$("scope-dialog").open || following && $("scope-following").disabled) return;
    scopeRequest = null; const original = resolveWorkout(state, request.id); const origin = dialogOrigins.get($("scope-dialog")); $("scope-dialog").close(); if (!original) return;
    if (request.action === "edit") { openWorkout(original.date, original.id, false, following); dialogOrigins.set($("workout-dialog"), origin); return; }
    const candidate = clone(state); let message = `${state.types.find(type => type.id === original.typeId).name}\n${humanDate(original.date)}`;
    if (following) {
      const summary = changeFollowing(candidate, original, null, currentDay, () => newId("workout"));
      const affected = [...occurrences(state, selectedMonday, addDays(selectedMonday, 6))].filter(item => item.seriesId === original.seriesId && item.scheduledDate >= original.scheduledDate).length;
      message = `Начиная с исходной даты ${humanDate(original.scheduledDate)}. Занятий выбранной недели: ${affected}. Исключений отменяется: ${summary.removed}; сохранено прошлых переносов: ${summary.preserved}. Экземпляры с более ранними исходными датами сохраняются, даже если перенесены в будущее`;
    } else removeWorkout(candidate, original);
    if (!(await ask(following ? "Остановить следующие занятия?" : "Удалить занятие?", message, "Удалить", true))) return;
    commit(candidate); announce(following ? "Следующие занятия отменены" : "Занятие удалено");
  }

  function addGoalRow(target = null) {
    const used = [...$("goal-type-rows").querySelectorAll("select")].map(select => select.value);
    const choices = state.types.filter(type => !type.archived || type.id === target?.typeId);
    const first = target?.typeId || choices.find(type => !used.includes(type.id))?.id;
    if (!first) { showFormError("goals-form-error", "Нет других активных видов"); return; }
    const row = node("div", "goal-type-row"); const select = node("select"); select.name = "goalType"; select.setAttribute("aria-label", "Вид для цели");
    for (const type of choices) { const option = node("option", null, type.name + (type.archived ? " (в архиве)" : "")); option.value = type.id; select.append(option); } select.value = first;
    const count = node("input"); count.type = "number"; count.name = "goalTypeCount"; count.min = 1; count.max = 99; count.step = 1; count.value = target?.countTarget || ""; count.setAttribute("aria-label", "Цель: количество занятий по виду");
    const remove = iconButton("trash", "Убрать цель по виду"); remove.addEventListener("click", () => { row.remove(); $("add-type-goal").focus(); }); row.append(select, count, remove); $("goal-type-rows").append(row);
  }
  function openGoals() {
    if (blocked) return; goalsWeek = selectedMonday; const goal = state.goals.find(item => item.weekStart === goalsWeek);
    $("goals-week").textContent = weekLabel(goalsWeek); $("goal-count").value = goal?.countTarget ?? ""; $("goal-minutes").value = goal?.minutesTarget ?? "";
    $("goals-form-error").hidden = true; $("goal-type-rows").replaceChildren(); for (const target of goal?.typeTargets || []) addGoalRow(target);
    $("delete-goals").disabled = !goal; $("add-type-goal").disabled = !state.types.some(type => !type.archived); goalsSnapshot = formSignature($("goals-form")); openDialog($("goals-dialog"), $("goal-count"));
  }
  function saveGoals(event) {
    event.preventDefault(); if (blocked || !$("goals-dialog").open) return;
    const number = input => input.value.trim() === "" ? null : Number(input.value);
    const goal = { weekStart: goalsWeek, countTarget: number($("goal-count")), minutesTarget: number($("goal-minutes")), typeTargets: [] };
    const stored = state.goals.find(item => item.weekStart === goalsWeek);
    for (const row of $("goal-type-rows").children) { const typeId = row.querySelector("select").value; const countTarget = number(row.querySelector("input")); if (countTarget !== null) {
      if (state.types.find(type => type.id === typeId)?.archived && !stored?.typeTargets.some(target => target.typeId === typeId)) { showFormError("goals-form-error", "Для новой цели нужен активный вид"); return; }
      goal.typeTargets.push({ typeId, countTarget });
    } }
    const error = goalError(goal, state.types); if (error) { showFormError("goals-form-error", error); return; }
    const candidate = clone(state); candidate.goals = candidate.goals.filter(item => item.weekStart !== goalsWeek);
    if (goal.countTarget !== null || goal.minutesTarget !== null || goal.typeTargets.length) candidate.goals.push(goal);
    try { commit(candidate); $("goals-dialog").close(); announce("Цели недели сохранены"); } catch (error) { showFormError("goals-form-error", error.message); }
  }

  function openTypes() { if (blocked) return; renderTypes(); openDialog($("types-dialog"), $("add-type")); }
  function renderPickers(color, imageId) {
    $("color-picker").replaceChildren(); $("image-picker").replaceChildren();
    for (const [value, name] of COLORS) {
      const label = node("label", "color-choice"); label.title = name; label.style.setProperty("--swatch", value);
      const input = node("input"); input.type = "radio"; input.name = "color"; input.value = value; input.checked = value === color; input.setAttribute("aria-label", name);
      const swatch = node("span"); swatch.setAttribute("aria-hidden", "true"); label.append(input, swatch); $("color-picker").append(label);
    }
    for (const [value, name] of IMAGES) {
      const label = node("label", "image-choice");
      const input = node("input"); input.type = "radio"; input.name = "imageId"; input.value = value; input.checked = value === imageId; input.setAttribute("aria-label", name);
      const figure = node("figure"); figure.append(artwork(value), node("figcaption", null, name)); label.append(input, figure); $("image-picker").append(label);
    }
  }
  function openTypeEditor(id = null) {
    clearErrors("type-form"); editingType = id;
    const type = id ? state.types.find(item => item.id === id) : null;
    $("type-editor-heading").textContent = type ? "Изменить вид тренировки" : "Новый вид тренировки"; $("type-name").value = type?.name || "";
    renderPickers(type?.color || COLORS[4][0], type?.imageId || "balance"); typeSnapshot = formSignature($("type-form")); openDialog($("type-editor-dialog"), $("type-name"));
  }
  function saveType(event) {
    event.preventDefault(); if (blocked || !$("type-editor-dialog").open) return; clearErrors("type-form");
    const name = $("type-name").value.trim();
    const invalid = name.length < 1 ? "Укажи название" : name.length > 60 ? "Название не длиннее 60 символов" : state.types.some(type => type.id !== editingType && normalizeName(type.name) === normalizeName(name)) ? "Такой вид уже есть, в том числе в архиве" : null;
    if (invalid) { $("type-name-error").textContent = invalid; $("type-name").setAttribute("aria-invalid", "true"); $("type-name").focus(); return; }
    const fields = new FormData($("type-form")); const existing = state.types.find(type => type.id === editingType);
    const type = { id: editingType || newId("type"), name, color: fields.get("color"), imageId: fields.get("imageId"), archived: existing?.archived || false };
    const candidate = clone(state);
    if (editingType) candidate.types = candidate.types.map(item => item.id === editingType ? type : item);
    else candidate.types.push(type);
    try { commit(candidate); $("type-editor-dialog").close(); announce("Вид тренировки сохранён"); }
    catch (error) { showFormError("type-form-error", error.message); }
  }
  function typeAction(button) {
    const type = state.types.find(item => item.id === button.dataset.recordId); if (!type) return;
    if (button.dataset.action === "edit-type") { openTypeEditor(type.id); return; }
    const candidate = clone(state); candidate.types = candidate.types.map(item => item.id === type.id ? { ...item, archived: !item.archived } : item);
    commit(candidate); announce(type.archived ? "Вид восстановлен" : "Вид сохранён в архиве");
    document.querySelector(`[data-action="archive-type"][data-record-id="${CSS.escape(type.id)}"]`)?.focus();
  }

  function renderSettings() {
    $("setting-quotes").checked = state.settings.quotesVisible; $("setting-reminders").checked = state.settings.remindersEnabled;
    $("backup-nudge").hidden = !backupDue(state, today());
  }
  function openSettings() {
    if (blocked) return; renderSettings(); $("import-error").hidden = true; openDialog($("settings-dialog"), $("setting-quotes"));
  }
  function changeSetting(key, value) {
    const candidate = clone(state); candidate.settings[key] = value;
    try { commit(candidate); } catch (error) { renderSettings(); storageWarning(error.message); }
  }
  function refreshSupport() {
    $("daily-quote").hidden = blocked || !state.settings.quotesVisible; $("daily-quote").textContent = quoteFor(today());
    clearTimeout(reminderTimer); reminderTimer = null;
    if (supportBusy) return;
    if (blocked || storageConflict || document.hidden || !state.settings.remindersEnabled) { reminderRows = []; $("workout-reminder").hidden = true; return; }
    if (!checkCurrentStorage()) return;
    supportBusy = true;
    try {
      const now = new Date(); const plan = reminderPlan(state, now);
      if (plan.due.length) {
        const candidate = clone(state); const shownAt = now.toISOString();
        for (const workout of plan.due) candidate.remindersShown.push({ occurrenceId: workout.id, shownAt });
        try { commit(candidate); reminderRows.push(...plan.due.map(workout => workout.id)); }
        catch (error) { storageWarning(error.message); }
      }
      const current = reminderRows.map(id => resolveWorkout(state, id)).filter(workout => workout?.time && workout.status === "planned" && localStart(workout) > now.getTime() && localStart(workout) - now.getTime() <= 900000);
      reminderRows = current.map(workout => workout.id); const list = $("reminder-list"); list.replaceChildren();
      for (const workout of current) list.append(node("li", null, `Через ${Math.ceil((localStart(workout) - now.getTime()) / 60000)} мин — ${state.types.find(type => type.id === workout.typeId).name}, ${workout.time}`));
      $("workout-reminder").hidden = !current.length;
      const expiry = current.length ? Math.min(...current.map(workout => localStart(workout) - now.getTime())) : null;
      const delay = expiry === null ? plan.delay : plan.delay === null ? expiry : Math.min(expiry, plan.delay);
      if (delay !== null) reminderTimer = setTimeout(refreshSupport, Math.min(DAY_MS, Math.max(1, delay)));
    } finally { supportBusy = false; }
  }
  function downloadText(text, filename, type) {
    const url = URL.createObjectURL(new Blob([text], { type })); const link = node("a"); link.href = url; link.download = filename;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function downloadCurrentData() {
    if (rawDamaged !== null) { downloadText(rawDamaged, `sea-planner-recovery-${today()}.txt`, "text/plain;charset=utf-8"); return; }
    downloadText(JSON.stringify(state, null, 2), `sea-planner-${today()}.json`, "application/json;charset=utf-8");
    const candidate = clone(state); candidate.backup.lastExportDate = today();
    try {
      validateState({ ...candidate, revision: candidate.revision + 1, updatedAt: new Date().toISOString() });
      if (storageConflict) { state = candidate; dirty = true; renderSettings(); } else commit(candidate);
    } catch { /* A service timestamp must never cancel an already launched download. */ }
    announce("Скачивание копии начато");
  }
  function chooseImport() { $("import-file").value = ""; $("import-file").click(); }
  async function readImportFile(file) {
    if (!file) return;
    const token = ++importReadToken; $("import-error").hidden = true;
    try {
      if (file.size > MAX_EXPORT_BYTES) throw new Error("Файл слишком большой: максимум 2 МиБ");
      const text = await file.text(); if (token !== importReadToken) return;
      let parsed; try { parsed = parseStateJSON(text); } catch (error) { throw new Error(`Не удалось прочитать JSON: ${error.message}`); }
      validateState(parsed); pendingImport = parsed; $("import-summary").replaceChildren();
      for (const [label, value] of [["Одиночные занятия", parsed.workouts.length], ["Конечные серии", parsed.series.length], ["Виды", parsed.types.length], ["Недели с целями", parsed.goals.length]]) { const row = node("div"); row.append(node("dt", null, label), node("dd", null, value)); $("import-summary").append(row); }
      let first = null; let last = null;
      for (const workout of occurrences(parsed, MIN_DATE, today())) { if (first === null || workout.date < first) first = workout.date; if (last === null || workout.date > last) last = workout.date; }
      $("import-history").textContent = first ? `История: ${humanDate(first)} — ${humanDate(last)}` : "Истории пока нет";
      $("import-save-error").hidden = true; openDialog($("import-dialog"), $("confirm-import"));
    } catch (error) { if (token !== importReadToken) return; pendingImport = null; if (blocked) storageWarning(error.message + ". Исходные данные сохранены", true); else showFormError("import-error", error.message); }
  }
  function replacementRevision() {
    let revision = state.revision;
    try { const stored = JSON.parse(loadedRaw); if (Number.isSafeInteger(stored?.revision) && stored.revision >= 0) revision = Math.max(revision, stored.revision); } catch { /* A damaged key need not contain a revision. */ }
    return revision + 1;
  }
  function replaceDocument(document) {
    if (!checkCurrentStorage()) throw new Error("Данные изменились в другом окне. Загрузи актуальную версию перед восстановлением");
    const candidate = { ...clone(document), revision: replacementRevision(), updatedAt: new Date().toISOString() }; validateState(candidate);
    const serialized = JSON.stringify(candidate); localStorage.setItem(STORAGE_KEY, serialized);
    closeWorkingDialogs(); state = candidate; loadedRaw = serialized; dirty = false; blocked = false; rawDamaged = null; storageConflict = false;
    reminderRows = []; highlightedId = null; $("planner").hidden = false; $("storage-warning").hidden = true; $("restore-data").hidden = true; $("reset-data").hidden = true; $("load-latest").hidden = true;
    $("filter-type").value = ""; $("filter-status").value = ""; $("search-query").value = ""; $("save-status-text").textContent = "Сохранено в браузере";
    selectedDate = today(); selectedMonday = monday(selectedDate); currentDay = today(); render(); refreshDay(); announce("Данные восстановлены");
  }
  function confirmImport() {
    if (!pendingImport || !$("import-dialog").open || importing) return; importing = true;
    try { replaceDocument(pendingImport); }
    catch (error) { showFormError("import-save-error", `Не удалось сохранить восстановленные данные. ${error.message}`); }
    finally { importing = false; }
  }
  async function resetDamagedData() {
    if (!blocked || !(await ask("Начать заново?", "Исходные данные будут заменены пустым расписанием", "Начать заново", true))) return;
    try { replaceDocument(initialState()); } catch (error) { storageWarning(`Не удалось создать новое расписание. ${error.message}`, true); }
  }
  function refreshDay() {
    const updatedDay = today(); if (updatedDay !== currentDay) { currentDay = updatedDay; render(); }
    renderSettings(); refreshSupport();
    clearTimeout(midnightTimer);
    const now = new Date(); const nextMidnight = new Date(now); nextMidnight.setHours(24, 0, 0, 0);
    midnightTimer = setTimeout(refreshDay, Math.max(1000, nextMidnight.getTime() - now.getTime()));
  }
  function navigate(value) { if (!isValidDate(value)) return; $("search-query").value = ""; selectedDate = value; selectedMonday = monday(value); renderWeek(); }

  $("previous-week").addEventListener("click", () => navigate(addDays(selectedMonday, -7)));
  $("next-week").addEventListener("click", () => navigate(addDays(selectedMonday, 7)));
  $("today").addEventListener("click", () => { refreshDay(); navigate(today()); });
  $("week-picker").addEventListener("change", event => { if (isValidDate(event.target.value)) navigate(event.target.value); else event.target.value = selectedDate; });
  $("add-workout").addEventListener("click", () => openWorkout(selectedMonday === monday(currentDay) ? currentDay : (selectedMonday < MIN_DATE ? MIN_DATE : selectedMonday)));
  $("week-grid").addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");
    if (button && !button.disabled) workoutAction(button).catch(error => { storageWarning(error.message); });
  });
  $("workout-form").addEventListener("submit", saveWorkout);
  $("workout-type").addEventListener("change", updatePreview);
  $("workout-date").addEventListener("change", () => {
    updateStatusAvailability();
    if (!repeatEndTouched && isValidDate($("workout-date").value)) $("repeat-end").value = addYears($("workout-date").value, 1);
    if (!repeatWeekdaysTouched && isValidDate($("workout-date").value)) {
      const day = (calendarDate($("workout-date").value).getUTCDay() + 6) % 7 + 1;
      $("repeat-weekdays").querySelectorAll("input").forEach(input => { input.checked = Number(input.value) === day; });
    }
    updateRepeatSummary();
  });
  $("repeat-end").addEventListener("input", () => { repeatEndTouched = true; updateRepeatSummary(); });
  $("repeat-weekdays").addEventListener("change", () => { repeatWeekdaysTouched = true; });
  $("workout-repeat").addEventListener("change", updateRepeatSummary);
  $("workout-form").addEventListener("input", updateRepeatSummary);
  $("workout-form").addEventListener("change", updateRepeatSummary);
  $("scope-one").addEventListener("click", () => applyScope(false).catch(error => storageWarning(error.message)));
  $("scope-following").addEventListener("click", () => applyScope(true).catch(error => storageWarning(error.message)));
  $("series-conflicts-cancel").addEventListener("click", () => answerSeriesConflicts(false));
  $("series-conflicts-back").addEventListener("click", () => answerSeriesConflicts(false));
  $("series-conflicts-create").addEventListener("click", () => answerSeriesConflicts(true));
  $("filter-type").addEventListener("change", renderWeek); $("filter-status").addEventListener("change", renderWeek);
  $("search-query").addEventListener("input", renderWeek);
  document.querySelectorAll("[name='searchScope']").forEach(input => input.addEventListener("change", startSearch));
  document.querySelectorAll("[name='statsView']").forEach(input => input.addEventListener("change", renderInsights));
  $("reset-filters").addEventListener("click", () => { $("filter-type").value = ""; $("filter-status").value = ""; $("search-query").value = ""; renderWeek(); });
  $("show-saved-workout").addEventListener("click", () => { const workout = lastSavedWorkoutId && resolveWorkout(state, lastSavedWorkoutId); if (workout) openWorkoutWeek(workout); else renderSavedWorkoutNotice(); });
  $("search-more").addEventListener("click", () => { searchLimit += 50; renderSearchResults(); });
  $("search-results").addEventListener("click", event => { const button = event.target.closest("button[data-action]"); if (button && !button.disabled) workoutAction(button).catch(error => storageWarning(error.message)); });
  $("edit-goals").addEventListener("click", openGoals); $("add-type-goal").addEventListener("click", () => addGoalRow()); $("goals-form").addEventListener("submit", saveGoals);
  $("delete-goals").addEventListener("click", async () => { if (await ask("Удалить цели недели?", weekLabel(goalsWeek), "Удалить", true)) { const candidate = clone(state); candidate.goals = candidate.goals.filter(goal => goal.weekStart !== goalsWeek); commit(candidate); $("goals-dialog").close(); announce("Цели недели удалены"); } });
  $("manage-types").addEventListener("click", openTypes);
  $("workout-manage-types").addEventListener("click", openTypes);
  $("add-type").addEventListener("click", () => openTypeEditor());
  $("type-form").addEventListener("submit", saveType);
  $("types-dialog").addEventListener("click", event => { const button = event.target.closest("button[data-action]"); if (button) { try { typeAction(button); } catch (error) { storageWarning(error.message); } } });
  $("confirm-cancel").addEventListener("click", () => answerConfirmation(false));
  $("confirm-accept").addEventListener("click", () => answerConfirmation(true));
  document.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", () => requestClose($(button.dataset.close))));
  document.querySelectorAll("dialog").forEach(dialog => {
    dialog.addEventListener("cancel", event => { event.preventDefault(); if (dialog.id === "confirm-dialog") answerConfirmation(false); else requestClose(dialog); });
    dialog.addEventListener("close", () => {
      restoreDialogFocus(dialog);
      if (dialog.id === "workout-dialog" && pendingSavedScroll) {
        const id = pendingSavedScroll; pendingSavedScroll = null;
        requestAnimationFrame(() => document.querySelector(`#week-grid [data-workout-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest" }));
      }
    });
    dialog.addEventListener("keydown", event => {
      if (event.key !== "Tab") return;
      const focusable = [...dialog.querySelectorAll("button, input, select, textarea, a[href], [tabindex='0']")].filter(element => !element.disabled && element.getClientRects().length > 0);
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
  });
  $("retry-save").addEventListener("click", persist);
  $("download-data").addEventListener("click", downloadCurrentData);
  $("open-settings").addEventListener("click", openSettings); $("settings-types").addEventListener("click", openTypes);
  $("setting-quotes").addEventListener("change", event => changeSetting("quotesVisible", event.target.checked));
  $("setting-reminders").addEventListener("change", event => changeSetting("remindersEnabled", event.target.checked));
  $("dismiss-reminder").addEventListener("click", () => { reminderRows = []; $("workout-reminder").hidden = true; refreshSupport(); });
  for (const id of ["export-data", "nudge-export", "import-export-current", "conflict-export"]) $(id).addEventListener("click", downloadCurrentData);
  for (const id of ["import-data", "restore-data"]) $(id).addEventListener("click", chooseImport);
  $("import-file").addEventListener("change", event => readImportFile(event.target.files[0]));
  $("confirm-import").addEventListener("click", confirmImport); $("reset-data").addEventListener("click", resetDamagedData);
  for (const id of ["load-latest", "conflict-load"]) $(id).addEventListener("click", () => loadLatest().catch(error => storageWarning(error.message)));
  $("nudge-later").addEventListener("click", () => { const candidate = clone(state); candidate.backup.reminderDismissedDate = today(); try { commit(candidate); } catch (error) { storageWarning(error.message); } });
  window.addEventListener("storage", event => { if (event.key === STORAGE_KEY || event.key === null) storageChanged(); });
  window.addEventListener("beforeunload", event => { if (dirty || hasDrafts()) { event.preventDefault(); event.returnValue = ""; } });
  window.addEventListener("focus", refreshDay);
  window.addEventListener("pageshow", refreshDay);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshDay(); else refreshSupport(); });
  load(); render(); refreshDay();
})();
