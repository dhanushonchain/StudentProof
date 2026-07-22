const STORAGE_PREFIX = "studentproof_activity_log";

export type ActivityLogEntry = {
  type: "login" | "logout";
  timestamp: string;
};

function keyFor(email: string) {
  return `${STORAGE_PREFIX}:${email}`;
}

export function getActivityLog(email: string): ActivityLogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyFor(email));
    return raw ? (JSON.parse(raw) as ActivityLogEntry[]) : [];
  } catch {
    return [];
  }
}

function appendActivityLog(email: string, entry: ActivityLogEntry) {
  if (typeof window === "undefined") return;
  const log = getActivityLog(email);
  log.push(entry);
  window.localStorage.setItem(keyFor(email), JSON.stringify(log.slice(-50)));
}

export function recordLoginIfNew(email: string, loginAt: string) {
  const log = getActivityLog(email);
  const alreadyRecorded = log.some((entry) => entry.type === "login" && entry.timestamp === loginAt);
  if (!alreadyRecorded) {
    appendActivityLog(email, { type: "login", timestamp: loginAt });
  }
}

export function recordLogout(email: string) {
  appendActivityLog(email, { type: "logout", timestamp: new Date().toISOString() });
}
