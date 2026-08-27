import { invoke } from "@tauri-apps/api/core";

export interface WebDavConfig {
  enabled: boolean;
  serverUrl: string;
  username: string;
  password: string;
  remotePath: string; // e.g. "/OxideDeck"
  autoSyncOnLaunch: boolean;
  autoSyncOnReview: boolean;
  autoSyncOnChange: boolean; // Auto-sync right after adding new decks, tests, or flashcards
  syncIntervalValue: number; // e.g. 30, 5, 10
  syncIntervalUnit: 'seconds' | 'minutes' | 'disabled';
  lastSyncedAt: string | null;
  lastRemoteEtag?: string | null;
}

export const DEFAULT_WEBDAV_CONFIG: WebDavConfig = {
  enabled: false,
  serverUrl: "",
  username: "",
  password: "",
  remotePath: "/OxideDeck",
  autoSyncOnLaunch: false,
  autoSyncOnReview: false,
  autoSyncOnChange: true,
  syncIntervalValue: 5,
  syncIntervalUnit: 'disabled',
  lastSyncedAt: null,
  lastRemoteEtag: null,
};

export function getSyncIntervalSeconds(config: WebDavConfig): number {
  if (!config.enabled || config.syncIntervalUnit === 'disabled') {
    return 0;
  }
  const val = Math.max(1, Number(config.syncIntervalValue) || 1);
  if (config.syncIntervalUnit === 'seconds') {
    return Math.max(5, val); // Minimum 5 seconds to prevent spamming
  }
  return val * 60; // Convert minutes to seconds
}

export interface WebDavResponse {
  status: number;
  status_text: string;
  headers: Record<string, string>;
  body: string;
  is_success: boolean;
}

export function loadWebDavConfig(): WebDavConfig {
  try {
    const raw = localStorage.getItem("oxide_deck_webdav_config");
    if (raw) {
      const parsed = JSON.parse(raw);
      // Migration from legacy syncIntervalMinutes if present
      if (typeof parsed.syncIntervalMinutes === 'number' && !parsed.syncIntervalUnit) {
        if (parsed.syncIntervalMinutes > 0) {
          parsed.syncIntervalValue = parsed.syncIntervalMinutes;
          parsed.syncIntervalUnit = 'minutes';
        } else {
          parsed.syncIntervalUnit = 'disabled';
        }
      }
      return { ...DEFAULT_WEBDAV_CONFIG, ...parsed };
    }
  } catch (e) {
    console.error("Failed to load WebDAV config:", e);
  }
  return DEFAULT_WEBDAV_CONFIG;
}

export function saveWebDavConfig(config: WebDavConfig): void {
  localStorage.setItem("oxide_deck_webdav_config", JSON.stringify(config));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("webdav-config-changed", { detail: config }));
  }
}

function buildBasicAuth(user: string, pass: string): string {
  try {
    return `Basic ${btoa(unescape(encodeURIComponent(`${user}:${pass}`)))}`;
  } catch {
    return `Basic ${btoa(`${user}:${pass}`)}`;
  }
}

function normalizeUrl(baseUrl: string, subPath: string): string {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const cleanSub = subPath.replace(/^\/+/, "");
  return cleanSub ? `${cleanBase}/${cleanSub}` : cleanBase;
}

/**
 * Execute a WebDAV request via Tauri Rust native client (avoiding CORS) with browser fallback.
 */
export async function executeWebDav(
  config: WebDavConfig,
  method: string,
  subPath: string,
  headers: Record<string, string> = {},
  body?: string
): Promise<WebDavResponse> {
  const fullUrl = normalizeUrl(config.serverUrl, subPath);
  const authHeader = buildBasicAuth(config.username, config.password);

  const reqHeaders: Record<string, string> = {
    Authorization: authHeader,
    ...headers,
  };

  try {
    // Attempt Tauri native invoke first
    const res = await invoke<WebDavResponse>("webdav_exec", {
      method,
      url: fullUrl,
      headers: reqHeaders,
      body: body || null,
    });
    return res;
  } catch (tauriError) {
    // If running in browser / dev preview without native backend, fallback to fetch
    console.warn("Tauri native webdav_exec unavailable, attempting fetch fallback:", tauriError);
    try {
      const response = await fetch(fullUrl, {
        method,
        headers: reqHeaders,
        body: body ? body : undefined,
      });

      const text = await response.text();
      const status = response.status;
      const isSuccess =
        response.ok || status === 207 || status === 201 || status === 204 || status === 405;

      const respHeaders: Record<string, string> = {};
      response.headers.forEach((v, k) => {
        respHeaders[k] = v;
      });

      return {
        status,
        status_text: response.statusText,
        headers: respHeaders,
        body: text,
        is_success: isSuccess,
      };
    } catch (fetchErr: any) {
      throw new Error(`WebDAV Connection Error: ${fetchErr?.message || fetchErr || tauriError}`);
    }
  }
}

/**
 * Test connectivity, authentication, and ensure the target directory exists.
 */
export async function testWebDAVConnection(
  config: WebDavConfig
): Promise<{ success: boolean; message: string }> {
  if (!config.serverUrl.trim()) {
    return { success: false, message: "Please enter a valid WebDAV server URL." };
  }
  if (!config.username.trim() || !config.password.trim()) {
    return { success: false, message: "Username and password are required." };
  }

  try {
    // 1. Probe the root / server base path with PROPFIND or OPTIONS
    const probeRes = await executeWebDav(
      config,
      "PROPFIND",
      "",
      { Depth: "0", "Content-Type": "application/xml; charset=utf-8" },
      `<?xml version="1.0" encoding="utf-8" ?><D:propfind xmlns:D="DAV:"><D:prop><D:displayname/></D:prop></D:propfind>`
    );

    if (probeRes.status === 401 || probeRes.status === 403) {
      return {
        success: false,
        message: "Authentication failed (HTTP " + probeRes.status + "). Please check your username and app password.",
      };
    }

    if (probeRes.status === 404) {
      return {
        success: false,
        message: "Server URL path not found (HTTP 404). Verify the WebDAV endpoint URL.",
      };
    }

    if (!probeRes.is_success && probeRes.status !== 405) {
      // Try fallback OPTIONS check
      const optionsRes = await executeWebDav(config, "OPTIONS", "");
      if (!optionsRes.is_success) {
        return {
          success: false,
          message: `Server returned HTTP ${probeRes.status}: ${probeRes.status_text || "Connection failed"}`,
        };
      }
    }

    // 2. Ensure remote sync directory exists (e.g. /OxideDeck)
    if (config.remotePath && config.remotePath.trim() !== "/") {
      await ensureRemoteDirectory(config);
    }

    return {
      success: true,
      message: "Successfully connected to WebDAV server and verified directory!",
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || "Failed to reach WebDAV server. Check network and URL.",
    };
  }
}

const verifiedDirectories = new Set<string>();

export function clearVerifiedDirectoriesCache(): void {
  verifiedDirectories.clear();
}

/**
 * Ensure the remote synchronization directory exists via MKCOL.
 * Caches verified paths in memory to eliminate redundant HTTP roundtrips on every upload.
 */
export async function ensureRemoteDirectory(config: WebDavConfig, forceCheck = false): Promise<void> {
  const remoteFolder = config.remotePath.trim().replace(/^\/+|\/+$/g, "");
  if (!remoteFolder) return;

  const cacheKey = `${config.serverUrl.trim()}|${config.username.trim()}|${remoteFolder}`;
  if (!forceCheck && verifiedDirectories.has(cacheKey)) {
    return;
  }

  const parts = remoteFolder.split("/");
  let currentPath = "";

  for (const part of parts) {
    currentPath += "/" + part;
    try {
      const res = await executeWebDav(config, "MKCOL", currentPath);
      // 201 Created or 405 Method Not Allowed (already exists) are acceptable
      if (!res.is_success && res.status !== 405 && res.status !== 301 && res.status !== 409) {
        console.warn(`MKCOL on ${currentPath} returned status ${res.status}`);
      }
    } catch (e) {
      console.warn(`MKCOL check on ${currentPath}:`, e);
    }
  }

  verifiedDirectories.add(cacheKey);
}

/**
 * Upload the master synchronization JSON bundle to the WebDAV server.
 */
export async function uploadSyncPackage(
  config: WebDavConfig,
  syncDataJson: string
): Promise<void> {
  await ensureRemoteDirectory(config);

  const remoteFolder = config.remotePath.trim().replace(/\/+$/, "");
  const syncFilePath = `${remoteFolder}/oxide_deck_sync.json`;

  const res = await executeWebDav(
    config,
    "PUT",
    syncFilePath,
    {
      "Content-Type": "application/json; charset=utf-8",
    },
    syncDataJson
  );

  if (!res.is_success) {
    throw new Error(`Failed to upload sync data: HTTP ${res.status} (${res.status_text})`);
  }
}

/**
 * Download the master synchronization JSON bundle from the WebDAV server.
 */
export async function downloadSyncPackage(
  config: WebDavConfig
): Promise<string | null> {
  const remoteFolder = config.remotePath.trim().replace(/\/+$/, "");
  const syncFilePath = `${remoteFolder}/oxide_deck_sync.json`;

  const res = await executeWebDav(config, "GET", syncFilePath);

  if (res.status === 404) {
    return null; // Remote file doesn't exist yet (first sync)
  }

  if (!res.is_success) {
    throw new Error(`Failed to download sync data: HTTP ${res.status} (${res.status_text})`);
  }

  return res.body;
}

/**
 * Fast check to retrieve remote sync file metadata (ETag & Last-Modified) with near-zero bandwidth overhead.
 */
export async function getRemoteFileMetadata(
  config: WebDavConfig
): Promise<{ exists: boolean; etag?: string; lastModified?: string }> {
  const remoteFolder = config.remotePath.trim().replace(/\/+$/, "");
  const syncFilePath = `${remoteFolder}/oxide_deck_sync.json`;

  try {
    const res = await executeWebDav(config, "HEAD", syncFilePath);
    if (res.status === 404) {
      return { exists: false };
    }

    // Lookup headers in case-insensitive fashion
    let etag: string | undefined;
    let lastModified: string | undefined;
    for (const [k, v] of Object.entries(res.headers || {})) {
      const lower = k.toLowerCase();
      if (lower === "etag") etag = v;
      if (lower === "last-modified") lastModified = v;
    }

    return {
      exists: res.is_success,
      etag: etag ? etag.replace(/^W\//, "") : undefined,
      lastModified,
    };
  } catch {
    // If HEAD fails on servers that forbid HEAD, treat as needing check
    return { exists: true };
  }
}
