import { google } from "googleapis";
import * as cheerio from "cheerio";
import { sources } from "./config-loader.js";

const { clientId, clientSecret, refreshToken, processedLabel } = sources.gmail;

const SCAN_LABEL_NAME = "Job Leads";

const SOURCE_SENDERS = {
  linkedin: "jobalerts-noreply@linkedin.com",
  indeed: "donotreply@jobalert.indeed.com",
  glassdoor: "noreply@glassdoor.com",
  jobberman: "support@jobberman.com",
  myjobmag: "no_reply@myjobmag.com"
};

function decodeBase64Url(data) {
  return Buffer.from(data, "base64url").toString("utf-8");
}

function extractBodies(payload) {
  let html = "";
  let plain = "";
  function walk(part) {
    if (!part) return;
    if (part.mimeType === "text/html" && part.body && part.body.data) {
      html += decodeBase64Url(part.body.data);
    } else if (part.mimeType === "text/plain" && part.body && part.body.data) {
      plain += decodeBase64Url(part.body.data);
    }
    (part.parts || []).forEach(walk);
  }
  walk(payload);
  return { html, plain };
}

function parseLinkedInPlainText(text) {
  const jobs = [];
  const blocks = text.split(/-{10,}/);
  for (const block of blocks) {
    const linkMatch = block.match(/View job:\s*(\S+)/i);
    const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
    const contentLines = lines.filter(l =>
      !/^view job:/i.test(l) && !/actively hiring/i.test(l)
    );
    if (contentLines.length >= 3) {
      const [title, company, location] = contentLines;
      jobs.push({ title, company, location, link: linkMatch ? linkMatch[1] : null, source: "LinkedIn" });
    }
  }
  return jobs;
}

function parseIndeedPlainText(text) {
  const jobs = [];
  const lines = text.split("\n").map(l => l.trim());
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(.+?)\s-\s(.+)$/);
    if (match && lines[i - 1] && lines[i - 1].length > 0 && !lines[i - 1].includes(" - ")) {
      let link = null;
      for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
        if (/^https?:\/\//.test(lines[j])) { link = lines[j]; break; }
      }
      jobs.push({
        title: lines[i - 1],
        company: match[1].trim(),
        location: match[2].trim(),
        link,
        source: "Indeed"
      });
    }
  }
  return jobs;
}

function parseGlassdoorHtml(html) {
  const $ = cheerio.load(html);
  const jobs = [];
  $('a[href*="jobListing.htm"]').each((i, el) => {
    const $el = $(el);
    const spanTexts = $el.find("span").map((i, s) => $(s).text().trim()).get()
      .filter(t => t && !/★/.test(t));
    const company = spanTexts[0] || "Unknown";

    const paragraphs = $el.find("p").map((i, p) => $(p).text().trim()).get()
      .filter(t => t && t !== "Easy Apply" && !/^\d+d$/.test(t));
    const title = paragraphs[0] || "";
    const location = paragraphs[1] || "";

    if (title) jobs.push({ title, company, location, link: $el.attr("href") || null, source: "Glassdoor" });
  });
  return jobs;
}

function parseJobbermanHtml(html) {
  const $ = cheerio.load(html);
  const jobs = [];
  $("a.title").each((i, el) => {
    const $el = $(el);
    const title = $el.text().trim();
    const $table = $el.closest("table");
    const company = $table.find(".business_name").first().text().replace(/\u00a0/g, "").trim();
    const location = $table.find(".listing_attribute").first().text().trim();
    if (title) jobs.push({ title, company, location, link: $el.attr("href") || null, source: "Jobberman" });
  });
  return jobs;
}

function parseMyJobMagHtml(html) {
  const $ = cheerio.load(html);
  const jobs = [];
  $('a[href*="myjobmag.com/job"]').each((i, el) => {
    const $el = $(el);
    const title = $el.text().trim();
    const link = $el.attr("href") ? $el.attr("href").split("?")[0] : null;
    const company = $el.next("span").text().trim();
    if (title && link) {
      jobs.push({ title, company: company || "Unknown", location: "", link, source: "MyJobMag" });
    }
  });
  return jobs;
}

function parseBySender(senderEmail, bodies) {
  const html = bodies.html;
  const plain = bodies.plain;
  if (senderEmail.includes(SOURCE_SENDERS.linkedin)) return parseLinkedInPlainText(plain);
  if (senderEmail.includes(SOURCE_SENDERS.indeed)) return parseIndeedPlainText(plain);
  if (senderEmail.includes(SOURCE_SENDERS.glassdoor)) return parseGlassdoorHtml(html);
  if (senderEmail.includes(SOURCE_SENDERS.jobberman)) return parseJobbermanHtml(html);
      if (senderEmail.includes(SOURCE_SENDERS.myjobmag)) return parseMyJobMagHtml(html);
  return [];
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

export async function fetchAndParseGmailAlerts() {
  if (!clientId) return [];

  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  const gmail = google.gmail({ version: "v1", auth });

  const processedLabelId = await ensureProcessedLabelId(gmail);

  const listRes = await gmail.users.messages.list({
    userId: "me",
    q: `label:"${SCAN_LABEL_NAME}" -label:"${processedLabel}"`,
    maxResults: 30
  });

  const messages = listRes.data.messages || [];
  const allJobs = [];

  for (const m of messages) {
    const msgRes = await gmail.users.messages.get({ userId: "me", id: m.id, format: "full" });
    const headers = msgRes.data.payload.headers || [];
    const fromHeaderObj = headers.find(h => h.name === "From");
    const fromHeader = fromHeaderObj ? fromHeaderObj.value : "";
    const dateHeaderObj = headers.find(h => h.name === "Date");
    const dateHeader = dateHeaderObj ? dateHeaderObj.value : null;

    const bodies = extractBodies(msgRes.data.payload);
    const parsedJobs = parseBySender(fromHeader, bodies).map(j => ({
      ...j,
      postedAt: dateHeader
    }));
    allJobs.push(...parsedJobs);

    await gmail.users.messages.modify({
      userId: "me",
      id: m.id,
      requestBody: { addLabelIds: [processedLabelId] }
    });
  }

  return allJobs;
}