import fs from "fs";

function loadFileConfig() {
  try {
    return JSON.parse(fs.readFileSync("./config/sources.json", "utf-8"));
  } catch {
    // Missing file is fine — this happens in CI, where secrets come from env vars instead
    return {};
  }
}

const fileConfig = loadFileConfig();

export const sources = {
  jooble: {
    apiKey: process.env.JOOBLE_API_KEY || fileConfig.jooble?.apiKey || "",
    endpoint: fileConfig.jooble?.endpoint || "https://jooble.org/api/"
  },
  adzuna: {
    appId: process.env.ADZUNA_APP_ID || fileConfig.adzuna?.appId || "",
    appKey: process.env.ADZUNA_APP_KEY || fileConfig.adzuna?.appKey || "",
    country: fileConfig.adzuna?.country || "gb"
  },
  remotive: {
    endpoint: fileConfig.remotive?.endpoint || "https://remotive.com/api/remote-jobs"
  },
  remoteok: {
    endpoint: fileConfig.remoteok?.endpoint || "https://remoteok.com/api"
  },
  gmail: {
    clientId: process.env.GOOGLE_CLIENT_ID || fileConfig.gmail?.clientId || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || fileConfig.gmail?.clientSecret || "",
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN || fileConfig.gmail?.refreshToken || "",
    labelsToScan: fileConfig.gmail?.labelsToScan
      || ["Jobberman", "LinkedIn", "Jooble", "Glassdoor", "MyJobMag", "Indeed"],
    processedLabel: fileConfig.gmail?.processedLabel || "Processed"
  }
};
