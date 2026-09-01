import fs from "fs";
import { fetchAllApiSources } from "./fetch-apis.js";
import { fetchAndParseGmailAlerts } from "./parse-gmail.js";
import { mergeAndFilter, stableId } from "./merge-filter.js";

const filters = JSON.parse(fs.readFileSync("./config/filters.json", "utf-8"));

const SEEN_FILES = {
  nigeria: "./data/seen-jobs-nigeria.json",
  international: "./data/seen-jobs-international.json"
};
const OUTPUT_FILES = {
  nigeria: "./data/jobs-nigeria.json",
  international: "./data/jobs-international.json"
};

function loadSeenIds(market) {
  try {
    const raw = JSON.parse(fs.readFileSync(SEEN_FILES[market], "utf-8"));
    return new Set(raw.map(entry => entry.id));
  } catch {
    return new Set();
  }
}

function saveSeenIds(market, seenIds) {
  const entries = Array.from(seenIds).map(id => ({ id }));
  fs.writeFileSync(SEEN_FILES[market], JSON.stringify(entries, null, 2));
}

async function main() {
  console.log("Fetching from job APIs...");
  const apiJobs = await fetchAllApiSources();
  console.log(`  → ${apiJobs.length} jobs from APIs`);

  console.log("Parsing Gmail alerts...");
  const gmailJobs = await fetchAndParseGmailAlerts();
  console.log(`  → ${gmailJobs.length} jobs from Gmail`);

  const allJobs = [...apiJobs, ...gmailJobs];

  const seenIds = {
    nigeria: loadSeenIds("nigeria"),
    international: loadSeenIds("international")
  };
  console.log(`  → ${seenIds.nigeria.size} Nigeria jobs already shown (excluded)`);
  console.log(`  → ${seenIds.international.size} international jobs already shown (excluded)`);

  const buckets = mergeAndFilter(allJobs, seenIds, filters);

  fs.mkdirSync("./data", { recursive: true });

  for (const market of ["nigeria", "international"]) {
    const jobs = buckets[market];
    const output = {
      generatedAt: new Date().toISOString(),
      market,
      count: jobs.length,
      jobs: jobs.map(j => ({ id: stableId(j), status: "new", ...j }))
    };
    fs.writeFileSync(OUTPUT_FILES[market], JSON.stringify(output, null, 2));

    jobs.forEach(job => seenIds[market].add(stableId(job)));
    saveSeenIds(market, seenIds[market]);

    console.log(`${market}: ${jobs.length} new jobs written to ${OUTPUT_FILES[market]}`);
  }

  console.log("Done.");
}

main().catch(err => {
  console.error("Run failed:", err);
  process.exit(1);
});