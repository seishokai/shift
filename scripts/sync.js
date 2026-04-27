// Sync script using Google Sheets API v4 (live data, includes cell background colors)
// Reads legend rows in each month sheet to build a dynamic color->clinic map.
// SAFE MODE: never deletes existing entries; only adds/updates.

const fs = require('fs');
const path = require('path');

const SHEET_ID = '1tKjXNJNPInAl0CTXHKd3G-792JNiU37inY0p6hlUPwM';
const API_KEY = process.env.GOOGLE_API_KEY;
if(!API_KEY){ console.error('GOOGLE_API_KEY env var is required'); process.exit(1); }

// 正翔会 doctor name -> id
const NAME_TO_S = {
  '大西':'s1','上之郷':'s2','大久保':'s3','田中':'s4',
  '伊藤':'s5','梅村':'s6','森':'s7','森脩':'s8',
  '竹村':'s9','若山':'s10','谷口':'s11','松清':'s12','後藤':'s13'
};

// 清翔会 doctor name -> id
const NAME_TO_D = {
  '小池':'d1','越知':'d2','荒木':'d3','山田':'d4','古田':'d5','原':'d6',
  '竹内':'d7','大西':'d8','田村':'d9','立松':'d10','武内':'d11','長谷':'d12',
  '永江':'d13','加藤':'d14','れみ':'d15','西村':'d16','鈴木':'d17','中山':'d18',
  '星野':'d19','綱島':'d20','網島':'d20','向田':'d21','鶴田':'d22','清水':'d23',
  '内藤':'d24','上野':'d25','珠里':'d26','小倉':'d27','浦野':'d28','土屋':'d29',
  '英':'d30','明石':'d31','太田':'d32','河野':'d33','青木':'d34','岩田':'d35'
};

// 清翔会 clinic name -> id
const CLINIC_NAME_TO_ID_K = {
  'エスカ':'esca','ｴｽｶ':'esca',
  'アール':'r','ｱｰﾙ':'r',
  'ウィズ':'wiz','ｳｨｽﾞ':'wiz','ウイズ':'wiz',
  'ルミナス':'luminas','ﾙﾐﾅｽ':'luminas',
  '茶屋':'chaya',
  'アサノ':'asano','ｱｻﾉ':'asano',
  '知立':'chiryu',
  '小牧':'komaki',
  '八事':'yagoto',
  '大森':'omori',
  '京都':'kyoto',
  '銀座':'ginza',
  '訪問':'houmon'
};

// 正翔会 clinic name -> id
const CLINIC_NAME_TO_ID_S = {
  'LL':'ll','ll':'ll',
  '南':'minami',
  '葵':'aoi',
  '安城':'anjo'
};

function pad(n){return String(n).padStart(2,'0');}

// ---------- Sheets API helpers ----------

async function fetchJson(url){
  const res = await fetch(url);
  if(!res.ok){
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body.slice(0,300)}`);
  }
  return await res.json();
}

async function getSheets(){
  // List all sheets (titles + sheetIds)
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets(properties(title,sheetId))&key=${API_KEY}`;
  const data = await fetchJson(url);
  return (data.sheets||[]).map(s=>({title:s.properties.title, sheetId:s.properties.sheetId}));
}

async function getSheetGrid(title){
  // Fetch one sheet's full grid with formatted values + background colors
  const range = encodeURIComponent(title);
  const fields = encodeURIComponent('sheets(data(rowData(values(formattedValue,effectiveFormat(backgroundColor)))))');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?ranges=${range}&includeGridData=true&fields=${fields}&key=${API_KEY}`;
  const data = await fetchJson(url);
  const sheet = (data.sheets||[])[0];
  if(!sheet || !sheet.data || !sheet.data[0]) return [];
  const rowData = sheet.data[0].rowData || [];
  return rowData.map(row=>{
    const values = row.values || [];
    return values.map(cell=>{
      const text = (cell.formattedValue||'').toString().trim();
      const bg = cell.effectiveFormat && cell.effectiveFormat.backgroundColor;
      const color = bg ? rgbToHex(bg) : null;
      return {text, color};
    });
  });
}

function rgbToHex(c){
  // c.red/green/blue are 0..1 floats (may be omitted if 0)
  const r = Math.round((c.red||0)*255);
  const g = Math.round((c.green||0)*255);
  const b = Math.round((c.blue||0)*255);
  return '#' + [r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
}

function isWhite(color){
  if(!color) return true;
  const m = color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
  if(!m) return false;
  const r = parseInt(m[1],16), g = parseInt(m[2],16), b = parseInt(m[3],16);
  return r>240 && g>240 && b>240;
}

// ---------- Extraction ----------

function extractMonth(title){
  const m = title.match(/(\d+)年(\d+)月/);
  if(!m) return null;
  return {year: 2000+parseInt(m[1]), month: parseInt(m[2])};
}

function buildColorMap(grid, nameToId){
  const map = {};
  for(let i=0;i<grid.length;i++){
    const row = grid[i];
    for(let j=0;j<row.length;j++){
      const cell = row[j];
      const id = nameToId[cell.text];
      if(id && cell.color && !isWhite(cell.color)){
        if(!map[cell.color]) map[cell.color] = id;
      }
    }
  }
  return map;
}

function decodeCell(cell, colorToClinic){
  if(!cell) return null;
  const t = cell.text;
  if(/有給|有休/.test(t)) return 'yukyu';
  if(/代休/.test(t)) return 'daikyu';
  if(/代出/.test(t)) return 'daishutsu';
  if(/休出|休日出/.test(t)) return 'kyushutsu';
  if(t === '休み' || t === '休') return 'yasumi';
  if(!cell.color || isWhite(cell.color)) return null;
  if(colorToClinic[cell.color]) return colorToClinic[cell.color];
  if(/休/.test(t)) return 'yasumi';
  return null;
}

function findHeaderRow(grid, nameToId){
  let bestIdx = -1, bestCount = 0;
  for(let i=0;i<Math.min(grid.length,8);i++){
    const row = grid[i];
    let c = 0;
    for(const cell of row){ if(nameToId[cell.text]) c++; }
    if(c > bestCount){ bestCount = c; bestIdx = i; }
  }
  return bestCount >= 3 ? bestIdx : -1;
}

function buildColMap(headerRow, nameToId){
  const m = {};
  for(let j=0;j<headerRow.length;j++){
    const id = nameToId[headerRow[j].text];
    if(id) m[j] = id;
  }
  return m;
}

function findDayCols(grid, startRow){
  const counts = {};
  for(let i=startRow;i<Math.min(grid.length,startRow+35);i++){
    const row = grid[i] || [];
    for(let j=0;j<row.length;j++){
      const t = (row[j]||{}).text || '';
      const n = parseInt(t,10);
      if(!isNaN(n) && n>=1 && n<=31 && String(n)===t){
        counts[j] = (counts[j]||0) + 1;
      }
    }
  }
  return Object.keys(counts).filter(k=>counts[k]>=5).map(Number).sort((a,b)=>a-b);
}

function pickDayCol(dayCols, colMap){
  const docCols = Object.keys(colMap).map(Number);
  if(docCols.length === 0 || dayCols.length === 0) return -1;
  const minD = Math.min(...docCols);
  const maxD = Math.max(...docCols);
  let best = -1, bestDist = Infinity;
  for(const d of dayCols){
    let dist;
    if(d < minD) dist = minD - d;
    else if(d > maxD) dist = d - maxD;
    else dist = 1;
    if(dist < bestDist){ bestDist = dist; best = d; }
  }
  return best;
}

function extractGroup(grid, nameToDoctor, colorToClinic){
  const headerIdx = findHeaderRow(grid, nameToDoctor);
  if(headerIdx < 0) return null;
  const colMap = buildColMap(grid[headerIdx], nameToDoctor);
  const dayCols = findDayCols(grid, headerIdx+1);
  const dayCol = pickDayCol(dayCols, colMap);
  if(dayCol < 0) return null;
  const days = {};
  for(let i=headerIdx+1;i<grid.length;i++){
    const row = grid[i] || [];
    const dt = (row[dayCol]||{}).text || '';
    const day = parseInt(dt,10);
    if(isNaN(day) || day<1 || day>31 || String(day)!==dt) continue;
    const entries = [];
    for(const colIdx of Object.keys(colMap)){
      const cell = row[colIdx];
      const id = decodeCell(cell, colorToClinic);
      if(id) entries.push({docId: colMap[colIdx], clinicId: id});
    }
    days[day] = entries;
  }
  return {days};
}

// ---------- index.html update (SAFE MODE) ----------

function updateExcelDataS(html, monthYearMap){
  const m = html.match(/var EXCEL_DATA_S = \(function\(\)\{\s*var raw = \[([\s\S]*?)\];/);
  if(!m) throw new Error('EXCEL_DATA_S block not found');
  const existing = {};
  const re = /'(\d{4}-\d{2}-\d{2})\|([^']*)'/g;
  let mm;
  while((mm = re.exec(m[1]))){ existing[mm[1]] = mm[2]; }
  let changed = 0;
  for(const ym of monthYearMap){
    for(const day of Object.keys(ym.data.days)){
      const key = `${ym.year}-${pad(ym.month)}-${pad(day)}`;
      const entries = ym.data.days[day];
      // SAFE: skip empty entries (don't delete)
      if(entries.length === 0) continue;
      const line = entries.map(e=>e.docId+':'+e.clinicId).join(',');
      if(existing[key] !== line){ existing[key] = line; changed++; }
    }
  }
  const keys = Object.keys(existing).sort();
  const body = keys.map(k=>`'${k}|${existing[k]}'`).join(',\n');
  const newBlock = `var EXCEL_DATA_S = (function(){\n  var raw = [\n${body}\n];`;
  return {html: html.replace(m[0], newBlock), changed};
}

function updateExcelData(html, monthYearMap){
  const m = html.match(/const EXCEL_DATA = (\{[\s\S]*?\});/);
  if(!m) throw new Error('EXCEL_DATA block not found');
  let existing;
  try { existing = JSON.parse(m[1]); }
  catch(e){ throw new Error('EXCEL_DATA JSON parse failed: '+e.message); }
  let changed = 0;
  for(const ym of monthYearMap){
    for(const day of Object.keys(ym.data.days)){
      const key = `${ym.year}-${pad(ym.month)}-${pad(day)}`;
      const entries = ym.data.days[day].map(e=>({docId:e.docId,clinicId:e.clinicId,memo:''}));
      // SAFE: skip empty entries (don't delete)
      if(entries.length === 0) continue;
      const oldStr = JSON.stringify(existing[key]||[]);
      const newStr = JSON.stringify(entries);
      if(oldStr !== newStr){ existing[key] = entries; changed++; }
    }
  }
  const sorted = {};
  Object.keys(existing).sort().forEach(k=>{ sorted[k] = existing[k]; });
  const newBlock = `const EXCEL_DATA = ${JSON.stringify(sorted)};`;
  return {html: html.replace(m[0], newBlock), changed};
}

// ---------- main ----------

async function main(){
  const indexPath = path.join(__dirname,'..','index.html');
  let html = fs.readFileSync(indexPath,'utf8');

  console.log('Fetching sheet list...');
  const sheets = await getSheets();
  const monthSheets = sheets.filter(s=>extractMonth(s.title));
  console.log(`Found ${monthSheets.length} month sheets`);

  // Fetch all month grids
  const fetched = [];
  for(const s of monthSheets){
    const ym = extractMonth(s.title);
    console.log(`Fetching ${s.title}...`);
    try {
      const grid = await getSheetGrid(s.title);
      fetched.push({title:s.title, ym, grid});
      console.log(`  rows: ${grid.length}`);
    } catch(e){
      console.error(`  FAIL: ${e.message}`);
    }
  }

  // Build global color maps from legends across all sheets
  const globalColorS = {};
  const globalColorD = {};
  for(const f of fetched){
    Object.assign(globalColorS, buildColorMap(f.grid, CLINIC_NAME_TO_ID_S));
    Object.assign(globalColorD, buildColorMap(f.grid, CLINIC_NAME_TO_ID_K));
  }
  console.log(`Color map: 正翔会 ${Object.keys(globalColorS).length}, 清翔会 ${Object.keys(globalColorD).length}`);

  const sResults = [];
  const dResults = [];
  for(const f of fetched){
    const sData = extractGroup(f.grid, NAME_TO_S, globalColorS);
    const dData = extractGroup(f.grid, NAME_TO_D, globalColorD);
    if(sData){
      const total = Object.values(sData.days).reduce((a,d)=>a+d.length,0);
      console.log(`  ${f.title} 正翔会: ${Object.keys(sData.days).length} days, ${total} entries`);
      sResults.push({year:f.ym.year, month:f.ym.month, data:sData});
    }
    if(dData){
      const total = Object.values(dData.days).reduce((a,d)=>a+d.length,0);
      console.log(`  ${f.title} 清翔会: ${Object.keys(dData.days).length} days, ${total} entries`);
      dResults.push({year:f.ym.year, month:f.ym.month, data:dData});
    }
  }

  let totalChanged = 0;
  if(sResults.length){
    const r = updateExcelDataS(html, sResults);
    html = r.html; totalChanged += r.changed;
    console.log(`正翔会 changes: ${r.changed}`);
  }
  if(dResults.length){
    const r = updateExcelData(html, dResults);
    html = r.html; totalChanged += r.changed;
    console.log(`清翔会 changes: ${r.changed}`);
  }
  console.log(`Total: ${totalChanged}`);
  if(totalChanged === 0){ console.log('No changes'); return; }
  fs.writeFileSync(indexPath, html, 'utf8');
  console.log('index.html updated');
}

main().catch(e=>{console.error(e); process.exit(1);});
