import crypto from "crypto";

const NON_LAGOS_NIGERIAN_CITIES = [
  "abuja", "oyo", "ibadan", "kano", "port harcourt", "kaduna", "enugu",
  "benin city", "abeokuta", "warri", "owerri", "jos", "ilorin", "calabar",
  "uyo", "asaba", "onitsha", "aba"
];

/**
 * Content-based job ID. Same job (same title+company+location) always
 * produces the same ID across runs, regardless of when it was fetched —
 * this is what lets seenIds exclusion actually work over time.
 */
export function stableId(job) {
  const key = `${job.title}|${job.company}|${job.location}`
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
  return crypto.createHash("sha1").update(key).digest("hex").slice(0, 16);
}

/**
 * Classifies a job into a market bucket, or marks it ineligible.
 * - "nigeria": Lagos (on-site or remote), or anywhere in Nigeria if explicitly remote
 * - "international": genuinely remote, not tied to Nigeria
 * - ineligible: other named Nigerian cities without an explicit remote tag,
 *   or a location string with no usable signal at all (e.g. Gmail-sourced
 *   jobs, which never carry real location text)
 *
 * remoteConfidence is "unconfirmed" for sources without a description field
 * to cross-check against (Jooble, Gmail-parsed alerts) — surfaced in the
 * frontend rather than silently trusted or dropped.
 */
function classify(job) {
  const loc = (job.location || "").toLowerCase();
  const isRemote = /remote/.test(loc);
  const mentionsLagos = /lagos/.test(loc);
  const mentionsNigeria = /nigeria/.test(loc);
  const mentionsOtherCity = NON_LAGOS_NIGERIAN_CITIES.some(c => loc.includes(c));
  const lowConfidenceSource = job.source === "Jooble" || /gmail/i.test(job.source || "");

  if (mentionsOtherCity && !isRemote) {
    return { eligible: false };
  }
  if (mentionsLagos) {
    return { eligible: true, market: "nigeria", remoteConfidence: "confirmed" };
  }
  if (mentionsNigeria && isRemote) {
    return { eligible: true, market: "nigeria", remoteConfidence: lowConfidenceSource ? "unconfirmed" : "confirmed" };
  }
  if (mentionsNigeria && !isRemote) {
    return { eligible: false };
  }
  if (isRemote) {
    return { eligible: true, market: "international", remoteConfidence: lowConfidenceSource ? "unconfirmed" : "confirmed" };
  }
  if (lowConfidenceSource) {
    return { eligible: true, market: "international", remoteConfidence: "unconfirmed" };
  }
  return { eligible: false };
}

/**
 * Interleaves jobs round-robin by source so one high-volume source
 * (historically Jooble) can't consume the entire maxResultsPerRun cap.
 * Input jobs are assumed already sorted by recency within each source.
 */
function roundRobinBySource(jobs) {
  const bySource = new Map();
  for (const job of jobs) {
    if (!bySource.has(job.source)) bySource.set(job.source, []);
    bySource.get(job.source).push(job);
  }
  const queues = Array.from(bySource.values());
  const result = [];
  let remaining = jobs.length;
  while (remaining > 0) {
    for (const queue of queues) {
      if (queue.length) {
        result.push(queue.shift());
        remaining--;
      }
    }
  }
  return result;
}

/**
 * jobs: raw normalized jobs from all sources for this run
 * seenIds: { nigeria: Set<id>, international: Set<id> } — per-market,
 *   so marking something seen in one market never affects the other
 * filters: parsed config/filters.json
 *
 * Returns { nigeria: [...], international: [...] }
 */
export function mergeAndFilter(jobs, seenIds, filters) {
  const seenTitleCompany = new Set();
  const buckets = { nigeria: [], international: [] };

  for (const job of jobs) {
    const titleLower = (job.title || "").toLowerCase();
    if (filters.excludeTitles.some(kw => titleLower.includes(kw))) continue;

    const dedupeKey = `${titleLower}|${(job.company || "").toLowerCase()}`;
    if (seenTitleCompany.has(dedupeKey)) continue;
    seenTitleCompany.add(dedupeKey);

    const { eligible, market, remoteConfidence } = classify(job);
    if (!eligible) continue;

    const id = stableId(job);
    if (seenIds[market] && seenIds[market].has(id)) continue;

    buckets[market].push({ ...job, remoteConfidence });
  }

  for (const market of ["nigeria", "international"]) {
    buckets[market].sort((a, b) => new Date(b.postedAt || 0) - new Date(a.postedAt || 0));
    buckets[market] = roundRobinBySource(buckets[market]).slice(0, filters.maxResultsPerRun);
  }

  return buckets;
}