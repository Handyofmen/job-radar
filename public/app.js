const STORAGE_KEY = "jobRadarActions";

function loadActions() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveAction(jobId, status) {
  const actions = loadActions();
  actions[jobId] = status;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(actions));
}

function formatDate(iso) {
  if (!iso) return "date unknown";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function renderEntry(job, displayNumber, savedStatus) {
  const entry = document.createElement("article");
  entry.className = "entry";
  entry.dataset.id = job.id;
  if (savedStatus) entry.classList.add("actioned");

  entry.innerHTML = `
    <div class="entry-number">${String(displayNumber).padStart(2, "0")}</div>
    <div class="entry-body">
      <h2 class="entry-title"><a href="${job.link}" target="_blank" rel="noopener">${job.title}</a></h2>
      <div class="entry-meta">
        ${job.company} — ${job.location}
        <span class="entry-source">${job.source}</span>
        · posted ${formatDate(job.postedAt)}
      </div>
      <div class="entry-actions">
        <button class="apply" data-status="applied">Apply</button>
        <button class="saved" data-status="saved">Save</button>
        <button class="skip" data-status="skipped">Skip</button>
      </div>
    </div>
    <div class="stamp"></div>
  `;

  if (savedStatus) applyStampVisual(entry, savedStatus);

  entry.querySelectorAll(".entry-actions button").forEach(btn => {
    btn.addEventListener("click", () => {
      const status = btn.dataset.status;
      saveAction(job.id, status);
      entry.classList.add("actioned");
      applyStampVisual(entry, status);
    });
  });

  return entry;
}

function applyStampVisual(entry, status) {
  const stampMap = {
    applied: { text: "Applied", cls: "apply" },
    saved: { text: "Saved", cls: "saved" },
    skipped: { text: "Skipped", cls: "skip" }
  };
  const info = stampMap[status];
  if (!info) return;

  const stamp = entry.querySelector(".stamp");
  stamp.textContent = info.text;
  stamp.className = `stamp ${info.cls}`;

  entry.querySelectorAll(".entry-actions button").forEach(b => b.classList.remove("active"));
  const activeBtn = entry.querySelector(`button[data-status="${status}"]`);
  if (activeBtn) activeBtn.classList.add("active");
}

async function init() {
  const ledger = document.getElementById("ledger");
  const actions = loadActions();

  let data;
  try {
    const res = await fetch("../data/jobs.json");
    data = await res.json();
  } catch (err) {
    ledger.innerHTML = `<div class="empty-state">Could not load today's manifest. Run the fetch script first.</div>`;
    return;
  }

  document.getElementById("generatedAt").textContent =
    `Generated ${new Date(data.generatedAt).toLocaleString()}`;
  document.getElementById("entryCount").textContent = `${data.count} items`;

  const pending = data.jobs.filter(j => !actions[j.id]).length;
  document.getElementById("pendingCount").textContent = `${pending} pending review`;

  if (!data.jobs.length) {
    ledger.innerHTML = `<div class="empty-state">No matching roles today. Widen filters or check back tomorrow.</div>`;
    return;
  }

  data.jobs.forEach((job, index) => {
    ledger.appendChild(renderEntry(job, index + 1, actions[job.id]));
  });
}

init();
