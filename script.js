let jobs = [
    {id:1,name:"Beggar",emoji:"🪤",goldPerRun:5,duration:2000,xp:0,xpNeeded:30,level:1,running:false,progress:0,unlocked:true,route:"Commoner",unlockReq:null},
    {id:2,name:"Artisan",emoji:"🛠️",goldPerRun:15,duration:3000,xp:0,xpNeeded:60,level:1,running:false,progress:0,unlocked:false,route:"Commoner",unlockReq:{jobId:1,level:5}},
    {id:3,name:"Merchant",emoji:"💰",goldPerRun:40,duration:5000,xp:0,xpNeeded:100,level:1,running:false,progress:0,unlocked:false,route:"Commoner",unlockReq:{jobId:2,level:7}},
    {id:4,name:"Recruit",emoji:"🪖",goldPerRun:10,duration:2500,xp:0,xpNeeded:40,level:1,running:false,progress:0,unlocked:false,route:"Military",unlockReq:null},
    {id:5,name:"Soldier",emoji:"⚔️",goldPerRun:30,duration:4500,xp:0,xpNeeded:80,level:1,running:false,progress:0,unlocked:false,route:"Military",unlockReq:{jobId:4,level:5}},
    {id:6,name:"Knight",emoji:"🛡️",goldPerRun:70,duration:7000,xp:0,xpNeeded:150,level:1,running:false,progress:0,unlocked:false,route:"Military",unlockReq:{jobId:5,level:7}}
];

let gold = 0;
let lastTime = performance.now();
let activePopups = [];
const jobsContainer = document.getElementById("jobs-container");
const goldDisplay = document.getElementById("gold");
const gpsDisplay = document.getElementById("gps");

function loadGame(){
    const save = localStorage.getItem("dungeonIncrementalSave");
    if(save){
        const data = JSON.parse(save);
        gold = data.gold || 0;
        data.jobs.forEach((s,i) => Object.assign(jobs[i],s));
    }
}

function saveGame(){
    localStorage.setItem("dungeonIncrementalSave",JSON.stringify({gold,jobs}));
}

setInterval(saveGame,10000);
loadGame();

function renderJobs(){
    jobsContainer.innerHTML = "";
    const routes = ["Commoner","Military"];

    routes.forEach(route=>{
        const header = document.createElement("div");
        header.className = "route-header";
        header.textContent = route + " Jobs";
        jobsContainer.appendChild(header);

        const line = document.createElement("div");
        line.className = route==="Commoner"?"commoner-line":"military-line";
        jobsContainer.appendChild(line);

        jobs.filter(j=>j.route===route).forEach(job=>{
            if(job.unlockReq){
                const reqJob = jobs.find(jj=>jj.id===job.unlockReq.jobId);
                if(reqJob.level>=job.unlockReq.level) job.unlocked=true;
            }
            if(job.unlockReq && !jobs.find(jj=>jj.id===job.unlockReq.jobId).unlocked) return;
            if(route==="Military" && job.id===4) job.unlocked=false;

            const jobDiv = document.createElement("div");
            jobDiv.className = "job "+(job.unlocked?"unlocked":"locked");

            let progressBar = `<div class="progress-container"><div id="progress-${job.id}" class="progress-fill" style="width:${job.progress*100}%"></div></div>`;
            let xpBar = `<div class="xp-container"><div id="xp-${job.id}" class="xp-fill" style="width:${(job.xp/job.xpNeeded)*100}%"></div></div>`;
            let title = `<div class="job-title"><span>${job.unlocked?job.emoji:"❓"}</span> ${job.unlocked?job.name:"Locked"} (Lv ${job.level})</div>`;
            let tooltip = job.unlocked?`<div class="tooltip">Gold: ${job.goldPerRun} | XP: ${job.xp}/${job.xpNeeded} | Duration: ${(job.duration/1000).toFixed(1)}s</div>`:"";

            jobDiv.innerHTML = title + progressBar + xpBar + tooltip;
            if(job.unlocked) jobDiv.addEventListener("click",()=>toggleJob(job));
            jobsContainer.appendChild(jobDiv);
        });
    });
}

function toggleJob(job){
    job.running = !job.running;
}

function showPopup(text){
    const popup = document.createElement('div');
    popup.className='popup';
    popup.textContent = text;
    document.body.appendChild(popup);
    const offset = activePopups.length*70;
    popup.style.bottom = `${20+offset}px`;
    activePopups.push(popup);
    requestAnimationFrame(()=>popup.classList.add('show'));
    setTimeout(()=>{
        popup.classList.remove('show');
        setTimeout(()=>{
            popup.remove();
            activePopups = activePopups.filter(p=>p!==popup);
            activePopups.forEach((p,i)=>p.style.bottom = `${20+i*70}px`);
        },500);
    },1500);
}

function update(time){
    const delta = time - lastTime;
    lastTime = time;
    let gps = 0;

    jobs.forEach(job=>{
        if(job.running){
            job.progress += delta/job.duration;
            if(job.progress>=1){
                job.progress=0;
                gold+=Math.round(job.goldPerRun);
                job.xp+=10;
                if(job.xp>=job.xpNeeded){
                    job.xp=0;
                    job.level++;
                    job.goldPerRun = Math.round(job.goldPerRun*1.1);
                    job.xpNeeded = Math.round(job.xpNeeded*1.2);
                    showPopup(`${job.emoji} ${job.name} leveled up to ${job.level}!`);
                }
                showPopup(`+${Math.round(job.goldPerRun)} Gold`);
                updateXpBar(job);
            }
            const progressBar = document.getElementById(`progress-${job.id}`);
            if(progressBar) progressBar.style.width = `${job.progress*100}%`;
            gps += job.goldPerRun/(job.duration/1000);
        }

        const jobDiv = document.getElementById(`progress-${job.id}`).parentElement.parentElement;
        const tooltip = jobDiv.querySelector('.tooltip');
        if(tooltip) tooltip.textContent = `Gold: ${job.goldPerRun} | XP: ${job.xp}/${job.xpNeeded} | Duration: ${(job.duration/1000).toFixed(1)}s`;
        const titleEl = jobDiv.querySelector('.job-title');
        titleEl.innerHTML=`<span>${job.unlocked?job.emoji:"❓"}</span> ${job.unlocked?job.name:"Locked"} (Lv ${job.level})`;
    });

    goldDisplay.textContent = `Gold: ${Math.floor(gold)}`;
    gpsDisplay.textContent = `(+${gps.toFixed(1)}/s)`;
    requestAnimationFrame(update);
}

function updateXpBar(job){
    const xpBar = document.getElementById(`xp-${job.id}`);
    if(xpBar) xpBar.style.width = `${(job.xp/job.xpNeeded)*100}%`;
}

renderJobs();
requestAnimationFrame(update);
