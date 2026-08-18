import fs from "fs";
import { fetchAllApiSources } from "./fetch-apis.js";
import { fetchAndParseGmailAlerts } from "./parse-gmail.js";
import { mergeAndFilter, stableId } from "./merge-filter.js";

const SEEN_FILE = "./data/seen-jobs.json";

function loadSeenIds() {
  try {
    const raw = JSON.parse(fs.readFileSync(SEEN_FILE, "utf-8"));
    return new Set(raw.map(entry => entry.id));
  } catch {
    // First run ever, or file doesn't exist yet — start with an empty set
    return new Set();
  }
}

function saveSeenIds(seenIds) {
  const entries = Array.from(seenIds).map(id => ({ id }));
  fs.writeFileSync(SEEN_FILE, JSON.stringify(entries, null, 2));
}

async function main() {
  console.log("Fetching from job APIs...");
  const apiJobs = await fetchAllApiSources();
  console.log(`  → ${apiJobs.length} jobs from APIs`);

  console.log("Parsing Gmail alerts...");
  const gmailJobs = await fetchAndParseGmailAlerts();
  console.log(`  → ${gmailJobs.length} jobs from Gmail`);

  const allJobs = [...apiJobs, ...gmailJobs];

  const seenIds = loadSeenIds();
  console.log(`  → ${seenIds.size} jobs already shown in previous runs (excluded)`);

  const finalJobs = mergeAndFilter(allJobs, seenIds);

  const output = {
    generatedAt: new Date().toISOString(),
    count: finalJobs.length,
    jobs: finalJobs.map(j => ({ id: stableId(j), status: "new", ...j }))
  };

  fs.mkdirSync("./data", { recursive: true });
  fs.writeFileSync("./data/jobs.json", JSON.stringify(output, null, 2));

  // Add today's shown jobs to the permanent seen list, so they never
  // reappear in any future run regardless of what the user did with them
  finalJobs.forEach(job => seenIds.add(stableId(job)));
  saveSeenIds(seenIds);

  console.log(`Done. ${finalJobs.length} new jobs written to data/jobs.json`);
}

main().catch(err => {
  console.error("Run failed:", err);
  process.exit(1);
});
