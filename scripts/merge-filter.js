import fs from "fs";
import crypto from "crypto";

const filters = JSON.parse(fs.readFileSync("./config/filters.json", "utf-8"));

const NON_LAGOS_NIGERIAN_CITIES = [
  "abuja", "enugu", "kano", "ibadan", "port harcourt", "kaduna",
  "benin city", "jos", "owerri", "calabar", "warri", "uyo",
  "abeokuta", "ilorin", "onitsha", "aba", "asaba", "akure", "makurdi",
  "minna", "sokoto", "maiduguri", "zaria", "ogun", "ondo", "oyo", "kwara"
];

// A stable ID based on the job's own content (title + company), not its
// position in a list — shared between merge-filter.js and run.js so both
// always compute the exact same ID for the exact same job.
export function stableId(job) {
  const key = `${job.title.toLowerCase().trim()}|${job.company.toLowerCase().trim()}`;
  return crypto.createHash("md5").update(key).digest("hex").slice(0, 10);
}

function matchesFilters(job) {
  const title = job.title.toLowerCase();
  const location = (job.location || "").toLowerCase();

  const isExcluded = filters.excludeTitles.some(bad => title.includes(bad));
  if (isExcluded) return false;

  const isIncluded = filters.includeTitles.some(good => title.includes(good));
  if (!isIncluded) return false;

  const mentionsRemote = ["remote", "worldwide", "anywhere", "global"].some(
    signal => location.includes(signal)
  );

  const mentionsOtherNigerianCity = NON_LAGOS_NIGERIAN_CITIES.some(
    city => location.includes(city)
  );
  if (mentionsOtherNigerianCity && !mentionsRemote) return false;

  return mentionsRemote
    || location.includes("lagos")
    || !location
    || location === "not specified"
    || location === "see listing";
}

function dedupeKey(job) {
  return `${job.title.toLowerCase().trim()}|${job.company.toLowerCase().trim()}`;
}

/**
 * seenIds: a Set of job IDs (from stableId) that have already been shown
 * to the user in a previous run. Anything matching gets excluded before
 * the round-robin selection, so already-seen jobs never take up one of
 * today's slots again — regardless of whether the user applied, saved,
 * or skipped it. This is what actually guarantees "new" means new.
 */
export function mergeAndFilter(jobs, seenIds = new Set()) {
  const seen = new Set();
  const deduped = [];

  for (const job of jobs) {
    const key = dedupeKey(job);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(job);
  }

  const filtered = deduped
    .filter(matchesFilters)
    .filter(job => !seenIds.has(stableId(job)));

  filtered.sort((a, b) => {
    if (!a.postedAt) return 1;
    if (!b.postedAt) return -1;
    return new Date(b.postedAt) - new Date(a.postedAt);
  });

  const bySource = {};
  for (const job of filtered) {
    if (!bySource[job.source]) bySource[job.source] = [];
    bySource[job.source].push(job);
  }
  const sourceNames = Object.keys(bySource);

  const final = [];
  let round = 0;
  while (final.length < filters.maxResultsPerRun && sourceNames.some(s => bySource[s][round])) {
    for (const source of sourceNames) {
      if (final.length >= filters.maxResultsPerRun) break;
      const job = bySource[source][round];
      if (job) final.push(job);
    }
    round++;
  }

  return final;
}
