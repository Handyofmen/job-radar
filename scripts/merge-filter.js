import fs from "fs";

const filters = JSON.parse(fs.readFileSync("./config/filters.json", "utf-8"));

function matchesFilters(job) {
  const title = job.title.toLowerCase();

  const isExcluded = filters.excludeTitles.some(bad => title.includes(bad));
  if (isExcluded) return false;

  const isIncluded = filters.includeTitles.some(good => title.includes(good));
  return isIncluded;
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
