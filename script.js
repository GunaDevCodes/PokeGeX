/*
 PokeGeX - static SPA using PokeAPI
 - list + pagination
 - search by name or dex id
 - detail modal with stats, types, abilities, moves
 - move details loaded on demand
 - sample Ash bonds hard-coded
*/

const API_ROOT = "https://pokeapi.co/api/v2";
const pokemonGrid = document.getElementById("pokemonGrid");
const paginationEl = document.getElementById("pagination");
const listInfo = document.getElementById("listInfo");
const searchInput = document.getElementById("searchInput");
const perPageSelect = document.getElementById("perPage");
const ashListEl = document.getElementById("ashList");

const modal = document.getElementById("modal");
const modalBackdrop = document.getElementById("modalBackdrop");
const modalClose = document.getElementById("modalClose");
const modalContent = document.getElementById("modalContent");

let allPokemon = []; // {name, url}
let pokemonCache = new Map(); // id/name -> details
let currentPage = 1;
let perPage = parseInt(perPageSelect.value || "50", 10);
let filteredList = null;

// small hard-coded Ash bonds sample (you can expand)
const ashBonds = [
  { name: "pikachu", trainer: "Ash Ketchum", notes: "Loyal partner. Key bond moves: Thunderbolt, Quick Attack.", firstSeen: "Episode 1" },
  { name: "bulbasaur", trainer: "Ash Ketchum", notes: "Calm and helpful. Often helps with plant tasks.", firstSeen: "Pallet Town" },
  { name: "charizard", trainer: "Ash Ketchum", notes: "Powerful and stubborn, strong bond after many battles.", firstSeen: "Charizard saga" },
  { name: "squirtle", trainer: "Ash Ketchum", notes: "Leader of the Squirtle Squad and loyal to Ash.", firstSeen: "Squirtle Squad" },
  { name: "pidgeotto", trainer: "Ash Ketchum", notes: "Trusted flying partner in early journeys.", firstSeen: "Pidgeotto arc" }
];

// helpers
function elm(tag, cls, text){
  const e = document.createElement(tag);
  if(cls) e.className = cls;
  if(text !== undefined) e.textContent = text;
  return e;
}

function fmtId(n){
  return "#" + String(n).padStart(3, "0");
}

function showLoadingGrid(){
  pokemonGrid.innerHTML = "";
  for(let i=0;i<8;i++){
    const placeholder = elm("div", "card");
    const thumb = elm("div","thumb");
    thumb.innerHTML = `<div style="width:48px;height:48px;background:linear-gradient(90deg,#0b1220,#0a1624);border-radius:8px"></div>`;
    const meta = elm("div","meta");
    meta.innerHTML = `<div style="height:14px;background:linear-gradient(90deg,#06101b,#0b1220);border-radius:6px;margin-bottom:8px"></div><div style="width:80px;height:10px;background:linear-gradient(90deg,#06101b,#0b1220);border-radius:6px"></div>`;
    placeholder.appendChild(thumb);
    placeholder.appendChild(meta);
    pokemonGrid.appendChild(placeholder);
  }
}

async function fetchAllPokemonList(){
  // PokeAPI supports large limit; fetch all entries
  const url = `${API_ROOT}/pokemon?limit=2000`;
  const res = await fetch(url);
  if(!res.ok) throw new Error("Failed to fetch pokemon list");
  const data = await res.json();
  return data.results; // array of {name,url}
}

async function fetchPokemonDetails(urlOrName){
  // Accept either name/id or url
  let key = urlOrName;
  if(typeof urlOrName === "string"){
    // name or url
    if(urlOrName.startsWith("http")) key = urlOrName;
    else key = urlOrName.toLowerCase();
  }
  // cache by name/id or url
  if(pokemonCache.has(key)) return pokemonCache.get(key);

  let res;
  if(typeof urlOrName === "string" && urlOrName.startsWith("http")){
    res = await fetch(urlOrName);
  }else{
    res = await fetch(`${API_ROOT}/pokemon/${urlOrName}`);
  }
  if(!res.ok) throw new Error("Failed to fetch pokemon detail");
  const detail = await res.json();
  pokemonCache.set(key, detail);
  pokemonCache.set(detail.id, detail);
  pokemonCache.set(detail.name, detail);
  return detail;
}

function getSpriteFromDetail(detail){
  // prefer official artwork then default sprite
  return detail?.sprites?.other?.["official-artwork"]?.front_default
    || detail?.sprites?.front_default
    || detail?.sprites?.other?.dream_world?.front_default
    || "";
}

function renderList(page = 1){
  pokemonGrid.innerHTML = "";
  perPage = parseInt(perPageSelect.value, 10) || 50;
  currentPage = page;
  const list = filteredList || allPokemon;
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / perPage));
  if(currentPage > pages) currentPage = pages;

  const start = (currentPage - 1) * perPage;
  const pageItems = list.slice(start, start + perPage);

  listInfo.textContent = `Showing ${start + 1}–${Math.min(start + pageItems.length, total)} of ${total} Pokémon`;

  if(pageItems.length === 0){
    pokemonGrid.innerHTML = `<div class="muted">No Pokémon found.</div>`;
    paginationEl.innerHTML = "";
    return;
  }

  // fetch details for visible items
  const fetchPromises = pageItems.map(p => fetchPokemonDetails(p.url));
  Promise.allSettled(fetchPromises).then(results => {
    results.forEach((r, i) => {
      const base = pageItems[i];
      const card = elm("div","card");
      if(r.status === "fulfilled"){
        const detail = r.value;
        const imgUrl = getSpriteFromDetail(detail);
        const thumb = elm("div","thumb");
        const img = document.createElement("img");
        img.src = imgUrl || "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'></svg>";
        img.alt = detail.name;
        thumb.appendChild(img);
        const meta = elm("div","meta");
        const title = elm("div","poke-name", detail.name);
        const id = elm("div","poke-id", fmtId(detail.id));
        meta.appendChild(title);
        meta.appendChild(id);
        card.appendChild(thumb);
        card.appendChild(meta);
        card.addEventListener("click", () => openModalWithPokemon(detail));
      } else {
        // fallback card (name only)
        const thumb = elm("div","thumb");
        thumb.innerHTML = `<div style="width:36px;height:36px;background:#06101b;border-radius:6px"></div>`;
        const meta = elm("div","meta");
        meta.appendChild(elm("div","poke-name", base.name));
        meta.appendChild(elm("div","poke-id",""));
        card.appendChild(thumb);
        card.appendChild(meta);
      }
      pokemonGrid.appendChild(card);
    });

    renderPagination(pages);
  }).catch(err => {
    // if something fails, still render skeleton cards
    console.error(err);
    pokemonGrid.innerHTML = `<div class="muted">Failed to load Pokemon details. Try refreshing.</div>`;
  });
}

function renderPagination(totalPages){
  paginationEl.innerHTML = "";
  const prev = elm("button","page-btn","Prev");
  prev.disabled = currentPage <= 1;
  prev.addEventListener("click", () => renderList(currentPage - 1));
  paginationEl.appendChild(prev);

  // show some page numbers (compact)
  const maxButtons = 7;
  let start = Math.max(1, currentPage - Math.floor(maxButtons/2));
  let end = Math.min(totalPages, start + maxButtons - 1);
  if(end - start < maxButtons - 1){
    start = Math.max(1, end - maxButtons + 1);
  }
  for(let p = start; p <= end; p++){
    const btn = elm("button","page-btn", String(p));
    if(p === currentPage){
      btn.style.background = "linear-gradient(90deg, rgba(255,203,5,0.12), rgba(255,203,5,0.06))";
      btn.style.borderColor = "rgba(255,203,5,0.18)";
      btn.style.fontWeight = "700";
    }
    btn.addEventListener("click", () => renderList(p));
    paginationEl.appendChild(btn);
  }

  const next = elm("button","page-btn","Next");
  next.disabled = currentPage >= totalPages;
  next.addEventListener("click", () => renderList(currentPage + 1));
  paginationEl.appendChild(next);
}

function openModalWithPokemon(detail){
  // build modal content
  modalContent.innerHTML = "";
  const left = elm("div","left-column");
  const right = elm("div","right-column");

  const spriteWrap = elm("div","large-sprite");
  const img = document.createElement("img");
  img.alt = detail.name;
  img.src = getSpriteFromDetail(detail) || detail.sprites.front_default || "";
  spriteWrap.appendChild(img);
  left.appendChild(spriteWrap);

  left.appendChild(elm("div","poke-name", detail.name + " " + fmtId(detail.id)));

  // types
  const typesWrap = elm("div","");
  detail.types.forEach(t => {
    const typePill = elm("span","type-pill", t.type.name);
    typesWrap.appendChild(typePill);
  });
  left.appendChild(typesWrap);

  // abilities
  left.appendChild(elm("h3","","Abilities"));
  detail.abilities.forEach(a => {
    const ab = elm("div","stat-row");
    ab.innerHTML = `<div style="text-transform:capitalize">${a.ability.name}${a.is_hidden ? " (hidden)" : ""}</div><div class="muted">${a.slot}</div>`;
    left.appendChild(ab);
  });

  // stats
  left.appendChild(elm("h3","","Base Stats"));
  detail.stats.forEach(s => {
    const row = elm("div","stat-row");
    row.innerHTML = `<div style="text-transform:capitalize">${s.stat.name}</div><div class="muted">${s.base_stat}</div>`;
    left.appendChild(row);
  });

  // right column - moves list
  right.appendChild(elm("h3","","Moves"));
  const moveList = elm("div","move-list");
  detail.moves.slice(0, 200).forEach(m => {
    const moveItem = elm("div","move-item");
    const moveName = elm("div","", m.move.name );
    const moveBtn = elm("button","", "Details");
    moveBtn.addEventListener("click", async (e) => {
      moveBtn.textContent = "Loading...";
      try{
        const mv = await fetchMoveDetail(m.move.url);
        showMovePopover(mv, moveBtn);
      }catch(err){
        console.error(err);
        alert("Failed to load move details");
      } finally {
        moveBtn.textContent = "Details";
      }
    });
    moveItem.appendChild(moveName);
    moveItem.appendChild(moveBtn);
    moveList.appendChild(moveItem);
  });
  right.appendChild(moveList);

  // other info
  const meta = elm("div","");
  meta.style.marginTop = "10px";
  meta.innerHTML = `
    <div class="muted">Height: ${detail.height} decimetres • Weight: ${detail.weight} hectograms</div>
    <div class="muted">Base Experience: ${detail.base_experience || "—"}</div>
  `;

  right.appendChild(meta);

  // append columns
  const contentWrap = elm("div","modal-content");
  contentWrap.appendChild(left);
  contentWrap.appendChild(right);

  modalContent.appendChild(contentWrap);
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden","false");
}

async function fetchMoveDetail(url){
  // simple caching
  if(!url) throw new Error("No move url");
  if(window._moveCache && window._moveCache[url]) return window._moveCache[url];
  const res = await fetch(url);
  if(!res.ok) throw new Error("Failed to fetch move");
  const mv = await res.json();
  window._moveCache = window._moveCache || {};
  window._moveCache[url] = mv;
  return mv;
}

function showMovePopover(move, anchor){
  // small popover near button showing main move info
  const existing = document.getElementById("movePopover");
  if(existing) existing.remove();

  const pop = elm("div","move-popover");
  pop.id = "movePopover";
  pop.style.position = "absolute";
  pop.style.zIndex = "9999";
  pop.style.background = "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))";
  pop.style.border = "1px solid rgba(255,255,255,0.04)";
  pop.style.padding = "10px";
  pop.style.borderRadius = "8px";
  pop.style.width = "320px";
  pop.style.boxShadow = "0 8px 24px rgba(2,6,23,0.6)";

  const title = elm("div","", move.name);
  title.style.fontWeight = "700";
  title.style.textTransform = "capitalize";
  title.style.marginBottom = "6px";

  const meta = elm("div","muted", `${move.type?.name || ""} • ${move.damage_class?.name || ""}`);
  meta.style.marginBottom = "8px";

  const stats = elm("div","");
  stats.innerHTML = `<div>Power: <strong>${move.power ?? "—"}</strong> • Accuracy: <strong>${move.accuracy ?? "—"}</strong> • PP: <strong>${move.pp ?? "—"}</strong></div>`;

  const effect = elm("div","muted");
  // choose english effect entry
  const effectEntry = (move.effect_entries || []).find(e => e.language.name === "en");
  if(effectEntry) effect.textContent = effectEntry.effect;
  else {
    // fallback to flavor text in effect_changes or flavor_text_entries
    const flavor = (move.flavor_text_entries || []).find(e => e.language.name === "en");
    if(flavor) effect.textContent = flavor.flavor_text.replace(/\n|\f/g, " ");
  }

  pop.appendChild(title);
  pop.appendChild(meta);
  pop.appendChild(stats);
  if(effect.textContent) pop.appendChild(elm("hr"));
  pop.appendChild(effect);

  document.body.appendChild(pop);

  // position close to anchor
  const rect = anchor.getBoundingClientRect();
  pop.style.left = Math.min(window.innerWidth - 340, rect.left + window.scrollX - 10) + "px";
  pop.style.top = (rect.top + window.scrollY + 30) + "px";

  function removePop(){
    pop.remove();
    document.removeEventListener("click", outsideListener);
  }
  function outsideListener(e){
    if(!pop.contains(e.target) && e.target !== anchor) removePop();
  }
  document.addEventListener("click", outsideListener);
}

function attachModalHandlers(){
  modalClose.addEventListener("click", () => {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden","true");
    modalContent.innerHTML = "";
  });
  modalBackdrop.addEventListener("click", () => {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden","true");
    modalContent.innerHTML = "";
  });
  document.addEventListener("keydown", (e) => {
    if(e.key === "Escape" && !modal.classList.contains("hidden")){
      modal.classList.add("hidden");
      modal.setAttribute("aria-hidden","true");
      modalContent.innerHTML = "";
    }
  });
}

function renderAshSection(){
  ashListEl.innerHTML = "";
  ashBonds.forEach(async (entry) => {
    const card = elm("div","ash-card");
    const imgWrap = elm("div","");
    const img = document.createElement("img");
    img.alt = entry.name;
    // fetch pokemon detail to get image
    try{
      const d = await fetchPokemonDetails(entry.name);
      img.src = getSpriteFromDetail(d) || d.sprites.front_default || "";
    }catch(e){
      img.src = "";
    }
    imgWrap.appendChild(img);
    const meta = elm("div","");
    const title = elm("div","poke-name", entry.name);
    const trainer = elm("div","muted", entry.trainer);
    const notes = elm("div","", entry.notes);
    notes.style.fontSize = "13px";
    notes.style.marginTop = "6px";
    meta.appendChild(title);
    meta.appendChild(trainer);
    meta.appendChild(notes);
    card.appendChild(imgWrap);
    card.appendChild(meta);
    card.addEventListener("click", async () => {
      try{
        const d = await fetchPokemonDetails(entry.name);
        openModalWithPokemon(d);
      }catch(err){
        alert("Failed to open Pokemon details.");
      }
    });
    ashListEl.appendChild(card);
  });
}

// search handler
function setupSearch(){
  let typingTimer = null;
  searchInput.addEventListener("input", () => {
    clearTimeout(typingTimer);
    typingTimer = setTimeout(applySearch, 250);
  });
  perPageSelect.addEventListener("change", () => {
    currentPage = 1;
    renderList(1);
  });
}

function applySearch(){
  const q = searchInput.value.trim().toLowerCase();
  if(!q){
    filteredList = null;
    renderList(1);
    return;
  }
  // search by name or dex number (# or numeric)
  if(/^\d+$/.test(q) || q.startsWith("#")){
    const idq = parseInt(q.replace("#",""), 10);
    filteredList = allPokemon.filter((p) => {
      // rely on cached details if available
      const det = pokemonCache.get(p.name) || pokemonCache.get(p.url);
      if(det && det.id) return det.id === idq;
      // fallback: name won't match id, so compare later (we could fetch but avoid)
      return false;
    });
    // if none matched in cache, try to load by id direct
    if(filteredList.length === 0){
      // attempt to fetch by id and show only that one
      fetchPokemonDetails(idq).then(d => {
        filteredList = [{name: d.name, url: `${API_ROOT}/pokemon/${d.name}`}];
        renderList(1);
      }).catch(() => {
        filteredList = [];
        renderList(1);
      });
      return;
    }
  } else {
    filteredList = allPokemon.filter(p => p.name.includes(q));
  }
  renderList(1);
}

// initial boot
async function boot(){
  attachModalHandlers();
  setupSearch();
  showLoadingGrid();
  try{
    allPokemon = await fetchAllPokemonList();
    // ensure everything is lowercase names
    allPokemon = allPokemon.map(p => ({ name: p.name.toLowerCase(), url: p.url }));
    renderList(1);
    renderAshSection();
  }catch(err){
    console.error(err);
    pokemonGrid.innerHTML = `<div class="muted">Failed to load Pokédex. Check network or API limits. See console for details.</div>`;
  }
}

boot();
