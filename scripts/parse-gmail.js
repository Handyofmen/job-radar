import { google } from "googleapis";
import { sources } from "./config-loader.js";

const { clientId, clientSecret, refreshToken, processedLabel } = sources.gmail;

// Andy's actual Gmail setup consolidates all job alerts under one label
// ("Job Leads"), not separate labels per platform. Source is instead
// identified by matching the sender's email domain.
const JOB_LEADS_LABEL = "Job Leads";

const SENDER_SOURCE_MAP = [
  { match: "jobberman.com", source: "Jobberman" },
  { match: "myjobmag.com", source: "MyJobMag" },
  { match: "glassdoor.com", source: "Glassdoor" },
  { match: "jooble.org", source: "Jooble" },
  { match: "linkedin.com", source: "LinkedIn" },
  { match: "jobalert.indeed.com", source: "Indeed" },
  { match: "indeed.com", source: "Indeed" }
];

function detectSource(senderEmail) {
  const lower = (senderEmail || "").toLowerCase();
  const found = SENDER_SOURCE_MAP.find(entry => lower.includes(entry.match));
  return found ? found.source : "Gmail";
}

function getGmailClient() {
  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oAuth2Client.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: "v1", auth: oAuth2Client });
}

async function ensureProcessedLabelId(gmail) {
  const res = await gmail.users.labels.list({ userId: "me" });
  const existing = res.data.labels.find(l => l.name === processedLabel);
  if (existing) return existing.id;

  const created = await gmail.users.labels.create({
    userId: "me",
    requestBody: { name: processedLabel, labelListVisibility: "labelShow", messageListVisibility: "show" }
  });
  return created.data.id;
}

function decodeBody(payload) {
  let data = "";
  if (payload.parts) {
    const htmlPart = payload.parts.find(p => p.mimeType === "text/html")
      || payload.parts.find(p => p.mimeType === "text/plain");
    if (htmlPart?.body?.data) data = htmlPart.body.data;
  } else if (payload.body?.data) {
    data = payload.body.data;
  }
  return data ? Buffer.from(data, "base64").toString("utf-8") : "";
}

function getHeader(headers, name) {
  const header = (headers || []).find(h => h.name.toLowerCase() === name.toLowerCase());
  return header ? header.value : "";
}

/**
 * Very lightweight per-source parsing. Job alert HTML is fairly stable
 * template-to-template, so this looks for repeated <a> job-title links.
 * Tune the regex per source as templates change.
 */
function parseJobsFromHtml(html, source) {
  const jobs = [];
  const linkPattern = /<a[^>]+href="([^"]+)"[^>]*>([^<]{5,120})<\/a>/g;
  let match;
  while ((match = linkPattern.exec(html)) !== null) {
    const [, link, text] = match;
    const looksLikeJobTitle = /officer|assistant|manager|coordinator|support|service|specialist|administrator/i.test(text);
    if (looksLikeJobTitle) {
      jobs.push({
        title: text.trim(),
        company: "See listing",
        location: "See listing",
        link,
        source,
        postedAt: null
      });
    }
  }
  return jobs;
}

export async function fetchAndParseGmailAlerts() {
  if (!clientId) return [];

  const gmail = getGmailClient();
  const processedLabelId = await ensureProcessedLabelId(gmail);
  const allJobs = [];

  // Single real label, not one per platform — Gmail's query syntax uses
  // hyphens in place of spaces for multi-word label names
  const labelQueryName = JOB_LEADS_LABEL.toLowerCase().replace(/\s+/g, "-");
  const query = `label:${labelQueryName} -label:${processedLabel.toLowerCase()} newer_than:3d`;

  const listRes = await gmail.users.messages.list({ userId: "me", q: query, maxResults: 40 });
  const messages = listRes.data.messages || [];

  for (const msg of messages) {
    const full = await gmail.users.messages.get({ userId: "me", id: msg.id, format: "full" });
    const sender = getHeader(full.data.payload.headers, "From");
    const source = detectSource(sender);

    const html = decodeBody(full.data.payload);
    const jobs = parseJobsFromHtml(html, source);
    allJobs.push(...jobs);

    // Tag as processed — original "Job Leads" label is left untouched
    await gmail.users.messages.modify({
      userId: "me",
      id: msg.id,
      requestBody: { addLabelIds: [processedLabelId] }
    });
  }

  return allJobs;
}
