import { useState, useEffect } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";

const resolvedCache = new Map<string, string>();

/**
 * Resolves any image URL, converting "media://<sha256>.<ext>" to a local Tauri asset URL.
 */
export async function resolveMediaUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  if (!url.startsWith("media://")) {
    return url;
  }

  if (resolvedCache.has(url)) {
    return resolvedCache.get(url)!;
  }

  try {
    const isTauri =
      typeof window !== "undefined" &&
      Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);

    if (isTauri) {
      const filePath = await invoke<string>("resolve_media_file_path", { mediaUri: url });
      const assetUrl = convertFileSrc(filePath);
      resolvedCache.set(url, assetUrl);
      return assetUrl;
    }
  } catch (err) {
    console.warn("Failed to resolve media URI:", url, err);
  }

  return url;
}

/**
 * Returns cached asset URL or the original URL synchronously.
 */
export function getCachedMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!url.startsWith("media://")) return url;
  return resolvedCache.get(url) || null;
}

/**
 * React hook to effortlessly display images that might use "media://" URIs.
 */
export function useResolvedMediaUrl(url: string | null | undefined): string | null {
  const [resolved, setResolved] = useState<string | null>(getCachedMediaUrl(url));

  useEffect(() => {
    let active = true;
    if (!url) {
      setResolved(null);
      return;
    }

    if (!url.startsWith("media://")) {
      setResolved(url);
      return;
    }

    if (resolvedCache.has(url)) {
      setResolved(resolvedCache.get(url)!);
      return;
    }

    resolveMediaUrl(url).then((res) => {
      if (active) {
        setResolved(res);
      }
    });

    return () => {
      active = false;
    };
  }, [url]);

  return resolved;
}
