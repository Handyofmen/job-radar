import fs from "fs";

const filters = JSON.parse(fs.readFileSync("./config/filters.json", "utf-8"));

function matchesFilters(job) {
  const title = job.title.toLowerCase();
  const location = (job.location || "").toLowerCase();

  const isExcluded = filters.excludeTitles.some(bad => title.includes(bad));
  if (isExcluded) return false;

  const isIncluded = filters.includeTitles.some(good => title.includes(good));
  if (!isIncluded) return false;

  // Location eligibility check — many US/UK on-site listings pass the title
  // filter but aren't actually open to a Nigeria-based remote applicant.
  // Accept if location mentions remote/worldwide/Nigeria, OR if no location
  // was given at all (some APIs omit it, so absence isn't treated as exclusion).
  const acceptableLocationSignals = [
    "remote", "worldwide", "anywhere", "nigeria", "lagos", "africa", "global"
  ];
  const looksEligible = !location
    || location === "not specified"
    || location === "see listing"
    || acceptableLocationSignals.some(signal => location.includes(signal));

  return looksEligible;
}

function dedupeKey(job) {
  return `${job.title.toLowerCase().trim()}|${job.company.toLowerCase().trim()}`;
}

export function mergeAndFilter(jobs) {
  const seen = new Set();
  const deduped = [];

  for (const job of jobs) {
    const key = dedupeKey(job);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(job);
  }

  const filtered = deduped.filter(matchesFilters);

  // Sort within each source by recency (undated jobs sink to the end of
  // their own group, rather than the end of everything)
  filtered.sort((a, b) => {
    if (!a.postedAt) return 1;
    if (!b.postedAt) return -1;
    return new Date(b.postedAt) - new Date(a.postedAt);
  });

  // Group by source so one prolific source (e.g. Jooble) can't crowd out
  // every other source — previously a pure global sort let this happen,
  // silently dropping Adzuna/Remotive/RemoteOK/Gmail results entirely
  // even when hundreds of matching jobs existed.
  const bySource = {};
  for (const job of filtered) {
    if (!bySource[job.source]) bySource[job.source] = [];
    bySource[job.source].push(job);
  }
  const sourceNames = Object.keys(bySource);

  // Round-robin: take one job from each source in turn until the cap is hit
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
