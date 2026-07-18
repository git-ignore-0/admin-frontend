type DateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function partsAt(date: Date, timeZone: string): DateTimeParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function formatZonedDateTimeInput(iso: string, timeZone: string) {
  const parts = partsAt(new Date(iso), timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function zonedDateTimeInputToIso(value: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("Invalid local date and time");
  const desired = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  };
  const desiredUtc = Date.UTC(
    desired.year,
    desired.month - 1,
    desired.day,
    desired.hour,
    desired.minute,
  );
  let instant = desiredUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const observed = partsAt(new Date(instant), timeZone);
    const observedUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
    );
    instant += desiredUtc - observedUtc;
  }
  const resolved = partsAt(new Date(instant), timeZone);
  if (
    Object.keys(desired).some(
      (key) => desired[key as keyof DateTimeParts] !== resolved[key as keyof DateTimeParts],
    )
  ) {
    throw new Error("This local time does not exist in the selected timezone");
  }
  return new Date(instant).toISOString();
}
