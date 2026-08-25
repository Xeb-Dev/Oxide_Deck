import { getDB } from "./connection";
import type { FsrsParametersInfo } from "./types";
import { DEFAULT_W, loadParameters, saveParameters } from "../fsrs";

export async function getFSRSParameters(): Promise<FsrsParametersInfo> {
  const db = await getDB();
  const { w, updatedAt } = await loadParameters(db);
  const countRes = await db.select<{ count: number }[]>("SELECT COUNT(*) as count FROM revision_history WHERE rating IS NOT NULL");
  const reviewCount = countRes[0]?.count || 0;
  const isDefault = updatedAt === null || JSON.stringify(w) === JSON.stringify([...DEFAULT_W]);
  return { w, updatedAt, isDefault, reviewCount };
}

/**
 * Optimize FSRS parameters from review history.
 */
export async function optimizeFSRSParameters(): Promise<{ ok: boolean; message: string }> {
  const db = await getDB();
  const countRes = await db.select<{ count: number }[]>("SELECT COUNT(*) as count FROM revision_history WHERE rating IS NOT NULL");
  const reviewCount = countRes[0]?.count || 0;
  const MIN_REVIEWS = 1000;
  if (reviewCount < MIN_REVIEWS) {
    return {
      ok: false,
      message: `Insufficient data: ${reviewCount}/${MIN_REVIEWS} rated reviews. Optimization will be available once you have more review history.`,
    };
  }
  // Persist the default parameters as the "optimized" baseline for now.
  await saveParameters(db, [...DEFAULT_W]);
  return {
    ok: true,
    message: `Parameters updated based on ${reviewCount} reviews. (Optimizer is a placeholder — gradient-descent optimization is planned for a future release.)`,
  };
}

export async function resetFSRSParameters(): Promise<void> {
  const db = await getDB();
  await saveParameters(db, [...DEFAULT_W]);
}
