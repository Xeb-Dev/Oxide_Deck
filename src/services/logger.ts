import { invoke } from "@tauri-apps/api/core";

export interface LogFileInfo {
  name: string;
  size_bytes: number;
  size_formatted: string;
  date: string;
}

export interface LogsSummary {
  total_size_bytes: number;
  total_size_formatted: string;
  files_count: number;
  files: LogFileInfo[];
}

const SENSITIVE_KEYS = new Set([
  "password",
  "auth",
  "authorization",
  "authheader",
  "token",
  "secret",
  "apikey",
  "key",
  "front",
  "back",
  "question_text",
  "correct_answer",
  "user_answer",
]);

/**
 * Strips personal data, passwords, study card texts, and credentials from log payloads.
 */
export function sanitizeLogData(data: any): any {
  if (data === null || data === undefined) return data;
  if (typeof data === "string") {
    // Redact Basic Auth tokens
    let cleaned = data.replace(/Basic\s+[A-Za-z0-9+/=]+/gi, "Basic [REDACTED_AUTH]");
    // Redact Bearer tokens
    cleaned = cleaned.replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, "Bearer [REDACTED_TOKEN]");
    // Redact password fields in strings
    cleaned = cleaned.replace(/password["':=\s]+([^\s"',&]+)/gi, 'password: "[REDACTED]"');
    // Redact email addresses
    cleaned = cleaned.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[REDACTED_EMAIL]");
    return cleaned;
  }
  if (typeof data === "number" || typeof data === "boolean") {
    return data;
  }
  if (Array.isArray(data)) {
    // If it's a large array, just summarize the count rather than logging thousands of items
    if (data.length > 10) {
      return `[Array with ${data.length} items]`;
    }
    return data.map((item) => sanitizeLogData(item));
  }
  if (typeof data === "object") {
    const sanitizedObj: Record<string, any> = {};
    for (const [key, val] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_KEYS.has(lowerKey)) {
        sanitizedObj[key] = "[REDACTED]";
      } else {
        sanitizedObj[key] = sanitizeLogData(val);
      }
    }
    return sanitizedObj;
  }
  return String(data);
}

function formatLogMessage(message: string, data?: any): string {
  if (data === undefined) return message;
  try {
    const cleanData = sanitizeLogData(data);
    const serialized = typeof cleanData === "string" ? cleanData : JSON.stringify(cleanData);
    return `${message} | Data: ${serialized}`;
  } catch {
    return message;
  }
}

/**
 * Global App Logger for diagnostic release debugging.
 */
export const logger = {
  info: (category: string, message: string, data?: any) => {
    const formatted = formatLogMessage(message, data);
    console.info(`[${category}] ${formatted}`);
    invoke("log_event", {
      level: "INFO",
      category,
      message: formatted,
    }).catch(() => {});
  },

  warn: (category: string, message: string, data?: any) => {
    const formatted = formatLogMessage(message, data);
    console.warn(`[${category}] ${formatted}`);
    invoke("log_event", {
      level: "WARN",
      category,
      message: formatted,
    }).catch(() => {});
  },

  error: (category: string, message: string, error?: any) => {
    let errDetail = error;
    if (error instanceof Error) {
      errDetail = {
        name: error.name,
        message: error.message,
        stack: error.stack?.split("\n").slice(0, 3).join(" -> "),
      };
    }
    const formatted = formatLogMessage(message, errDetail);
    console.error(`[${category}] ${formatted}`);
    invoke("log_event", {
      level: "ERROR",
      category,
      message: formatted,
    }).catch(() => {});
  },

  debug: (category: string, message: string, data?: any) => {
    const formatted = formatLogMessage(message, data);
    console.debug(`[${category}] ${formatted}`);
    invoke("log_event", {
      level: "DEBUG",
      category,
      message: formatted,
    }).catch(() => {});
  },
};

/**
 * Fetches the storage summary of all daily log files.
 */
export async function getLogsSummary(): Promise<LogsSummary> {
  try {
    return await invoke<LogsSummary>("get_logs_summary");
  } catch (e) {
    console.error("Failed to get logs summary:", e);
    return {
      total_size_bytes: 0,
      total_size_formatted: "0 B",
      files_count: 0,
      files: [],
    };
  }
}

/**
 * Saves all consolidated diagnostic logs to a file in the system Downloads / Documents folder.
 * Returns the path where the file was saved.
 */
export async function saveDebugLogsToFile(): Promise<string> {
  return await invoke<string>("save_logs_to_file");
}

/**
 * Returns the entire consolidated diagnostic logs text.
 */
export async function getDebugLogsContent(): Promise<string> {
  return await invoke<string>("export_all_logs");
}

/**
 * Permanently deletes all local diagnostic log files.
 */
export async function clearDebugLogs(): Promise<void> {
  await invoke("clear_all_logs");
}
