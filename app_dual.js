// Dual Brain Protein & Phosphosite Heatmap Viewer
const $ = (sel) => document.querySelector(sel);

const state = {
  proteinRows: [],      // global protein data
  phosphoRows: [],      // phosphosite data
  regions: [],          // brain region names
  currentProtein: null, // selected protein accession
  currentSite: null,    // selected phosphosite
  phosphoSites: [],     // available sites for current protein
  
  // Dual SVG containers
  svgProtein: null,
  svgPhospho: null,
  viewportProtein: null,
  viewportPhospho: null,
  
  // Zoom state for both viewers
  zoomProtein: {scale: 1, tx: 0, ty: 0},
  zoomPhospho: {scale: 1, tx: 0, ty: 0},
  
  alpha: 1,
  regionElementsProtein: new Map(),
  regionElementsPhospho: new Map(),
};

function setStatus(msg, isError=false){
  const el = $("#status");
  el.textContent = msg;
  el.style.color = isError ? "var(--danger)" : "var(--muted)";
}

function clamp(x,a,b){ return Math.max(a, Math.min(b, x)); }

function hexToRgb(hex){
  const h = hex.replace("#","").trim();
  const v = h.length === 3 ? h.split("").map(c=>c+c).join("") : h;
  const n = parseInt(v,16);
  return {r:(n>>16)&255, g:(n>>8)&255, b:n&255};
}

function lerp(a,b,t){ return a + (b-a)*t; }

function lerpColor(c1,c2,t){
  const A = hexToRgb(c1), B = hexToRgb(c2);
  const r = Math.round(lerp(A.r,B.r,t));
  const g = Math.round(lerp(A.g,B.g,t));
  const b = Math.round(lerp(A.b,B.b,t));
  return {r,g,b};
}

// Plasma color scheme
function colorForValue(v, vmin, vmax){
  if(!isFinite(v)) return {r:155,g:155,b:155}; // grey for NA
  if(vmax === vmin) return {r:30,g:144,b:255};
  const t = clamp((v - vmin)/(vmax - vmin), 0, 1);
  if(t < 0.33) return lerpColor("#0d0887", "#6a00a8", t/0.33);
  if(t < 0.66) return lerpColor("#6a00a8", "#b12a90", (t-0.33)/0.33);
  if(t < 0.85) return lerpColor("#b12a90", "#e16462", (t-0.66)/0.19);
  return lerpColor("#e16462", "#f0f921", (t-0.85)/0.15);
}

async function fetchText(path){
  const res = await fetch(path, {cache:"no-store"});
  if(!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status} ${res.statusText}`);
  return await res.text();
}

// CSV parser
function parseCSV(text){
  const lines = text.replace(/\r/g,"").split("\n").filter(l => l.trim().length>0);
  if(lines.length < 2) throw new Error("CSV has no data rows.");
  const header = parseCSVLine(lines[0]);
  const rows = [];
  for(let i=1;i<lines.length;i++){
    const fields = parseCSVLine(lines[i]);
    while(fields.length < header.length) fields.push("");
    if(fields.length > header.length) fields.length = header.length;
    const obj = {};
    for(let j=0;j<header.length;j++){
      obj[header[j]] = fields[j];
    }
    rows.push(obj);
  }
  return {header, rows};
}

function parseCSVLine(line){
  const out = [];
  let cur = "";
  let inQ = false;
  for(let i=0;i<line.length;i++){
    const ch = line[i];
    if(inQ){
      if(ch === '"'){
        if(i+1 < line.length && line[i+1] === '"'){ cur += '"'; i++; }
        else { inQ = false; }
      } else cur += ch;
    } else {
      if(ch === '"') inQ = true;
      else if(ch === ","){ out.push(cur); cur=""; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out.map(s => s.trim());
}

function parseNumber(x){
  if(x === null || x === undefined) return NaN;
  const s = String(x).trim();
  if(s === "" || /^na$/i.test(s) || /^nan$/i.test(s)) return NaN;
  const v = Number(s);
  return isFinite(v) ? v : NaN;
}

function normColName(s){
  return String(s||"").trim().toLowerCase().replace(/\s+/g," ");
}

// Extract accession from phosphosite string like "sp|Q61029|LAP2B_MOUSE@T159"
function extractAccession(phosphosite){
  const match = phosphosite.match(/\|([A-Z0-9]+)\|/);
  return match ? match[1] : null;
}

// Extract site from phosphosite string
function extractSite(phosphosite){
  const match = phosphosite.match(/@([A-Z]\d+)/);
  return match ? match[1] : null;
}

// Load and process protein data (simplified format with metadata)
function buildProteinRows(csv){
  const header = csv.header;
  // accession, protein_name, gene_name, tissue_specificity, then regions
  const regions = header.slice(4); // Skip first 4 metadata columns
  state.regions = regions;
  
  const rows = csv.rows.map((r, idx) => {
    const accession = r['accession'] || `row${idx}`;
    const protein_name = r['protein_name'] || '';
    const gene_name = r['gene_name'] || '';
    const tissue_specificity = r['tissue_specificity'] || '';
    const values = {};
    for(const region of regions){
      values[region] = parseNumber(r[region]);
    }
    return {accession, protein_name, gene_name, tissue_specificity, values};
  });
  
  state.proteinRows = rows;
  console.log(`Loaded ${rows.length} proteins with ${regions.length} regions`);
}

// Load and process phosphosite data (simplified format)
function buildPhosphoRows(csv){
  const header = csv.header;
  // phosphosite, accession, site, then regions
  const regions = header.slice(3); // Skip first 3 columns
  
  const rows = csv.rows.map((r, idx) => {
    const phosphosite = r['phosphosite'] || `row${idx}`;
    const accession = r['accession'];
    const site = r['site'];
    const values = {};
    for(const region of regions){
      values[region] = parseNumber(r[region]);
    }
    return {phosphosite, accession, site, values};
  });
  
  state.phosphoRows = rows;
  console.log(`Loaded ${rows.length} phosphosites`);
  console.log(`Sample phosphosite:`, rows[0]);
}

// Get all phosphosites for a given accession
function getPhosphoSitesForProtein(accession){
  return state.phosphoRows.filter(r => r.accession === accession);
}

// Search proteins by accession, gene name, or protein name
function searchProteins(query, limit=40){
  const q = (query||"").trim().toLowerCase();
  if(!q) return [];
  
  const hits = [];
  for(const protein of state.proteinRows){
    const acc = protein.accession.toLowerCase();
    const gene = (protein.gene_name || '').toLowerCase();
    const pname = (protein.protein_name || '').toLowerCase();
    
    // Search in accession, gene name, or protein name
    if(acc.includes(q) || gene.includes(q) || pname.includes(q)){
      const hasPhospho = state.phosphoRows.some(r => r.accession === protein.accession);
      const phosphoCount = hasPhospho ? getPhosphoSitesForProtein(protein.accession).length : 0;
      
      hits.push({
        accession: protein.accession,
        gene: protein.gene_name,
        protein_name: protein.protein_name,
        hasPhospho,
        phosphoCount,
        display: buildDisplayString(protein, phosphoCount)
      });
    }
    if(hits.length >= limit) break;
  }
  return hits;
}

function buildDisplayString(protein, phosphoCount){
  const parts = [];
  parts.push(protein.accession);
  if(protein.gene_name) parts.push(`(${protein.gene_name})`);
  if(phosphoCount > 0) parts.push(`[${phosphoCount} sites]`);
  return parts.join(' ');
}

function showSuggestions(items){
  const box = $("#suggestions");
  box.innerHTML = "";
  if(!items || items.length === 0){
    box.style.display = "none";
    return;
  }
  for(const item of items){
    const div = document.createElement("div");
    div.className = "suggItem";
    
    // Build display with accession, gene, and protein name snippet
    let html = `<strong>${escapeHtml(item.accession)}</strong>`;
    if(item.gene) html += ` <span style="color:var(--muted)">(${escapeHtml(item.gene)})</span>`;
    if(item.phosphoCount > 0) html += ` <span style="color:var(--success)">[${item.phosphoCount} sites]</span>`;
    
    // Add protein name as subtitle if available
    if(item.protein_name){
      const shortName = item.protein_name.length > 60 
        ? item.protein_name.substring(0, 60) + '...' 
        : item.protein_name;
      html += `<span class="suggMeta">${escapeHtml(shortName)}</span>`;
    }
    
    div.innerHTML = html;
    div.addEventListener("click", () => {
      $("#proteinSearch").value = item.accession;
      box.style.display = "none";
      selectProtein(item.accession);
    });
    box.appendChild(div);
  }
  box.style.display = "block";
}

function escapeHtml(s){
  return String(s || "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function getTransformedValues(values){
  const arr = state.regions.map(r => values[r]);
  const mode = $("#transformSelect").value;
  if(mode === "raw") return arr;
  if(mode === "log2"){
    return arr.map(v => isFinite(v) && v>0 ? Math.log2(v) : NaN);
  }
  if(mode === "zscore"){
    const xs = arr.filter(v => isFinite(v));
    if(xs.length < 2) return arr.map(_=>NaN);
    const mean = xs.reduce((a,b)=>a+b,0)/xs.length;
    const sd = Math.sqrt(xs.reduce((a,b)=>a + (b-mean)*(b-mean),0)/Math.max(1, xs.length-1));
    if(!isFinite(sd) || sd===0) return arr.map(_=>NaN);
    return arr.map(v => isFinite(v) ? (v-mean)/sd : NaN);
  }
  return arr;
}

// Select a protein and update UI
function selectProtein(accession){
  state.currentProtein = accession;
  
  // Find protein data
  const proteinData = state.proteinRows.find(r => r.accession === accession);
  const phosphoSites = getPhosphoSitesForProtein(accession);
  
  // Update metadata display
  const metaPanel = $("#proteinMetadata");
  if(proteinData){
    $("#metaAccession").textContent = proteinData.accession || "—";
    $("#metaGene").textContent = proteinData.gene_name || "—";
    $("#metaProtein").textContent = proteinData.protein_name || "—";
    $("#metaTissue").textContent = proteinData.tissue_specificity || "—";
    metaPanel.style.display = "block";
  } else {
    metaPanel.style.display = "none";
  }
  
  // Update phosphosite dropdown
  const dropdown = $("#siteDropdown");
  const siteSelect = $("#phosphoSiteSelect");
  
  dropdown.innerHTML = '<option value="">All sites combined</option>';
  
  if(phosphoSites.length > 0){
    phosphoSites.forEach(ps => {
      const opt = document.createElement("option");
      opt.value = ps.phosphosite;
      opt.textContent = ps.site || ps.phosphosite;
      dropdown.appendChild(opt);
    });
    siteSelect.style.display = "block";
    state.phosphoSites = phosphoSites;
    state.currentSite = ""; // Default to combined view
  } else {
    siteSelect.style.display = "none";
    state.phosphoSites = [];
    state.currentSite = null;
  }
  
  // Update both viewers
  applyHeatmaps();
}

// Apply heatmaps to both viewers
function applyHeatmaps(){
  const accession = state.currentProtein;
  if(!accession) return;
  
  // Get protein data
  const proteinData = state.proteinRows.find(r => r.accession === accession);
  
  // Get phospho data (either specific site or combined)
  let phosphoData = null;
  if(state.currentSite === ""){
    // Combined view - average all sites
    const sites = state.phosphoSites;
    if(sites.length > 0){
      phosphoData = {values: {}};
      for(const region of state.regions){
        const vals = sites.map(s => s.values[region]).filter(v => isFinite(v));
        phosphoData.values[region] = vals.length > 0 ? vals.reduce((a,b)=>a+b,0)/vals.length : NaN;
      }
    }
  } else if(state.currentSite){
    phosphoData = state.phosphoRows.find(r => r.phosphosite === state.currentSite);
  }
  
  // Calculate unified color scale based on GLOBAL PROTEIN values
  let vmin = -Infinity;
  let vmax = Infinity;
  
  if(proteinData){
    const proteinTransformed = getTransformedValues(proteinData.values);
    const proteinFinite = proteinTransformed.filter(v => isFinite(v));
    if(proteinFinite.length > 0){
      vmin = Math.min(...proteinFinite);
      vmax = Math.max(...proteinFinite);
    }
  }
  
  // Update legend with global protein scale
  $("#legendMin").textContent = isFinite(vmin) ? vmin.toFixed(3) : "—";
  $("#legendMax").textContent = isFinite(vmax) ? vmax.toFixed(3) : "—";
  
  // Apply to protein viewer
  if(proteinData){
    applyHeatmapToViewer(proteinData.values, "Protein", true, vmin, vmax);
    $("#proteinStatus").textContent = "Active";
    $("#proteinStatus").className = "statusBadge active";
  } else {
    applyHeatmapToViewer(null, "Protein", false, vmin, vmax);
    $("#proteinStatus").textContent = "No data";
    $("#proteinStatus").className = "statusBadge na";
  }
  
  // Apply to phospho viewer using SAME color scale
  if(phosphoData){
    applyHeatmapToViewer(phosphoData.values, "Phospho", true, vmin, vmax);
    const siteLabel = state.currentSite === "" ? `${state.phosphoSites.length} sites (avg)` : extractSite(state.currentSite);
    $("#phosphoStatus").textContent = siteLabel;
    $("#phosphoStatus").className = "statusBadge active";
  } else {
    applyHeatmapToViewer(null, "Phospho", false, vmin, vmax);
    $("#phosphoStatus").textContent = "No data";
    $("#phosphoStatus").className = "statusBadge na";
  }
}

// Apply heatmap to a specific viewer (with unified color scale)
function applyHeatmapToViewer(values, viewerType, hasData, vmin, vmax){
  const isProtein = viewerType === "Protein";
  const regionElements = isProtein ? state.regionElementsProtein : state.regionElementsPhospho;
  const valuesPanel = isProtein ? $("#valuesPanelProtein") : $("#valuesPanelPhospho");
  
  if(!hasData || !values){
    // Show all regions as NA (grey)
    for(const [region, elements] of regionElements){
      for(const el of elements){
        el.style.fill = "rgb(155,155,155)";
        el.style.opacity = state.alpha;
      }
    }
    valuesPanel.innerHTML = '<div class="hint">No data available</div>';
    return;
  }
  
  // Transform values
  const transformed = getTransformedValues(values);
  
  // Use provided vmin/vmax for unified color scale
  // If not provided, calculate from this data
  if(!isFinite(vmin) || !isFinite(vmax)){
    const finiteVals = transformed.filter(v => isFinite(v));
    if(finiteVals.length === 0){
      valuesPanel.innerHTML = '<div class="hint">All values are NA</div>';
      return;
    }
    vmin = Math.min(...finiteVals);
    vmax = Math.max(...finiteVals);
  }
  
  // Apply colors to regions
  const rows = [];
  state.regions.forEach((region, idx) => {
    const val = transformed[idx];
    const rgb = colorForValue(val, vmin, vmax);
    const color = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
    
    // Update region color - try both exact match and normalized match
    const normalizedRegion = baseRegionId(region);
    const elements = regionElements.get(region) || regionElements.get(normalizedRegion) || [];
    
    // Debug problematic regions
    if(region.toLowerCase().includes('caudoputamen') || region.toLowerCase().includes('habenula')){
      console.log(`Region: "${region}", Normalized: "${normalizedRegion}", Elements found: ${elements.length}`);
    }
    
    for(const el of elements){
      el.style.fill = color;
      el.style.opacity = state.alpha;
    }
    
    // Build value row for panel
    rows.push({region, val, color});
  });
  
  // Update values panel
  valuesPanel.innerHTML = rows.map(r => {
    const valStr = isFinite(r.val) ? r.val.toFixed(3) : "NA";
    return `<div class="valueRow">
      <div class="valueLeft">
        <div class="swatch" style="background:${r.color}"></div>
        <div class="regionName">${escapeHtml(r.region)}</div>
      </div>
      <div class="regionVal">${valStr}</div>
    </div>`;
  }).join("");
}

function baseRegionId(id){
  let b = String(id);
  // Replace both spaces AND underscores with spaces, then trim
  b = b.replace(/[\s_]+/g," ").trim();
  // Strip numbered suffixes like _1, _2, -1, -2
  b = b.replace(/\s+\d+$/,"");
  b = b.replace(/(_copy|_dup)$/i,"");
  b = b.toLowerCase();
  return b;
}


// Build region element index for a viewer
function buildRegionElementIndex(svg, regionElements){
  regionElements.clear();
  if(!svg) return;
  
  const all = svg.querySelectorAll("[id]");
  for(const el of all){
    const id = el.getAttribute("id");
    if(!id) continue;
    const base = baseRegionId(id);
    if(!base) continue;
    if(!regionElements.has(base)) regionElements.set(base, []);
    regionElements.get(base).push(el);
  }
  
  // Debug: log region mapping
  console.log("Region elements indexed:", Array.from(regionElements.keys()).sort());
}

// Load SVG for both viewers
async function loadSVGs(){
  const txt = await fetchText("brain.svg");
  
  // Load protein viewer
  await loadSVGIntoHost(txt, "svgHostProtein", "Protein");
  // Load phospho viewer  
  await loadSVGIntoHost(txt, "svgHostPhospho", "Phospho");
}

async function loadSVGIntoHost(svgText, hostId, viewerType){
  const host = $(`#${hostId}`);
  host.innerHTML = "";
  
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, "image/svg+xml");
  const svg = doc.documentElement;
  
  if(!svg.getAttribute("viewBox")){
    const w = parseFloat(svg.getAttribute("width") || "0");
    const h = parseFloat(svg.getAttribute("height") || "0");
    if(isFinite(w) && isFinite(h) && w>0 && h>0){
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    }
  }
  
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.style.display = "block";
  
  const ns = "http://www.w3.org/2000/svg";
  const viewport = doc.createElementNS(ns, "g");
  viewport.setAttribute("id",`__viewport_${viewerType}`);
  
  const kids = Array.from(svg.childNodes);
  for(const k of kids){
    if(k.nodeType === 1 && k.nodeName.toLowerCase() === "defs") continue;
    viewport.appendChild(k);
  }
  
  for(const k of Array.from(svg.childNodes)){
    if(k !== viewport && !(k.nodeType === 1 && k.nodeName.toLowerCase() === "defs")){
      svg.removeChild(k);
    }
  }
  svg.appendChild(viewport);
  host.appendChild(svg);
  
  // Store references
  if(viewerType === "Protein"){
    state.svgProtein = svg;
    state.viewportProtein = viewport;
    buildRegionElementIndex(svg, state.regionElementsProtein);
    attachPanZoom(host, viewport, state.zoomProtein);
  } else {
    state.svgPhospho = svg;
    state.viewportPhospho = viewport;
    buildRegionElementIndex(svg, state.regionElementsPhospho);
    attachPanZoom(host, viewport, state.zoomPhospho);
  }
  
  requestAnimationFrame(() => {
    if(!svg.getAttribute("viewBox")){
      try{
        const b = viewport.getBBox();
        svg.setAttribute("viewBox", `${b.x} ${b.y} ${b.width} ${b.height}`);
      }catch(e){}
    }
    fitToScreen(host, viewport, viewerType === "Protein" ? state.zoomProtein : state.zoomPhospho);
  });
}

function attachPanZoom(host, viewport, zoomState){
  let dragging = false;
  let last = {x:0,y:0};
  
  host.addEventListener("mousedown", (e) => {
    if(!viewport) return;
    dragging = true;
    last = {x:e.clientX, y:e.clientY};
  });
  
  const stopDrag = () => dragging = false;
  window.addEventListener("mouseup", stopDrag);
  
  window.addEventListener("mousemove", (e)=>{
    if(!dragging || !viewport) return;
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    last = {x:e.clientX, y:e.clientY};
    zoomState.tx += dx;
    zoomState.ty += dy;
    updateViewportTransform(viewport, zoomState);
  });
  
  host.addEventListener("wheel", (e)=>{
    if(!viewport) return;
    e.preventDefault();
    const rect = host.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    
    const delta = -e.deltaY;
    const factor = delta > 0 ? 1.08 : 1/1.08;
    const newScale = clamp(zoomState.scale * factor, 0.2, 12);
    
    const s0 = zoomState.scale;
    const sx = cx - zoomState.tx;
    const sy = cy - zoomState.ty;
    const k = newScale / s0;
    zoomState.tx = cx - sx * k;
    zoomState.ty = cy - sy * k;
    zoomState.scale = newScale;
    updateViewportTransform(viewport, zoomState);
  }, {passive:false});
}

function updateViewportTransform(viewport, zoomState){
  if(!viewport) return;
  viewport.setAttribute("transform", `translate(${zoomState.tx} ${zoomState.ty}) scale(${zoomState.scale})`);
}

function fitToScreen(host, viewport, zoomState){
  if(!viewport) return;
  const rect = host.getBoundingClientRect();
  
  let bbox;
  try{
    bbox = viewport.getBBox();
  }catch(e){
    return;
  }
  if(!bbox || bbox.width === 0 || bbox.height === 0) return;
  
  const pad = 20;
  const scale = Math.min((rect.width - pad*2)/bbox.width, (rect.height - pad*2)/bbox.height);
  zoomState.scale = clamp(scale, 0.2, 12);
  
  const tx = (rect.width/2) - (bbox.x + bbox.width/2) * zoomState.scale;
  const ty = (rect.height/2) - (bbox.y + bbox.height/2) * zoomState.scale;
  zoomState.tx = tx;
  zoomState.ty = ty;
  updateViewportTransform(viewport, zoomState);
}

function resetView(){
  state.zoomProtein = {scale: 1, tx: 0, ty: 0};
  state.zoomPhospho = {scale: 1, tx: 0, ty: 0};
  if(state.viewportProtein) fitToScreen($("#svgHostProtein"), state.viewportProtein, state.zoomProtein);
  if(state.viewportPhospho) fitToScreen($("#svgHostPhospho"), state.viewportPhospho, state.zoomPhospho);
}

function fitBoth(){
  if(state.viewportProtein) fitToScreen($("#svgHostProtein"), state.viewportProtein, state.zoomProtein);
  if(state.viewportPhospho) fitToScreen($("#svgHostPhospho"), state.viewportPhospho, state.zoomPhospho);
}


function bindUI(){
  $("#alphaSlider").addEventListener("input", (e)=>{
    state.alpha = parseFloat(e.target.value);
    $("#alphaValue").textContent = state.alpha.toFixed(2);
    applyHeatmaps();
  });
  
  $("#transformSelect").addEventListener("change", ()=>{
    applyHeatmaps();
  });
  
  $("#siteDropdown").addEventListener("change", (e)=>{
    state.currentSite = e.target.value;
    applyHeatmaps();
  });
  
  $("#proteinSearch").addEventListener("input", (e)=>{
    const q = e.target.value;
    const hits = searchProteins(q, 60);
    showSuggestions(hits);
  });
  
  $("#proteinSearch").addEventListener("keydown", (e)=>{
    if(e.key === "Enter"){
      const q = e.target.value;
      const hits = searchProteins(q, 1);
      if(hits.length) selectProtein(hits[0].accession);
      $("#suggestions").style.display = "none";
    }
    if(e.key === "Escape"){
      $("#suggestions").style.display = "none";
    }
  });
  
  $("#fitBtn").addEventListener("click", fitBoth);
  $("#resetBtn").addEventListener("click", resetView);
  $("#exportBtn").addEventListener("click", exportPNG);
}

function exportPNG(){
  // Export both viewers side by side
  if(!state.svgProtein || !state.svgPhospho) return;
  
  const serializer = new XMLSerializer();
  const svg1 = serializer.serializeToString(state.svgProtein);
  const svg2 = serializer.serializeToString(state.svgPhospho);
  
  // Create combined canvas
  const canvas = document.createElement("canvas");
  const width = 1600;
  const height = 800;
  canvas.width = width * 2;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  
  ctx.fillStyle = "#070b12";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  let loaded = 0;
  const checkComplete = () => {
    loaded++;
    if(loaded === 2){
      canvas.toBlob((png)=>{
        const a = document.createElement("a");
        a.href = URL.createObjectURL(png);
        const name = state.currentProtein ? `${state.currentProtein}_dual.png` : "brain_dual_heatmap.png";
        a.download = name;
        a.click();
        setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
      }, "image/png");
    }
  };
  
  // Load first SVG (protein)
  const blob1 = new Blob([svg1], {type:"image/svg+xml;charset=utf-8"});
  const url1 = URL.createObjectURL(blob1);
  const img1 = new Image();
  img1.onload = () => {
    ctx.drawImage(img1, 0, 0, width, height);
    URL.revokeObjectURL(url1);
    checkComplete();
  };
  img1.src = url1;
  
  // Load second SVG (phospho)
  const blob2 = new Blob([svg2], {type:"image/svg+xml;charset=utf-8"});
  const url2 = URL.createObjectURL(blob2);
  const img2 = new Image();
  img2.onload = () => {
    ctx.drawImage(img2, width, 0, width, height);
    URL.revokeObjectURL(url2);
    checkComplete();
  };
  img2.src = url2;
}

async function main(){
  try{
    bindUI();
    
    setStatus("Loading SVGs…");
    await loadSVGs();
    console.log("SVGs loaded successfully");
    
    setStatus("Loading protein data…");
    const proteinText = await fetchText("data_protein_simple.csv");
    console.log("Protein CSV fetched, length:", proteinText.length);
    const proteinCSV = parseCSV(proteinText);
    console.log("Protein CSV parsed, headers:", proteinCSV.header);
    buildProteinRows(proteinCSV);
    
    setStatus("Loading phosphosite data…");
    const phosphoText = await fetchText("data_phospho_simple.csv");
    console.log("Phospho CSV fetched, length:", phosphoText.length);
    const phosphoCSV = parseCSV(phosphoText);
    console.log("Phospho CSV parsed, headers:", phosphoCSV.header);
    buildPhosphoRows(phosphoCSV);
    
    $("#proteinCount").textContent = `Loaded ${state.proteinRows.length} proteins, ${state.phosphoRows.length} phosphosites. Regions: ${state.regions.length}.`;
    
    // Select first protein with data
    const first = state.proteinRows.find(r => Object.values(r.values).some(v => isFinite(v)));
    if(first){
      console.log("Auto-selecting first protein:", first.accession);
      $("#proteinSearch").value = first.accession;
      selectProtein(first.accession);
    } else {
      console.warn("No proteins with finite values found");
    }
    
    setStatus("Ready");
    console.log("Initialization complete!");
  }catch(err){
    console.error("Error details:", err);
    console.error("Error stack:", err.stack);
    setStatus("Failed to load viewer: " + err.message, true);
  }
}

main();
