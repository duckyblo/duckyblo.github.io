// Nightforge — Full feature file integrating cooldowns, equip, tooltips, inventory lock, poison immediate tick, swap flow
// Persistent via localStorage. Built on top of the large UI.

// ----- NOTE -----
// Workshop tab is hidden by default and only shown when a Swap is initiated.
// You cannot assign the same move to more than one slot. Attempting to do so logs an error.

// ///// Utilities /////
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const rand = (a,b) => Math.floor(Math.random() * (b - a + 1)) + a;
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));

// ----- Core Data -----
const BASE_MOVES = [
  { id: 'strike', name: 'Strike', emoji: '🗡️', type: 'physical', baseDamage: 6, req: { str: 0 }, cost: { gold: 0, sp: 0 }, desc: 'A basic melee strike.', cooldown: 0 },
  { id: 'bash', name: 'Bash', emoji: '🔨', type: 'physical', baseDamage: 10, req: { str: 4 }, cost: { gold: 50, sp: 0 }, desc: 'Heavy blow — powerful if STR is high.', cooldown: 2 },
  { id: 'spark', name: 'Spark', emoji: '✨', type: 'magic', baseDamage: 5, req: { mag: 0 }, cost: { gold: 0, sp: 0 }, desc: 'Small magic bolt.', cooldown: 0 },
  { id: 'fireball', name: 'Fireball', emoji: '🔥', type: 'magic', baseDamage: 12, req: { mag: 5 }, cost: { gold: 120, sp: 1 }, desc: 'Explosive magic — needs MAG.', effect: { id:'burn', name:'Burn', dot:4, duration:3 }, cooldown: 3 },
  { id: 'heal', name: 'Heal', emoji: '🩺', type: 'utility', baseDamage: -12, req: { mag: 3 }, cost: { gold: 80, sp: 1 }, desc: 'Restore some HP (magic scaled).', cooldown: 2 },
  { id: 'poison_dagger', name: 'Poison Dagger', emoji: '🗡️☠️', type: 'physical', baseDamage: 5, req: { str: 2 }, cost: { gold: 40, sp: 0 }, desc: 'Apply poison DoT over time.', effect: { id:'poison', name:'Poison', dot:3, duration:4 }, cooldown: 2 },
  { id: 'weaken_strike', name: 'Weaken Strike', emoji: '🔻', type: 'physical', baseDamage: 7, req: { str:0 }, cost:{gold:0,sp:0}, desc:'Deals damage and reduces enemy damage for a few turns.', effect: { id:'weaken', name:'Weaken', mod: { enemyAtkMultiplier: 0.85 }, duration:3 }, cooldown: 3 }
];

const SHOP_ITEMS = [
  { id: 'potion', name: 'Potion', emoji: '🧪', type: 'consumable', desc: 'Heals 20 HP', value: 25, equip: false },
  { id: 'small-sword', name: 'Short Sword', emoji: '⚔️', type: 'weapon', desc: 'STR +2', value: 120, attrs: { str: 2 }, equip: true },
  { id: 'mantle', name: 'Arcane Mantle', emoji: '🧥', type: 'armor', desc: 'MAG +2', value: 120, attrs: { mag: 2 }, equip: true },
  { id: 'ring', name: 'Ring of Guard', emoji: '💍', type: 'accessory', desc: 'VIT +1', value: 90, attrs: { vit: 1 }, equip: true },
  { id: 'gem', name: 'Skill Gem', emoji: '🔹', type: 'material', desc: 'Used to learn rare moves', value: 300, equip: false }
];

const ENEMIES_BY_DUNGEON = {
  forest: [
    { id: 'wolf', name: 'Timber Wolf', emoji: '🐺', hp: 9, atk: 3, xp: 7, goldMin: 3, goldMax: 7, loot: ['potion'] },
    { id: 'goblin', name: 'Goblin', emoji: '🧌', hp: 15, atk: 4, xp: 10, goldMin: 4, goldMax: 10, loot: ['potion'] },
    { id: 'bandit', name: 'Bandit', emoji: '🪓', hp: 20, atk: 6, xp: 14, goldMin: 6, goldMax: 12, loot: ['potion'] }
  ],
  nightforge: [
    { id: 'lavamonster', name: 'Lava Monster', emoji: '👺', hp: 22, atk: 7, xp: 18, goldMin: 8, goldMax: 16, loot: ['potion'] },
    { id: 'sorcerer', name: 'Feral Sorcerer', emoji: '🧙‍♂️', hp: 28, atk: 8, xp: 28, goldMin: 12, goldMax: 28, loot: ['gem'] }
  ]
};

const DEFAULT_PLAYER = {
  level:1, xp:0, xpToLevel:100,
  gold: 50, skillpoints:0,
  stats: { mag:0, str:0, vit:0 },
  unallocated: 0,
  maxHP: 20, hp: 20,
  movesOwned: ['strike','spark'],
  moveSlots: [ 'strike', 'spark', null, null ],
  inventory: { potion:2 },
  equipment: { weapon: null, armor: null, accessory: null },
  selectedDungeon: 'forest',
  moveCooldowns: {} // keyed by slot index -> remaining turns
};

let state = loadState();
let currentEnemy = null;
let inCombat = false;
let pendingSwapSlot = null;
let returnTabAfterSwap = null;

///// Persistence /////
function loadState(){
  try{
    const raw = localStorage.getItem('nightforge_save');
    if(raw) return JSON.parse(raw);
  }catch(e){}
  return JSON.parse(JSON.stringify(DEFAULT_PLAYER));
}
function saveState(){
  localStorage.setItem('nightforge_save', JSON.stringify(state));
}

///// Combat & Stats /////
function computeMaxHP(){
  let base = 20 + (state.stats.vit * 4);
  // equipment bonus
  const equip = state.equipment;
  if(equip && equip.armor){
    const item = SHOP_ITEMS.find(i => i.id === equip.armor);
    if(item && item.attrs && item.attrs.vit) base += (item.attrs.vit * 4);
  }
  return base;
}
function playerAttackDamage(move){
  if(!move) return 0;
  let base = move.baseDamage;
  // equipment weapon bonus
  const weapon = state.equipment && state.equipment.weapon ? SHOP_ITEMS.find(i => i.id === state.equipment.weapon) : null;
  let weaponStr = 0;
  if(weapon && weapon.attrs && weapon.attrs.str) weaponStr = weapon.attrs.str;
  if(move.type === 'physical'){
    const bonus = Math.floor((state.stats.str + weaponStr) * 1.4);
    return Math.max(0, base + bonus);
  } else if(move.type === 'magic'){
    const bonus = Math.floor(state.stats.mag * 1.6);
    return Math.max(0, base + bonus);
  } else if(move.type === 'utility'){
    return base; // negative for heal
  }
  return base;
}
function enemyDamageToPlayer(enemy){
  let atk = enemy.atk;
  // enemy status modifiers
  if(enemy.status && enemy.status.length){
    enemy.status.forEach(s=>{
      if(s.mod && s.mod.enemyAtkMultiplier) atk = Math.floor(atk * s.mod.enemyAtkMultiplier);
    });
  }
  const def = Math.floor((state.stats.vit + (state.equipment && state.equipment.armor ? (SHOP_ITEMS.find(i=>i.id===state.equipment.armor).attrs?.vit||0) : 0)) * 0.5);
  return Math.max(1, atk - def);
}
function gainXP(amount){
  state.xp += amount;
  log(`Gained ${amount} XP.`, 'good');
  while(state.xp >= state.xpToLevel){
    state.xp -= state.xpToLevel;
    state.level++;
    state.unallocated += 3;
    state.skillpoints += 1;
    state.xpToLevel = Math.floor(state.xpToLevel * 1.25);
    log(`Leveled up! Now level ${state.level}. +3 stat points, +1 skillpoint.`, 'good');
    state.maxHP = computeMaxHP();
    state.hp = state.maxHP;
  }
}

///// Logging /////
function log(text, type){
  const c = $('#combatLog');
  const el = document.createElement('div');
  el.className = 'log-line' + (type? ` ${type}`: '');
  el.innerText = text;
  c.appendChild(el);
  c.scrollTop = c.scrollHeight;
}

///// UI helpers /////
// Hide workshop tab by default. We'll show it only during swap flow.
function hideWorkshopTab(){
  const wsTab = document.querySelector('.tab[data-tab="workshop"]');
  if(wsTab) wsTab.style.display = 'none';
}
function showWorkshopTab(){
  const wsTab = document.querySelector('.tab[data-tab="workshop"]');
  if(wsTab) wsTab.style.display = '';
}

// setActiveTab now blocks opening workshop directly unless swap flow active
function setActiveTab(id){
  // block opening workshop unless we are in swap flow (pendingSwapSlot != null)
  if(id === 'workshop' && pendingSwapSlot === null){
    log('Workshop is only accessible when swapping a move (click a slot -> Swap).', 'bad');
    return;
  }
  $$('.tab').forEach(b=>b.classList.toggle('active', b.dataset.tab===id));
  $$('.panel').forEach(p=>p.classList.toggle('active', p.id === `tab-${id}`));
}
// wire tab clicks
$$('.tab').forEach(b => b.addEventListener('click', () => {
  // block entering inventory while in combat
  if(inCombat && b.dataset.tab === 'inventory'){
    log('Cannot open Inventory during combat.', 'bad');
    return;
  }
  // block direct workshop open
  if(b.dataset.tab === 'workshop' && pendingSwapSlot === null){
    log('Workshop is only accessible when swapping a move (click a slot -> Swap).', 'bad');
    return;
  }
  setActiveTab(b.dataset.tab);
}));

///// Inventory rendering & equip /////
function renderInventory(){
  const grid = $('#inventoryGrid');
  grid.innerHTML = '';
  const keys = Object.keys(state.inventory);
  for(let i=0;i<36;i++){
    const slot = document.createElement('div');
    slot.className = 'inv-item';
    if(i < keys.length){
      const id = keys[i];
      const item = SHOP_ITEMS.find(s => s.id === id) || { name:id, emoji:'❓', desc:'Unknown', value:0 };
      slot.innerHTML = `<span class="emoji">${item.emoji || '❓'}</span><b>${item.name}</b><div class="muted">x${state.inventory[id]}</div>`;
      slot.addEventListener('click', ()=> showItemDetail(id));
    } else {
      slot.innerHTML = `<div style="color:var(--muted)">—</div>`;
    }
    grid.appendChild(slot);
  }
  showItemDetail(null);
  renderEquips();
}

function showItemDetail(id){
  const detail = $('#itemDetail');
  if(!id){
    $('#detailName').innerText = "No item selected";
    $('#detailDesc').innerText = "Pick an item from the grid.";
    $('#detailStats').innerHTML = '';
    $('#detailBuy').innerText = '—';
    $('#detailSell').innerText = '—';
    $('#sellOne').disabled = true;
    $('#useItem').disabled = true;
    $('#equipItem').disabled = true;
    return;
  }
  const shopItem = SHOP_ITEMS.find(s => s.id === id) || { name:id, emoji:'❓', desc:'Unknown', value:0 };
  $('#detailName').innerText = `${shopItem.emoji || ''} ${shopItem.name}`;
  $('#detailDesc').innerText = shopItem.desc || '';
  const ul = $('#detailStats'); ul.innerHTML='';
  if(shopItem.attrs){
    for(const k in shopItem.attrs){
      const li = document.createElement('li'); li.innerText = `${k.toUpperCase()}: ${shopItem.attrs[k]}`; ul.appendChild(li);
    }
  }
  $('#detailBuy').innerText = `${shopItem.value}💰`;
  $('#detailSell').innerText = `${Math.floor(shopItem.value * 0.6)}💰`;
  $('#sellOne').disabled = !(state.inventory[id] > 0) || inCombat;
  $('#useItem').disabled = !(state.inventory[id] > 0 && shopItem.type === 'consumable') || inCombat;
  $('#equipItem').disabled = !(state.inventory[id] > 0 && shopItem.equip) || inCombat;

  $('#sellOne').onclick = ()=> {
    if(inCombat){ log('Cannot sell items during combat.', 'bad'); return; }
    if(state.inventory[id] > 0){
      state.inventory[id]--;
      state.gold += Math.floor(shopItem.value * 0.6);
      if(state.inventory[id] === 0) delete state.inventory[id];
      log(`Sold 1 ${shopItem.name} for ${Math.floor(shopItem.value * 0.6)} gold.`);
      saveState();
      renderAll();
    }
  };
  $('#useItem').onclick = ()=> {
    if(inCombat){ log('Cannot use items from inventory during combat. Use move or automatic items allowed.', 'bad'); return; }
    if(shopItem.id === 'potion' && state.inventory[id] > 0){
      state.hp = clamp(state.hp + 20, 0, state.maxHP);
      state.inventory[id]--;
      if(state.inventory[id] === 0) delete state.inventory[id];
      log('You drank a Potion. Restored 20 HP.', 'good');
      saveState(); renderAll();
    }
  };
  $('#equipItem').onclick = ()=> {
    if(inCombat){ log('Cannot equip during combat.', 'bad'); return; }
    // equip logic: set equipment slot and remove from inventory count
    const type = shopItem.type; // 'weapon'|'armor'|'accessory'
    if(!['weapon','armor','accessory'].includes(type)){ log('Cannot equip this item.', 'bad'); return; }
    // unequip existing if any: return to inventory
    const prev = state.equipment[type];
    if(prev){
      state.inventory[prev] = (state.inventory[prev]||0) + 1;
      log(`Unequipped ${prev} and returned to inventory.`);
    }
    // remove one from inventory and equip
    state.inventory[id]--;
    if(state.inventory[id] === 0) delete state.inventory[id];
    state.equipment[type] = id;
    // recalc HP if armor changed
    state.maxHP = computeMaxHP();
    state.hp = clamp(state.hp, 0, state.maxHP);
    log(`Equipped ${shopItem.name} to ${type}.`);
    saveState(); renderAll();
  };
}

function renderEquips(){
  $('#eq-weapon-name').innerText = (state.equipment.weapon ? (SHOP_ITEMS.find(i=>i.id===state.equipment.weapon)?.name || '—') : 'None');
  $('#eq-armor-name').innerText = (state.equipment.armor ? (SHOP_ITEMS.find(i=>i.id===state.equipment.armor)?.name || '—') : 'None');
  $('#eq-accessory-name').innerText = (state.equipment.accessory ? (SHOP_ITEMS.find(i=>i.id===state.equipment.accessory)?.name || '—') : 'None');
  // mini in sidebar
  $('#mini-eq-weapon').innerText = state.equipment.weapon ? (SHOP_ITEMS.find(i=>i.id===state.equipment.weapon).emoji || 'W') : '—';
  $('#mini-eq-armor').innerText = state.equipment.armor ? (SHOP_ITEMS.find(i=>i.id===state.equipment.armor).emoji || 'A') : '—';
  $('#mini-eq-accessory').innerText = state.equipment.accessory ? (SHOP_ITEMS.find(i=>i.id===state.equipment.accessory).emoji || 'X') : '—';
}

///// Shop /////
function renderShop(){
  const container = $('#shopList');
  container.innerHTML = '';
  SHOP_ITEMS.forEach(item=>{
    const card = document.createElement('div'); card.className='shop-card';
    card.innerHTML = `<div style="font-size:20px">${item.emoji} <b>${item.name}</b></div>
      <div class="muted">${item.desc}</div>
      <div style="margin-top:8px">Price: <b>${item.value}💰</b> • Sell: <b>${Math.floor(item.value*0.6)}💰</b></div>`;
    const buy = document.createElement('button'); buy.className='btn'; buy.innerText='Buy';
    buy.onclick = ()=>{
      if(state.gold >= item.value){
        state.gold -= item.value;
        state.inventory[item.id] = (state.inventory[item.id]||0) + 1;
        log(`Bought ${item.name}.`);
        saveState(); renderAll();
      } else {
        log('Not enough gold.', 'bad');
      }
    };
    card.appendChild(buy);
    container.appendChild(card);
  });
}

///// Workshop & Swap flow /////
// Only show the workshop when swapping. Prevent duplicate move assignment across slots.
function renderMoveCatalog(){
  const container = $('#moveCatalog');
  container.innerHTML = '';
  BASE_MOVES.forEach(m=>{
    const owned = state.movesOwned.includes(m.id);
    const card = document.createElement('div'); card.className='shop-card move-card';
    card.innerHTML = `<div style="font-size:18px">${m.emoji} <b>${m.name}</b></div>
      <div class="muted">${m.desc}</div>
      <div class="req">Requires: MAG ${m.req.mag||0}, STR ${m.req.str||0}</div>
      <div style="margin-top:8px">Cost: ${m.cost.gold || 0}💰 ${m.cost.sp ? '• ' + m.cost.sp + ' SP' : ''} • CD: ${m.cooldown || 0}</div>`;
    const btn = document.createElement('button');
    if(owned){
      btn.className='btn subtle'; btn.innerText='Owned';
    } else {
      btn.className='btn'; btn.innerText='Acquire';
      btn.onclick = ()=>{
        if((m.req.mag||0) > state.stats.mag || (m.req.str||0) > state.stats.str){
          log('Stats do not meet move requirements.', 'bad'); return;
        }
        if(m.cost.sp && state.skillpoints < m.cost.sp){
          log('Not enough skillpoints.', 'bad'); return;
        }
        if(m.cost.gold && state.gold < m.cost.gold){
          log('Not enough gold.', 'bad'); return;
        }
        state.movesOwned.push(m.id);
        if(m.cost.sp) state.skillpoints -= m.cost.sp;
        if(m.cost.gold) state.gold -= m.cost.gold;
        log(`Learned move: ${m.name} ⭐`, 'good');
        saveState(); renderAll();
      };
    }
    card.appendChild(btn);

    const assign = document.createElement('button'); assign.className='btn small'; assign.style.marginLeft='8px';
    assign.innerText = 'Assign';
    assign.onclick = ()=> {
      if(!state.movesOwned.includes(m.id)){ log('You must acquire this move first.', 'bad'); return; }

      // Prevent equipping the same move into multiple slots
      const alreadyInDifferentSlot = state.moveSlots.some((slotMoveId, idx) => slotMoveId === m.id && idx !== pendingSwapSlot);
      if(alreadyInDifferentSlot){
        log('Cannot assign the same move to multiple slots.', 'bad');
        return;
      }

      if(pendingSwapSlot !== null){
        // assign to that slot
        state.moveSlots[pendingSwapSlot] = m.id;
        // set cooldown 0 for the slot when assigned
        state.moveCooldowns[pendingSwapSlot] = 0;
        log(`Assigned ${m.name} to slot ${pendingSwapSlot+1}`);
        const returnTab = returnTabAfterSwap || 'dungeon';
        pendingSwapSlot = null; returnTabAfterSwap = null;
        // hide workshop tab again now that swap is complete
        hideWorkshopTab();
        saveState(); renderAll();
        setActiveTab(returnTab);
        return;
      }
      // Standard assign (only if not duplicate)
      const firstEmpty = state.moveSlots.findIndex(s=>!s);
      if(firstEmpty !== -1){
        state.moveSlots[firstEmpty] = m.id;
        state.moveCooldowns[firstEmpty] = 0;
        log(`Assigned ${m.name} to slot ${firstEmpty+1}`);
      } else {
        // if no empty, prevent duplicate replacement when already present elsewhere
        if(state.moveSlots.includes(m.id)){
          log('Move already in a slot; cannot assign duplicate.', 'bad');
        } else {
          state.moveSlots[0] = m.id;
          state.moveCooldowns[0] = 0;
          log(`Assigned ${m.name} to slot 1 (replaced).`);
        }
      }
      saveState(); renderAll();
    };
    card.appendChild(assign);

    container.appendChild(card);
  });
}

///// Enemy spawn, statuses, combat flow /////
function spawnEnemy(){
  const dungeon = state.selectedDungeon || 'forest';
  const pool = ENEMIES_BY_DUNGEON[dungeon] || ENEMIES_BY_DUNGEON['forest'];
  const template = pool[rand(0, pool.length-1)];
  currentEnemy = {
    ...template,
    hp: template.hp + rand(0,6),
    status: []
  };
  inCombat = true;
  $('#enemyBox').style.display = '';
  $('#enemyName').innerText = currentEnemy.name;
  $('#enemyAvatar').innerText = currentEnemy.emoji;
  $('#enemyHP').innerText = currentEnemy.hp;
  $('#enemyStatusLine').innerHTML = '';
  // show a small note if workshop was visible (shouldn't be) — re-hide to be safe
  hideWorkshopTab();
  log(`A wild ${currentEnemy.name} appears!`, 'muted');
  renderAll();
}

function applyStatusDotEffects(entity){
  if(!entity || !entity.status) return;
  for(const s of entity.status){
    if(s.dot && s.turns > 0){
      // if sourceType === 'magic' then increase DoT by player's mag
      let dot = s.dot;
      if(s.sourceType === 'magic'){
        dot += Math.floor(state.stats.mag * 0.5);
      }
      // poison should ignore armor; already modeled as flat subtract
      entity.hp = Math.max(0, entity.hp - dot);
      log(`${s.name} deals ${dot} damage to ${entity.name || 'enemy'}.`);
      s.turns--;
    }
    if(s.id === 'regen' && s.turns > 0){
      const heal = s.heal || 4;
      entity.hp = Math.min(entity.maxHP || 99999, (entity.hp || 0) + heal);
      log(`${s.name} heals ${heal} HP.`);
      s.turns--;
    }
  }
  entity.status = entity.status.filter(s=>s.turns > 0);
}

function useMoveSlot(slotIndex){
  if(!inCombat){
    log('No enemy to attack.', 'muted'); return;
  }
  // cooldown check
  const cd = state.moveCooldowns[slotIndex] || 0;
  if(cd > 0){
    log('Move is on cooldown.', 'bad'); return;
  }

  const moveId = state.moveSlots[slotIndex];
  if(!moveId){
    log('Empty move slot.', 'muted'); return;
  }
  const move = BASE_MOVES.find(m=>m.id===moveId);
  if(!move){
    log('Unknown move.', 'bad'); return;
  }
  if((move.req.mag||0) > state.stats.mag || (move.req.str||0) > state.stats.str){
    log('You lack the stats to use that move.', 'bad'); return;
  }

  // perform action
  if(move.type === 'utility' && move.baseDamage < 0){
    const heal = Math.abs(Math.floor(move.baseDamage + state.stats.mag * 1.5));
    state.hp = clamp(state.hp + heal, 0, state.maxHP);
    log(`${move.emoji} ${move.name} — Healed ${heal} HP.`);
  } else {
    const dmg = playerAttackDamage(move);
    currentEnemy.hp = Math.max(0, currentEnemy.hp - dmg);
    log(`${move.emoji} ${move.name} — Dealt ${dmg} damage to ${currentEnemy.name}.`);
    // apply effect and immediate tick for poison
    if(move.effect){
      const eff = Object.assign({}, move.effect);
      eff.turns = eff.duration;
      eff.sourceType = move.type;
      currentEnemy.status.push(eff);
      log(`${eff.name} applied to ${currentEnemy.name}!`);
      // Immediate tick if poison-like
      if(eff.dot){
        // immediate application (as requested)
        let dotNow = eff.dot;
        if(eff.sourceType === 'magic') dotNow += Math.floor(state.stats.mag * 0.5);
        currentEnemy.hp = Math.max(0, currentEnemy.hp - dotNow);
        log(`${eff.name} immediately deals ${dotNow} damage.`);
        eff.turns = Math.max(0, eff.turns - 1); // one tick consumed immediately
      }
    }
  }

  // set cooldown for slot
  if(move.cooldown && move.cooldown > 0){
    state.moveCooldowns[slotIndex] = move.cooldown;
  } else {
    state.moveCooldowns[slotIndex] = 0;
  }

  // check kill
  if(currentEnemy.hp <= 0){
    endCombat(true);
    return;
  }

  // Apply status DoTs after player's action (remaining ticks)
  applyStatusDotEffects(currentEnemy);
  if(currentEnemy.hp <= 0){
    endCombat(true);
    return;
  }

  // enemy attacks
  const edmg = enemyDamageToPlayer(currentEnemy);
  state.hp = Math.max(0, state.hp - edmg);
  log(`${currentEnemy.emoji} ${currentEnemy.name} hits you for ${edmg} damage.`, state.hp===0 ? 'bad' : undefined);
  if(state.hp <= 0){
    log('You were defeated... Respawning at full HP with some gold lost.', 'bad');
    const lost = Math.floor(state.gold * 0.12);
    state.gold = Math.max(0, state.gold - lost);
    state.hp = state.maxHP;
    inCombat = false;
    currentEnemy = null;
    $('#enemyBox').style.display = 'none';
  }

  // decrement cooldowns at end of full round (we'll decrement after enemy action)
  decrementCooldowns();

  saveState();
  renderAll();
}

function decrementCooldowns(){
  for(const k in state.moveCooldowns){
    if(state.moveCooldowns.hasOwnProperty(k)){
      state.moveCooldowns[k] = Math.max(0, state.moveCooldowns[k] - 1);
    }
  }
}

function endCombat(victory){
  if(!currentEnemy) return;
  if(victory){
    const gold = rand(currentEnemy.goldMin, currentEnemy.goldMax);
    state.gold += gold;
    gainXP(currentEnemy.xp);
    const drop = currentEnemy.loot[rand(0, currentEnemy.loot.length-1)];
    if(drop){
      state.inventory[drop] = (state.inventory[drop]||0) + 1;
      log(`Dropped: ${drop} x1`);
    }
    log(`You defeated ${currentEnemy.name}. +${gold} gold.`, 'good');
  } else {
    log(`${currentEnemy.name} escaped...`, 'muted');
  }
  currentEnemy = null;
  inCombat = false;
  $('#enemyBox').style.display = 'none';
  state.maxHP = computeMaxHP();
  state.hp = clamp(state.hp, 0, state.maxHP);
  // hide workshop if it was left visible for some reason
  hideWorkshopTab();
  saveState(); renderAll();
}

///// Render functions /////
function renderMoves(){
  for(let i=0;i<4;i++){
    const mid = state.moveSlots[i];
    const elName = $(`#moveName${i}`);
    const elDesc = $(`#moveDesc${i}`);
    const cdOverlay = document.querySelector(`.cd-overlay[data-slot="${i}"]`);
    const cdNum = cdOverlay ? cdOverlay.querySelector('.cd-num') : null;
    const cdVal = state.moveCooldowns[i] || 0;
    if(mid){
      const m = BASE_MOVES.find(x=>x.id===mid) || { name:mid, desc:'', emoji:'❓', cooldown:0 };
      elName.innerText = `${m.emoji || ''} ${m.name}`;
      elDesc.innerText = m.desc + (m.effect ? ` • ${m.effect.name}` : '');
      if(cdVal > 0){
        cdOverlay.style.display = 'flex';
        cdNum.innerText = cdVal;
      } else {
        cdOverlay.style.display = 'none';
      }
    } else {
      elName.innerText = '—';
      elDesc.innerText = 'Empty';
      if(cdOverlay) cdOverlay.style.display = 'none';
    }
  }
}

function renderHUD(){
  $('#player-level').innerText = state.level;
  $('#player-hp').innerText = state.hp;
  $('#player-maxhp').innerText = state.maxHP;
  $('#player-sp').innerText = state.skillpoints;
  $('#player-xp').innerText = `${state.xp}/${state.xpToLevel}`;
  $('#gold').innerText = state.gold;
  $('#hud-player-hp').innerText = `${state.hp}/${state.maxHP}`;
  $('#hud-str').innerText = state.stats.str;
  $('#hud-mag').innerText = state.stats.mag;
  $('#hud-vit').innerText = state.stats.vit;
  $('#enemyHP').innerText = currentEnemy ? currentEnemy.hp : '-';
  $('#unallocated').innerText = state.unallocated;
  $('#stat-mag').innerText = state.stats.mag;
  $('#stat-str').innerText = state.stats.str;
  $('#stat-vit').innerText = state.stats.vit;
  $('#player-level').innerText = state.level;
  $('#player-xp').innerText = `${state.xp}/${state.xpToLevel}`;
  $('#selectedDungeonLabel').innerText = state.selectedDungeon === 'forest' ? 'Forest Ruins' : 'Nightforge';
}

function renderEnemyStatusLine(){
  const container = $('#enemyStatusLine');
  container.innerHTML = '';
  if(!currentEnemy || !currentEnemy.status) return;
  currentEnemy.status.forEach((s, idx)=>{
    const badge = document.createElement('div');
    badge.className = `status-badge status-${s.id}`;
    badge.dataset.idx = idx;
    badge.innerText = `${s.name} (${s.turns})`;
    badge.addEventListener('mouseenter', (ev)=>{
      showStatusTooltip(s, ev.target);
    });
    badge.addEventListener('mouseleave', ()=> hideStatusTooltip());
    container.appendChild(badge);
  });
}

// Regeneration system
function startRegen(player, options = {}) {
    const {
        mode = "slow",       // "slow" for gradual regen, "full" for instant heal after fights
        interval = 2000,     // how often to regen in ms (2s default)
        amount = 2,          // how much HP to regen per tick
        combatCheck = () => inCombat // function to check if player is in combat
    } = options;

    if (mode === "full") {
        // Full heal (e.g., after a fight)
        player.hp = player.maxHP;
        renderAll();
        return;
    }

    // Slow regen loop
    if (!player.regenInterval) {
        player.regenInterval = setInterval(() => {
            // Only regen if not in combat and not already full HP
            if (!combatCheck() && player.hp < player.maxHP) {
                player.hp = Math.min(player.hp + amount, player.maxHP);
                renderAll();
            }
        }, interval);
    }
}

// Call this when you want to stop regen (optional, e.g., game pauses)
function stopRegen(player) {
    if (player.regenInterval) {
        clearInterval(player.regenInterval);
        player.regenInterval = null;
    }
}

function statusTooltipText(s){
  if(s.id === 'burn'){
    return `<b>${s.name}</b><br/>Deals ${s.dot}+MAG-based DoT for ${s.duration} turns. Magic increases burn potency.`;
  } else if(s.id === 'poison'){
    return `<b>${s.name}</b><br/>Deals ${s.dot} DoT for ${s.duration} turns. Ignores armor.`;
  } else if(s.id === 'weaken'){
    return `<b>${s.name}</b><br/>Reduces enemy damage by ${(1 - s.mod.enemyAtkMultiplier) * 100}% for ${s.duration} turns.`;
  } else if(s.id === 'regen'){
    return `<b>${s.name}</b><br/>Heals the target a bit each turn for ${s.duration} turns.`;
  }
  return `<b>${s.name}</b><br/>Effect for ${s.duration} turns.`;
}

function showStatusTooltip(status, targetEl){
  const tip = $('#statusTooltip');
  tip.innerHTML = statusTooltipText(status);
  tip.style.display = 'block';
  // position near target but clamp to viewport
  const rect = targetEl.getBoundingClientRect();
  const tipRectW = 300; // approx max width
  let left = rect.right + 10;
  let top = rect.top;
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  // if overflow right, put to left
  if(left + tipRectW > viewportW) left = rect.left - tipRectW - 10;
  // clamp top/bottom
  if(top + 120 > viewportH) top = viewportH - 140;
  if(top < 8) top = 8;
  tip.style.left = left + 'px';
  tip.style.top = top + 'px';
}

function hideStatusTooltip(){
  const tip = $('#statusTooltip');
  tip.style.display = 'none';
}

function renderAll(){
  state.maxHP = computeMaxHP();
  state.hp = clamp(state.hp, 0, state.maxHP);
  saveState();
  renderHUD();
  renderMoves();
  renderInventory();
  renderShop();
  renderMoveCatalog();
  renderEnemyStatusLine();

  // bind move use buttons
  $$('.use-move').forEach(btn=>{
    btn.onclick = ()=> useMoveSlot(parseInt(btn.dataset.slot));
  });
  // bind swap buttons (initiate swap flow)
  $$('.swap-move').forEach(btn=>{
    btn.onclick = ()=> {
      pendingSwapSlot = parseInt(btn.dataset.slot);
      const activeTabBtn = document.querySelector('.tab.active');
      returnTabAfterSwap = (activeTabBtn && activeTabBtn.dataset.tab) || 'dungeon';
      // show the workshop tab temporarily and open it
      showWorkshopTab();
      setActiveTab('workshop');
      log(`Swapping slot ${pendingSwapSlot + 1} — choose a move in Workshop to assign.`, 'muted');
    };
  });

  // disable inventory tab if in combat
  const invTab = document.querySelector('.tab[data-tab="inventory"]');
  if(inCombat){
    invTab.classList.add('disabled');
    invTab.title = "Cannot open inventory during combat";
  } else {
    invTab.classList.remove('disabled');
    invTab.title = "";
  }
}

///// Stats allocation & reset /////
$$('.plus').forEach(b=>{
  b.addEventListener('click', ()=> {
    const stat = b.dataset.stat;
    if(state.unallocated <= 0){ log('No unallocated points.', 'bad'); return; }
    state.stats[stat] += 1;
    state.unallocated -= 1;
    state.maxHP = computeMaxHP();
    state.hp = clamp(state.hp, 0, state.maxHP);
    saveState(); renderAll();
  });
});

$('#resetStatsBtn').addEventListener('click', ()=>{
  const totalAllocated = state.stats.mag + state.stats.str + state.stats.vit;
  state.unallocated += totalAllocated;
  state.stats = { mag:0, str:0, vit:0 };
  state.moveSlots = [null,null,null,null];
  state.moveCooldowns = {};
  state.equipment = { weapon: null, armor: null, accessory: null };
  state.maxHP = computeMaxHP();
  state.hp = state.maxHP;
  log('Free reset complete. All stat points and move slots cleared.');
  saveState(); renderAll();
});

///// Dungeon controls /////
$('#dungeonSelect').addEventListener('change', (e)=>{
  state.selectedDungeon = e.target.value;
  $('#selectedDungeonLabel').innerText = state.selectedDungeon === 'forest' ? 'Forest Ruins' : 'Nightforge';
  saveState();
});
$('#enterDungeonQuick').addEventListener('click', ()=> {
  setActiveTab('dungeon');
  if(inCombat){ log('Already in combat!', 'muted'); return; }
  spawnEnemy();
});
$('#enterDungeon').addEventListener('click', ()=>{
  if(inCombat){ log('Already in combat!', 'muted'); return;}
  spawnEnemy();
});
$('#fleeBtn').addEventListener('click', ()=>{
  if(!inCombat){ log('Not in a fight.', 'muted'); return; }
  if(Math.random() < 0.6){
    log('You fled the battle.', 'muted');
    endCombat(false);
  } else {
    log('Failed to flee. Enemy gets a free hit!', 'bad');
    const edmg = enemyDamageToPlayer(currentEnemy);
    state.hp = Math.max(0, state.hp - edmg);
    log(`Enemy hits you for ${edmg}.`);
    if(state.hp <= 0){
      log('You were defeated while fleeing. Respawning.', 'bad');
      state.gold = Math.max(0, state.gold - Math.floor(state.gold * 0.12));
      state.hp = state.maxHP;
      inCombat = false; currentEnemy = null; $('#enemyBox').style.display='none';
    }
    saveState(); renderAll();
  }
});

///// Initial setup & hotkeys /////
function initDefaults(){
  state.maxHP = computeMaxHP();
  if(typeof state.hp === 'undefined') state.hp = state.maxHP;
  $('#dungeonSelect').value = state.selectedDungeon || 'forest';
  $('#selectedDungeonLabel').innerText = state.selectedDungeon === 'forest' ? 'Forest Ruins' : 'Nightforge';
  // ensure moveCooldowns has numeric keys
  state.moveCooldowns = state.moveCooldowns || {};
  // hide workshop tab initially so user can't access it from menu
  hideWorkshopTab();
  saveState();
}

document.addEventListener('keydown', e=>{
  if(e.key === '1') setActiveTab('dungeon');
  if(e.key === '2') setActiveTab('inventory');
  if(e.key === '3') setActiveTab('shop');
  // removed mapping for '4' to prevent workshop hotkey
  if(e.key === '4') setActiveTab('stats');
});

document.addEventListener('keydown', e=>{
  if(e.key.toLowerCase()==='r' && e.shiftKey){
    if(confirm('Reset all saved progress?')){ localStorage.removeItem('nightforge_save'); location.reload(); }
  }
});

// Safety: prevent inventory interaction during combat by intercepting clicks on inventory tab and buttons
document.addEventListener('click', (ev)=>{
  // if in combat and clicking inside inventory panel, prevent actions
  if(inCombat){
    const invPanel = $('#tab-inventory');
    if(invPanel && invPanel.contains(ev.target)){
      ev.preventDefault();
      ev.stopPropagation();
      log('Cannot open or interact with inventory during combat.', 'bad');
    }
  }
});

///// Boot /////
initDefaults();
renderAll();
log('Game ready. Tips: Learn moves in Workshop, allocate stats in Stats, and assign moves to slots. Hover status badges to see details.', 'muted');
