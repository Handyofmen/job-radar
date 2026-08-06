import fs from "fs";
import crypto from "crypto";
import { fetchAllApiSources } from "./fetch-apis.js";
import { fetchAndParseGmailAlerts } from "./parse-gmail.js";
import { mergeAndFilter } from "./merge-filter.js";

// A stable ID based on the job's own content (title + company), not its
// position in the list — position-based IDs meant yesterday's "Skip" on
// slot #1 would incorrectly mark today's completely different job #1 too.
function stableId(job) {
  const key = `${job.title.toLowerCase().trim()}|${job.company.toLowerCase().trim()}`;
  return crypto.createHash("md5").update(key).digest("hex").slice(0, 10);
}

async function main() {
  console.log("Fetching from job APIs...");
  const apiJobs = await fetchAllApiSources();
  console.log(`  → ${apiJobs.length} jobs from APIs`);

  console.log("Parsing Gmail alerts...");
  const gmailJobs = await fetchAndParseGmailAlerts();
  console.log(`  → ${gmailJobs.length} jobs from Gmail`);

  const allJobs = [...apiJobs, ...gmailJobs];
  const finalJobs = mergeAndFilter(allJobs);

  const output = {
    generatedAt: new Date().toISOString(),
    count: finalJobs.length,
    jobs: finalJobs.map(j => ({ id: stableId(j), status: "new", ...j }))
  };

  fs.mkdirSync("./data", { recursive: true });
  fs.writeFileSync("./data/jobs.json", JSON.stringify(output, null, 2));
  console.log(`Done. ${finalJobs.length} jobs written to data/jobs.json`);
}

main().catch(err => {
  console.error("Run failed:", err);
  process.exit(1);
});
