/** Escape a CSV field and neutralise spreadsheet formula injection. */
export function sanitizeCSVField(field) {
  if (typeof field !== "string") return String(field ?? "");
  let cleaned = field.replace(/"/g, '""');
  if (/^[=+\-@\t\r]/.test(cleaned)) cleaned = "'" + cleaned;
  return cleaned;
}

const HEADER =
  "Subject,Duration (min),Completed At,Type,Music Source,Music Title,Music Artist";

export function buildCSV(sessions) {
  return [
    HEADER,
    ...(sessions || []).map((session) =>
      [
        sanitizeCSVField(session.subject || ""),
        session.duration || 0,
        sanitizeCSVField(session.completedAt || ""),
        sanitizeCSVField(session.type || ""),
        sanitizeCSVField(session.musicSource || ""),
        sanitizeCSVField(session.musicTitle || ""),
        sanitizeCSVField(session.musicArtist || ""),
      ]
        .map((field) => (typeof field === "string" ? `"${field}"` : field))
        .join(","),
    ),
  ].join("\n");
}

export function downloadCSV(sessions, filename) {
  const blob = new Blob([buildCSV(sessions)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
