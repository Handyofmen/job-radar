import { google } from "googleapis";
import fs from "fs";

const sources = JSON.parse(fs.readFileSync("./config/sources.json", "utf-8"));
const { clientId, clientSecret, refreshToken, labelsToScan, processedLabel } = sources.gmail;

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

/**
 * Very lightweight per-source parsing. Job alert HTML is fairly stable
 * template-to-template, so this looks for repeated <a> job-title links
 * and nearby company/location text. Tune the regex per source as templates change.
 */
function parseJobsFromHtml(html, source) {
  const jobs = [];
  const linkPattern = /<a[^>]+href="([^"]+)"[^>]*>([^<]{5,120})<\/a>/g;
  let match;
  while ((match = linkPattern.exec(html)) !== null) {
    const [, link, text] = match;
    const looksLikeJobTitle = /officer|assistant|manager|coordinator|support|service|specialist/i.test(text);
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
  if (!clientId || clientId.startsWith("YOUR_")) return [];

  const gmail = getGmailClient();
  const processedLabelId = await ensureProcessedLabelId(gmail);
  const allJobs = [];

  for (const label of labelsToScan) {
    const query = `label:"${label}" -label:"${processedLabel}" newer_than:1d`;
    const listRes = await gmail.users.messages.list({ userId: "me", q: query, maxResults: 20 });
    const messages = listRes.data.messages || [];

    for (const msg of messages) {
      const full = await gmail.users.messages.get({ userId: "me", id: msg.id, format: "full" });
      const html = decodeBody(full.data.payload);
      const jobs = parseJobsFromHtml(html, label);
      allJobs.push(...jobs);

      // Tag as processed — original label(s) are left untouched
      await gmail.users.messages.modify({
        userId: "me",
        id: msg.id,
        requestBody: { addLabelIds: [processedLabelId] }
      });
    }
  }

  return allJobs;
}
