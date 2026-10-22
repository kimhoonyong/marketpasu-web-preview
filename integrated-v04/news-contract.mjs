/**
 * MarketPasu v0.4 — pure display projection for newsCandidatesV21.
 * No imports, Firebase SDK, network, writes, or operational credentials.
 *
 * This projection is NOT an authorization boundary. Future server-side API
 * must verify identity, approved membership, scope and budget limits before
 * retrieving operational records, then send ONLY this allowlisted shape.
 */
export const MAX_DISPLAY_ROWS = 10;

function clean(value, limit) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, limit);
}
function safeCounter(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
function isoDate(value) {
  let date;
  if (typeof value === "string" || value instanceof Date) {
    date = new Date(value);
  } else if (value && Number.isSafeInteger(value.seconds) && value.seconds >= 0) {
    // Firestore Timestamp-like object, including REST-compatible snapshots.
    date = new Date(value.seconds * 1000);
  } else {
    return "";
  }
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}
function statusOf(d) {
  const changeCount = safeCounter(d.publisherTitleChangeCount);
  const missingCount = safeCounter(d.publisherMissingCount);
  const reviewed = d.publisherReviewRequired === true;
  const changed = d.publisherCheckStatus === "title_change_review" ||
    (reviewed && changeCount > 0);
  if (changed) return ["changed", "발행처 제목 변경 의심 · 검토 필요"];
  if (reviewed || missingCount > 0 ||
      d.publisherCheckStatus === "possible_removal_review" ||
      d.publisherCheckStatus === "not_found_once")
    return ["review", "발행처 확인 필요 · 삭제 확정 아님"];
  if (safeCounter(d.seenCount) > 1)
    return ["repeat", "재관측 · 재노출 여부 검토"];
  return ["normal", "확인 중 · 미판정"];
}

/**
 * Maps an operational candidate object to a minimal display-only record.
 * In particular: RSS URL, publisher URL, AI fields, counters unrelated to the
 * view, control/billing fields, internal flags and histories are NOT included.
 */
export function projectCandidate(id, data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const title = clean(data.title, 180);
  if (!title) return null;
  const [status, statusLabel] = statusOf(data);
  return Object.freeze({
    id: clean(id, 90),
    title,
    publisher: clean(data.source, 100) || "발행처 확인 전",
    firstPublished: isoDate(data.publishedAt),
    firstCollected: isoDate(data.firstSeenAt),
    lastSeen: isoDate(data.lastSeenAt),
    observations: safeCounter(data.seenCount),
    status,
    statusLabel
  });
}
export function projectCandidates(rows, max = MAX_DISPLAY_ROWS) {
  if (!Array.isArray(rows) || !Number.isSafeInteger(max) ||
      max < 1 || max > MAX_DISPLAY_ROWS) return Object.freeze([]);
  const projected = [];
  for (const row of rows.slice(0, max)) {
    const item = projectCandidate(row?.id, row?.data);
    if (item) projected.push(item);
  }
  return Object.freeze(projected);
}
