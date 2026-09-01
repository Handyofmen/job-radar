import fetch from "node-fetch";
import fs from "fs";
import { sources } from "./config-loader.js";

const filters = JSON.parse(fs.readFileSync("./config/filters.json", "utf-8"));

/**
 * Each fetcher returns an array of normalized job objects:
 * { title, company, location, link, source, postedAt }
 */
async function fetchJooble() {
  const { apiKey, endpoint } = sources.jooble;
  if (!apiKey) return [];

  // Jooble's free tier has a 500-request LIFETIME cap, not daily/monthly.
  // One combined query (all include-titles OR'd together) instead of one
  // request per title — was 17 requests/run, now 1.
  const combinedKeywords = filters.includeTitles.join(" OR ");

  const res = await fetch(`${endpoint}${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keywords: combinedKeywords, location: "" })
  });
  const data = await res.json();

  return (data.jobs || []).map(j => ({
    title: j.title,
    company: j.company || "Unknown",
    location: j.location || "Not specified",
    link: j.link,
    source: "Jooble",
    postedAt: j.updated || null
  }));
}

async function fetchRemotive() {
  const { endpoint } = sources.remotive;
  const results = [];
  for (const title of filters.includeTitles) {
    const res = await fetch(`${endpoint}?search=${encodeURIComponent(title)}`);
    const data = await res.json();
    (data.jobs || []).forEach(j => {
      results.push({
        title: j.title,
        company: j.company_name,
        location: j.candidate_required_location || "Remote",
        link: j.url,
        source: "Remotive",
        postedAt: j.publication_date
      });
    });
  }
  return results;
}

async function fetchRemoteOK() {
  const { endpoint } = sources.remoteok;
  const res = await fetch(endpoint, {
    headers: { "User-Agent": "job-radar-personal-tool" }
  });
  const data = await res.json();
  // RemoteOK returns a legal notice as the first array item — skip it
  return data.slice(1).map(j => ({
    title: j.position,
    company: j.company,
    location: j.location || "Remote",
    link: j.url,
    source: "RemoteOK",
    postedAt: j.date
  }));
}

async function fetchAdzuna() {
  const { appId, appKey } = sources.adzuna;
  if (!appId) return [];
  const countries = ["us", "gb"];
  const results = [];
  for (const country of countries) {
    for (const title of filters.includeTitles) {
      const url = `https://api.adzuna.com/v1/api/jobs/${country}/search/1?app_id=${appId}&app_key=${appKey}&what=${encodeURIComponent(title)}`;
      const res = await fetch(url);
      const data = await res.json();
      (data.results || []).forEach(j => {
        results.push({
          title: j.title,
          company: j.company?.display_name || "Unknown",
          location: j.location?.display_name || "Not specified",
          link: j.redirect_url,
          source: "Adzuna",
          postedAt: j.created
        });
      });
    }
  }
  return results;
}

export async function fetchAllApiSources() {
  const [jooble, remotive, remoteok, adzuna] = await Promise.all([
    fetchJooble().catch(() => []),
    fetchRemotive().catch(() => []),
    fetchRemoteOK().catch(() => []),
    fetchAdzuna().catch(() => [])
  ]);
  return [...jooble, ...remotive, ...remoteok, ...adzuna];
}