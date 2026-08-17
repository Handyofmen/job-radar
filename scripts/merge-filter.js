import fs from "fs";

const filters = JSON.parse(fs.readFileSync("./config/filters.json", "utf-8"));

// Nigerian cities other than Lagos — these get excluded unless the listing
// also explicitly says "remote", since a location like "Enugu, Nigeria"
// was previously passing just because it contained "nigeria" broadly.
const NON_LAGOS_NIGERIAN_CITIES = [
  "abuja", "enugu", "kano", "ibadan", "port harcourt", "kaduna",
  "benin city", "jos", "owerri", "calabar", "warri", "uyo",
  "abeokuta", "ilorin", "onitsha", "aba", "asaba", "akure", "makurdi",
  "minna", "sokoto", "maiduguri", "zaria", "ogun", "ondo", "oyo", "kwara"
];

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

  // Explicitly reject other Nigerian cities unless genuinely remote —
  // previously these passed incorrectly just because "nigeria" appeared
  // somewhere in the location string, regardless of which city.
  const mentionsOtherNigerianCity = NON_LAGOS_NIGERIAN_CITIES.some(
    city => location.includes(city)
  );
  if (mentionsOtherNigerianCity && !mentionsRemote) return false;

  const looksEligible = mentionsRemote
    || location.includes("lagos")
    || !location
    || location === "not specified"
    || location === "see listing";

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
