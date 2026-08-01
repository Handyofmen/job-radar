import fs from "fs";
import { fetchAllApiSources } from "./fetch-apis.js";
import { fetchAndParseGmailAlerts } from "./parse-gmail.js";
import { mergeAndFilter } from "./merge-filter.js";

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
    jobs: finalJobs.map((j, i) => ({ id: i + 1, status: "new", ...j }))
  };

  fs.mkdirSync("./data", { recursive: true });
  fs.writeFileSync("./data/jobs.json", JSON.stringify(output, null, 2));
  console.log(`Done. ${finalJobs.length} jobs written to data/jobs.json`);
}

main().catch(err => {
  console.error("Run failed:", err);
  process.exit(1);
});
