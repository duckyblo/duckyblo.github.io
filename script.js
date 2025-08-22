// --- Game State ---
let jobs = [
  { id: 1, name: "Farmer", emoji: "🌾", goldPerRun: 10, duration: 2000, xp: 0, xpNeeded: 50, level: 1, running: false, progress: 0 },
  { id: 2, name: "Miner", emoji: "⛏️", goldPerRun: 25, duration: 4000, xp: 0, xpNeeded: 100, level: 1, running: false, progress: 0 },
  { id: 3, name: "Blacksmith", emoji: "⚒️", goldPerRun: 60, duration: 6000, xp: 0, xpNeeded: 200, level: 1, running: false, progress: 0 }
];

let gold = 0;
let lastTime = performance.now();

// --- DOM Elements ---
const jobsContainer = document.getElementById("jobs-container");
const goldDisplay = document.getElementById("gold");
const gpsDisplay = document.getElementById("gps");

// --- Load/Save ---
function loadGame() {
  const save = localStorage.getItem("dungeonIncrementalSave");
  if(save) {
    const data = JSON.parse(save);
    gold = data.gold || 0;
    data.jobs.forEach((savedJob, i) => Object.assign(jobs[i], savedJob));
  }
}
function saveGame() {
  localStorage.setItem("dungeonIncrementalSave", JSON.stringify({ gold, jobs }));
}
setInterval(saveGame, 10000);

loadGame();

// --- Render Jobs ---
function renderJobs() {
  jobsContainer.innerHTML = "";
  jobs.forEach(job => {
    const jobDiv = document.createElement("div");
    jobDiv.className = "job";

    jobDiv.innerHTML = `
      <div class="job-title"><span>${job.emoji}</span> ${job.name} (Lv ${job.level})</div>
      <div class="progress-container"><div id="progress-${job.id}" class="progress-fill" style="width:${job.progress*100}%"></div></div>
      <div class="xp-container"><div id="xp-${job.id}" class="xp-fill" style="width:${(job.xp/job.xpNeeded)*100}%"></div></div>
      <div class="tooltip">Gold: ${job.goldPerRun} | XP: ${job.xp}/${job.xpNeeded} | Duration: ${(job.duration/1000).toFixed(1)}s</div>
    `;

    jobDiv.addEventListener("click", () => toggleJob(job));
    jobsContainer.appendChild(jobDiv);
  });
}

// --- Toggle Job ---
function toggleJob(job) {
  job.running = !job.running;
}

// --- Popups ---
function showPopup(text) {
  const popup = document.createElement('div');
  popup.className = 'popup';
  popup.textContent = text;
  document.body.appendChild(popup);
  requestAnimationFrame(() => popup.classList.add('show'));
  setTimeout(() => {
    popup.classList.remove('show');
    setTimeout(() => popup.remove(), 500);
  }, 1500);
}

// --- Update Loop ---
function update(time) {
  const delta = time - lastTime;
  lastTime = time;

  let gps = 0;

  jobs.forEach(job => {
    if(job.running) {
      job.progress += delta / job.duration;
      if(job.progress >= 1) {
        job.progress = 0;
        gold += Math.round(job.goldPerRun);
        job.xp += 10;

        if(job.xp >= job.xpNeeded) {
          job.xp = 0;
          job.level++;
          job.goldPerRun = Math.round(job.goldPerRun * 1.1);
          job.xpNeeded = Math.round(job.xpNeeded * 1.2);
          showPopup(`${job.emoji} ${job.name} leveled up to ${job.level}!`);
        }

        showPopup(`+${Math.round(job.goldPerRun)} Gold`);
        updateXpBar(job);
      }

      const progressBar = document.getElementById(`progress-${job.id}`);
      if(progressBar) progressBar.style.width = `${job.progress*100}%`;

      gps += job.goldPerRun / (job.duration/1000);
    }

    // Update tooltip dynamically
    const jobDiv = document.getElementById(`progress-${job.id}`).parentElement.parentElement;
    const tooltip = jobDiv.querySelector('.tooltip');
    tooltip.textContent = `Gold: ${job.goldPerRun} | XP: ${job.xp}/${job.xpNeeded} | Duration: ${(job.duration/1000).toFixed(1)}s`;
  });

  goldDisplay.textContent = `Gold: ${Math.floor(gold)}`;
  gpsDisplay.textContent = `(+${gps.toFixed(1)}/s)`;

  requestAnimationFrame(update);
}

function updateXpBar(job) {
  const xpBar = document.getElementById(`xp-${job.id}`);
  if(xpBar) xpBar.style.width = `${(job.xp/job.xpNeeded)*100}%`;
}

renderJobs();
requestAnimationFrame(update);
