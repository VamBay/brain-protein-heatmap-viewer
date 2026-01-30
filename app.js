// Brain protein heatmap viewer (no build tools; pure JS)
// Place this folder somewhere and run: python -m http.server 8000
// Then open: http://localhost:8000

const $ = (sel) => document.querySelector(sel);

const state = {
  rows: [],             // protein rows
  regions: [],          // region column names (CSV columns)
  metaCols: {},         // detected meta columns
  current: null,        // selected protein row
  svg: null,            // injected <svg>
  viewport: null,       // <g> wrapper for pan/zoom
  zoom: {scale: 1, tx: 0, ty: 0},
  alpha: 1,
  labels: new Map(),    // region -> <text>
  regionElements: new Map(), // baseId -> [elements]
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

// Plasma color scheme: dark blue -> purple -> orange -> yellow
function colorForValue(v, vmin, vmax){
  if(!isFinite(v)) return {r:155,g:155,b:155}; // grey for NA
  if(vmax === vmin) return {r:30,g:144,b:255};
  const t = clamp((v - vmin)/(vmax - vmin), 0, 1);
  // Plasma gradient in 4 segments
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

// Small, robust CSV parser (handles quotes)
function parseCSV(text){
  const lines = text.replace(/\r/g,"").split("\n").filter(l => l.trim().length>0);
  if(lines.length < 2) throw new Error("CSV has no data rows.");
  const header = parseCSVLine(lines[0]);
  const rows = [];
  for(let i=1;i<lines.length;i++){
    const fields = parseCSVLine(lines[i]);
    // Pad/truncate to header length
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

function normColName(s){
  return String(s||"").trim().toLowerCase().replace(/\s+/g," ");
}

function detectColumns(header){
  const h = header.map(normColName);
  const find = (...names) => {
    for(const n of names){
      const idx = h.indexOf(normColName(n));
      if(idx >= 0) return header[idx];
    }
    return null;
  };

  // Common variants
  const colAcc = find("accessionclean","accession","uniprot","uniprot id","protein id","protein ids");
  const colProteinNames = find("protein_names","protein names","protein name","protein","proteinname");
  const colGene = find("gene_names","gene names","gene","genename","gene name","genes");
  const colTspec = find("tissue_specificity","tissue specificity","tissue specific","tissue_spec","tissue specificity.");
  const metaCandidates = new Set([colAcc,colProteinNames,colGene,colTspec].filter(Boolean).map(String));

  // If we didn't detect any protein identifier column, assume first column is the id.
  let idCol = colAcc || colProteinNames || header[0];

  // Regions = everything that's not meta
  const regions = header.filter(c => !metaCandidates.has(String(c)) && String(c)!==String(idCol));

  return {idCol, colAcc, colProteinNames, colGene, colTspec, regions};
}

function parseNumber(x){
  if(x === null || x === undefined) return NaN;
  const s = String(x).trim();
  if(s === "" || /^na$/i.test(s) || /^nan$/i.test(s)) return NaN;
  const v = Number(s);
  return isFinite(v) ? v : NaN;
}

function buildProteinRows(csv){
  const meta = detectColumns(csv.header);
  state.metaCols = meta;
  state.regions = meta.regions;
  
  // Debug: log detected columns
  console.log("Detected columns:", {
    idCol: meta.idCol,
    colAcc: meta.colAcc,
    colProteinNames: meta.colProteinNames,
    colGene: meta.colGene,
    colTspec: meta.colTspec,
    regions: meta.regions
  });

  const rows = csv.rows.map((r, idx) => {
    const accession = (meta.colAcc ? r[meta.colAcc] : "") || "";
    const pname = (meta.colProteinNames ? r[meta.colProteinNames] : "") || "";
    const gene = (meta.colGene ? r[meta.colGene] : "") || "";
    const tspec = (meta.colTspec ? r[meta.colTspec] : "") || "";
    const id = (r[meta.idCol] || accession || pname || gene || `row${idx}`).trim();
    
    // Debug: log first row data
    if(idx === 0){
      console.log("First row data:", {accession, pname, gene, tspec, id});
    }

    const values = {};
    for(const region of state.regions){
      values[region] = parseNumber(r[region]);
    }

    const display = [
      id,
      gene && gene !== id ? `(${gene})` : "",
      pname && pname !== id ? `— ${pname}` : ""
    ].filter(Boolean).join(" ");

    const search = [id, accession, gene, pname].filter(Boolean).join(" ").toLowerCase();

    return {id, accession, gene, pname, tspec, values, display, search};
  });

  // Remove totally empty ids (rare)
  const cleaned = rows.filter(r => r.id && r.id.length > 0);
  state.rows = cleaned;
  $("#proteinCount").textContent = `Loaded ${cleaned.length.toLocaleString()} proteins. Regions: ${state.regions.length}.`;
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
    div.innerHTML = `<strong>${escapeHtml(item.id)}</strong> ${item.gene?`<span class="suggMeta">${escapeHtml(item.gene)}</span>`:""}<span class="suggMeta">${escapeHtml(item.pname || item.tspec || "")}</span>`;
    div.addEventListener("click", () => {
      $("#proteinSearch").value = item.id;
      box.style.display = "none";
      selectProtein(item);
    });
    box.appendChild(div);
  }
  box.style.display = "block";
}

function escapeHtml(s){
  return String(s || "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function searchProteins(query, limit=40){
  const q = (query||"").trim().toLowerCase();
  if(!q) return [];
  const hits = [];
  for(const r of state.rows){
    if(r.search.includes(q)) hits.push(r);
    if(hits.length >= limit) break;
  }
  return hits;
}

function getTransformedValues(row){
  const arr = state.regions.map(r => row.values[r]);
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

function selectProtein(row){
  state.current = row;
  updateProteinInfo(row);
  applyHeatmap();
}

function updateProteinInfo(row){
  const infoPanel = $("#proteinInfo");
  if(!row){
    infoPanel.style.display = "none";
    return;
  }
  
  // Display with better empty value handling
  const acc = row.accession && row.accession.trim() ? row.accession : "—";
  const gene = row.gene && row.gene.trim() ? row.gene : "—";
  const pname = row.pname && row.pname.trim() ? row.pname : "—";
  const tspec = row.tspec && row.tspec.trim() ? row.tspec : "—";
  
  $("#infoAccession").textContent = acc;
  $("#infoGene").textContent = gene;
  $("#infoProteinName").textContent = pname;
  $("#infoTissue").textContent = tspec;
  
  infoPanel.style.display = "block";
}

function buildRegionElementIndex(){
  state.regionElements.clear();
  if(!state.svg) return;

  const all = state.svg.querySelectorAll("[id]");
  for(const el of all){
    const id = el.getAttribute("id");
    if(!id) continue;
    const base = baseRegionId(id);
    if(!base) continue;
    if(!state.regionElements.has(base)) state.regionElements.set(base, []);
    state.regionElements.get(base).push(el);
  }
}

function baseRegionId(id){
  // Normalize ids that have suffixes like _1, _2, -1, -2, etc.
  let b = String(id);
  b = b.replace(/[\s]+/g," ").trim();
  // strip common suffix patterns
  b = b.replace(/([_-])\d+$/,"");
  b = b.replace(/(_copy|_dup)$/i,"");
  // Some SVG exporters introduce double-underscores in ids (e.g. "__grey")
  // while the CSV headers may use single underscores. Canonicalize both sides.
  b = b.replace(/_+/g, "_");
  b = b.replace(/^_+|_+$/g, "");
  return b;
}

function applyHeatmap(){
  if(!state.current || !state.svg) return;

  // transformed values in region order
  const tvals = getTransformedValues(state.current);

  // min/max ignoring NaNs
  const finite = tvals.filter(v => isFinite(v));
  const vmin = finite.length ? Math.min(...finite) : NaN;
  const vmax = finite.length ? Math.max(...finite) : NaN;

  // legend labels
  $("#legendMin").textContent = isFinite(vmin) ? vmin.toFixed(3) : "–";
  $("#legendMax").textContent = isFinite(vmax) ? vmax.toFixed(3) : "–";

  // color + values panel
  const panel = $("#valuesPanel");
  panel.innerHTML = "";

  for(let i=0;i<state.regions.length;i++){
    const region = state.regions[i];
    const val = tvals[i];
    const rgb = colorForValue(val, vmin, vmax);
    const fill = `rgba(${rgb.r},${rgb.g},${rgb.b},${state.alpha})`;

    // apply fill to all matching ids (including _1/_2)
    const els = state.regionElements.get(region) || state.regionElements.get(baseRegionId(region)) || [];
    for(const el of els){
      // Many SVG parts have strokes; keep stroke but set fill
      el.style.fill = fill;
      el.style.fillOpacity = String(state.alpha);
    }

    // values list row
    const rowDiv = document.createElement("div");
    rowDiv.className = "valueRow";
    rowDiv.innerHTML = `
      <div class="valueLeft">
        <div class="swatch" style="background:${fill}"></div>
        <div class="regionName" title="${escapeHtml(region)}">${escapeHtml(region)}</div>
      </div>
      <div class="regionVal">${isFinite(val) ? val.toFixed(4) : "NA"}</div>
    `;
    rowDiv.addEventListener("mouseenter", () => highlightRegion(region, true));
    rowDiv.addEventListener("mouseleave", () => highlightRegion(region, false));
    panel.appendChild(rowDiv);

    // label numbers (or values) on svg
    updateRegionLabel(region, isFinite(val) ? val.toFixed(2) : "NA", rgb);
  }

  setStatus(`Ready — ${state.current.display}`);
}

function highlightRegion(region, on){
  const els = state.regionElements.get(region) || state.regionElements.get(baseRegionId(region)) || [];
  for(const el of els){
    el.style.stroke = on ? "rgba(255,255,255,0.9)" : "";
    el.style.strokeWidth = on ? "2" : "";
  }
  const label = state.labels.get(region);
  if(label){
    label.style.fontWeight = on ? "800" : "700";
  }
}

function ensureLabelLayer(){
  let layer = state.svg.querySelector("#__labels");
  if(layer) return layer;
  layer = document.createElementNS("http://www.w3.org/2000/svg", "g");
  layer.setAttribute("id","__labels");
  layer.setAttribute("pointer-events","none");
  state.svg.appendChild(layer);
  return layer;
}

function updateRegionLabel(region, text, rgb){
  // Labels are disabled - this function now does nothing
  return;
}

function clearLabels(){
  state.labels.clear();
  const layer = state.svg ? state.svg.querySelector("#__labels") : null;
  if(layer) layer.remove();
}

function attachPanZoom(){
  const host = $("#svgHost");
  let dragging = false;
  let last = {x:0,y:0};

  host.addEventListener("mousedown", (e) => {
    if(!state.viewport) return;
    dragging = true;
    last = {x:e.clientX, y:e.clientY};
  });
  window.addEventListener("mouseup", ()=> dragging=false);
  window.addEventListener("mousemove", (e)=>{
    if(!dragging || !state.viewport) return;
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    last = {x:e.clientX, y:e.clientY};
    state.zoom.tx += dx;
    state.zoom.ty += dy;
    updateViewportTransform();
  });

  host.addEventListener("wheel", (e)=>{
    if(!state.viewport) return;
    e.preventDefault();
    const rect = host.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    const delta = -e.deltaY;
    const factor = delta > 0 ? 1.08 : 1/1.08;
    const newScale = clamp(state.zoom.scale * factor, 0.2, 12);

    // zoom around cursor
    const s0 = state.zoom.scale;
    const sx = cx - state.zoom.tx;
    const sy = cy - state.zoom.ty;
    const k = newScale / s0;
    state.zoom.tx = cx - sx * k;
    state.zoom.ty = cy - sy * k;
    state.zoom.scale = newScale;
    updateViewportTransform();
  }, {passive:false});
}

function updateViewportTransform(){
  if(!state.viewport) return;
  state.viewport.setAttribute("transform", `translate(${state.zoom.tx} ${state.zoom.ty}) scale(${state.zoom.scale})`);
}

function fitToScreen(){
  if(!state.svg || !state.viewport) return;
  const host = $("#svgHost");
  const rect = host.getBoundingClientRect();

  let bbox;
  try{
    bbox = state.viewport.getBBox();
  }catch(e){
    return;
  }
  if(!bbox || bbox.width === 0 || bbox.height === 0) return;

  const pad = 20;
  const scale = Math.min((rect.width - pad*2)/bbox.width, (rect.height - pad*2)/bbox.height);
  state.zoom.scale = clamp(scale, 0.2, 12);

  // Center
  const tx = (rect.width/2) - (bbox.x + bbox.width/2) * state.zoom.scale;
  const ty = (rect.height/2) - (bbox.y + bbox.height/2) * state.zoom.scale;
  state.zoom.tx = tx;
  state.zoom.ty = ty;
  updateViewportTransform();
}

function resetView(){
  state.zoom = {scale: 1, tx: 0, ty: 0};
  updateViewportTransform();
  fitToScreen();
}

async function loadSVG(){
  const host = $("#svgHost");
  host.innerHTML = "";
  const txt = await fetchText("brain.svg");

  const parser = new DOMParser();
  const doc = parser.parseFromString(txt, "image/svg+xml");
  const svg = doc.documentElement;

  // Ensure viewBox exists; otherwise browser may crop weirdly
  if(!svg.getAttribute("viewBox")){
    const w = parseFloat(svg.getAttribute("width") || "0");
    const h = parseFloat(svg.getAttribute("height") || "0");
    if(isFinite(w) && isFinite(h) && w>0 && h>0){
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    } else {
      // fallback: use bbox after attach
    }
  }

  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.style.display = "block";

  // Wrap existing children in a viewport group to pan/zoom cleanly
  const ns = "http://www.w3.org/2000/svg";
  const viewport = doc.createElementNS(ns, "g");
  viewport.setAttribute("id","__viewport");

  // Move all children except defs into viewport (keep defs at root)
  const kids = Array.from(svg.childNodes);
  for(const k of kids){
    if(k.nodeType === 1 && k.nodeName.toLowerCase() === "defs") continue;
    viewport.appendChild(k);
  }
  // Remove non-def children left behind
  for(const k of Array.from(svg.childNodes)){
    if(k !== viewport && !(k.nodeType === 1 && k.nodeName.toLowerCase() === "defs")){
      svg.removeChild(k);
    }
  }
  svg.appendChild(viewport);

  host.appendChild(svg);

  state.svg = svg;
  state.viewport = viewport;

  buildRegionElementIndex();
  attachPanZoom();

  // initial fit
  requestAnimationFrame(() => {
    // If still no viewBox, set it now from bbox
    if(!svg.getAttribute("viewBox")){
      try{
        const b = viewport.getBBox();
        svg.setAttribute("viewBox", `${b.x} ${b.y} ${b.width} ${b.height}`);
      }catch(e){}
    }
    fitToScreen();
  });
}

function bindUI(){
  $("#alphaSlider").addEventListener("input", (e)=>{
    state.alpha = parseFloat(e.target.value);
    $("#alphaValue").textContent = state.alpha.toFixed(2);
    if(state.current) applyHeatmap();
  });

  $("#transformSelect").addEventListener("change", ()=>{
    clearLabels();
    if(state.current) applyHeatmap();
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
      if(hits.length) selectProtein(hits[0]);
      $("#suggestions").style.display = "none";
    }
    if(e.key === "Escape"){
      $("#suggestions").style.display = "none";
    }
  });

  $("#fitBtn").addEventListener("click", fitToScreen);
  $("#resetBtn").addEventListener("click", resetView);

  $("#exportBtn").addEventListener("click", exportPNG);
}

function exportPNG(){
  if(!state.svg) return;

  // Serialize SVG
  const serializer = new XMLSerializer();
  const svgText = serializer.serializeToString(state.svg);

  const blob = new Blob([svgText], {type:"image/svg+xml;charset=utf-8"});
  const url = URL.createObjectURL(blob);

  const img = new Image();
  img.onload = () => {
    const host = $("#svgHost");
    const rect = host.getBoundingClientRect();

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(rect.width * 2);   // 2x for nicer export
    canvas.height = Math.round(rect.height * 2);
    const ctx = canvas.getContext("2d");
    ctx.scale(2,2);
    ctx.fillStyle = "#070b12";
    ctx.fillRect(0,0,rect.width,rect.height);
    ctx.drawImage(img, 0, 0, rect.width, rect.height);

    URL.revokeObjectURL(url);

    canvas.toBlob((png)=>{
      const a = document.createElement("a");
      a.href = URL.createObjectURL(png);
      const name = state.current ? `${state.current.id}.png` : "brain_heatmap.png";
      a.download = name;
      a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
    }, "image/png");
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    alert("Export failed (could not rasterize SVG). If your SVG references external images, embed them or keep files in the same folder.");
  };
  img.src = url;
}

async function main(){
  try{
    bindUI();
    setStatus("Loading SVG…");
    await loadSVG();

    setStatus("Loading CSV…");
    const csvText = await fetchText("data.csv");
    const csv = parseCSV(csvText);
    buildProteinRows(csv);

    // choose first protein with at least one finite value
    const first = state.rows.find(r => Object.values(r.values).some(v => isFinite(v))) || state.rows[0];
    if(first){
      $("#proteinSearch").value = first.id;
      selectProtein(first);
    }else{
      setStatus("CSV loaded but no proteins found.", true);
    }

    setStatus("Ready");
  }catch(err){
    console.error(err);
    setStatus("Failed to load viewer: " + err.message, true);
    $("#svgHost").innerHTML = `<div style="padding:18px;color:var(--danger);font-weight:700;">${escapeHtml(err.message)}</div>`;
  }
}

main();
