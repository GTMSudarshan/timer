/** Calendar day key in the user's local timezone (YYYY-MM-DD). */
export function localDateKey(input = new Date()) {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Shift a YYYY-MM-DD key by whole days without UTC timezone surprises. */
export function shiftDateKey(key, deltaDays) {
  const [year, month, day] = String(key).split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + deltaDays);
  return localDateKey(date);
}

/** Safe accessor for a stored session's local calendar day. */
export function sessionDateKey(session) {
  return session?.completedAt ? localDateKey(session.completedAt) : null;
}

export default localDateKey;
