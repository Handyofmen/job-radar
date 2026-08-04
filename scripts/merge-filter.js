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

  // Most recent first when we have a date, otherwise keep original order
  filtered.sort((a, b) => {
    if (!a.postedAt) return 1;
    if (!b.postedAt) return -1;
    return new Date(b.postedAt) - new Date(a.postedAt);
  });

  return filtered.slice(0, filters.maxResultsPerRun);
}
