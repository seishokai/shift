// Sync script for both 清翔会 (EXCEL_DATA) and 正翔会 (EXCEL_DATA_S)
// Reads legend rows in the spreadsheet to build a dynamic color->clinic mapping per sheet.

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const PUBHTML = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ-k3oggMr8RmnfQp8B_M8afOLX5FQbBO7puwG3SUAb4rGVETSqYC8J-COVXKeIL2PI727e8sq4BsFh/pubhtml';

// 正翔会 doctor name -> id (cols 0-T)
const NAME_TO_S = {
  '大西':'s1','上之郷':'s2','大久保':'s3','田中':'s4',
  '伊藤':'s5','梅村':'s6','森':'s7','森脩':'s8',
  '竹村':'s9','若山':'s10','谷口':'s11','松清':'s12','後藤':'s13'
};

// 清翔会 doctor name -> id (cols U-BD)
const NAME_TO_D = {
  '小池':'d1','越知':'d2','荒木':'d3','山田':'d4','古田':'d5','原':'d6',
  '竹内':'d7','大西':'d8','田村':'d9','立松':'d10','武内':'d11','長谷':'d12',
  '永江':'d13','加藤':'d14','れみ':'d15','西村':'d16','鈴木':'d17','中山':'d18',
  '星野':'d19','綱島':'d20','網島':'d20','向田':'d21','鶴田':'d22','清水':'d23',
  '内藤':'d24','上野':'d25','珠里':'d26','小倉':'d27','浦野':'d28','土屋':'d29',
  '英':'d30','明石':'d31','太田':'d32','河野':'d33','青木':'d34','岩田':'d35'
};

// 清翔会 clinic-name (Japanese) -> id
const CLINIC_NAME_TO_ID_K = {
  'エスカ':'esca','ｴｽｶ':'esca',
  'アール':'r','ｱｰﾙ':'r','アール':'r',
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

// 正翔会 clinic-name -> id
const CLINIC_NAME_TO_ID_S = {
  'LL':'ll','ll':'ll',
  '南':'minami',
  '葵':'aoi',
  '安城':'anjo'
};

// Doctor name skip-set (closed-day columns / group headers)
const SKIP_NAMES = new Set([
  '岡崎','あおい','みなみ','安城','正翔会','清翔会','済翔会','休診日','日付','曜日',
  '日','月','火','水','木','金','土','','月日','スタッフ','+',null,undefined
]);

function pad(n){return String(n).padStart(2,'0');}

// Build CSS class -> background color from <style> blocks
function buildClassColorMap(html){
  const map = {};
  const styleBlocks = html.match(/<style[^>]*>([\s\S]*?)<\/style>/g) || [];
  for(const block of styleBlocks){
    const rules = block.match(/\.[a-zA-Z0-9_-]+\s*\{[^}]*\}/g) || [];
    for(const rule of rules){
      const cls = rule.match(/^\.([a-zA-Z0-9_-]+)/);
      const bg = rule.match(/background-color:\s*(#[0-9a-fA-F]{3,8}|rgb\([^)]+\))/);
      if(cls && bg) map[cls[1]] = normalizeColor(bg[1]);
    }
  }
  return map;
}

function normalizeColor(c){
  if(!c) return null;
  c = c.trim().toLowerCase();
  if(c.startsWith('#')){
    if(c.length === 4) c = '#' + c[1]+c[1] + c[2]+c[2] + c[3]+c[3];
    return c;
  }
  const m = c.match(/rgb\((\d+),\s*(\d+),\s*(\d+)/);
  if(m) return '#'+pad2(+m[1])+pad2(+m[2])+pad2(+m[3]);
  return c;
}
function pad2(n){return n.toString(16).padStart(2,'0');}

// Heuristic: white-ish == empty
function isWhite(color){
  if(!color) return true;
  const m = color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/);
  if(!m) return false;
  const r = parseInt(m[1],16), g = parseInt(m[2],16), b = parseInt(m[3],16);
  return r>240 && g>240 && b>240;
}

async function fetchText(url){
  const res = await fetch(url);
  if(!res.ok) throw new Error('HTTP '+res.status+' '+url);
  return await res.text();
}

async function getSheetList(){
  const html = await fetchText(PUBHTML);
  const items = [];
  const re = /(\d+)"\s*==\s*gid\)\}\)\s*;\s*items\.push\(\{\s*name:\s*"([^"]+)"/g;
  let mm;
  while((mm = re.exec(html))){
    items.push({gid: mm[1], name: mm[2]});
  }
  return items;
}

function extractMonth(name){
  const m = name.match(/(\d+)年(\d+)月/);
  if(!m) return null;
  return {year: 2000+parseInt(m[1]), month: parseInt(m[2])};
}

// Parse a sheet: returns {grid:[][], classColor:{}}
function parseSheet(html){
  const classColor = buildClassColorMap(html);
  const $ = cheerio.load(html);
  const trs = $('table tr').toArray();
  const grid = trs.map(tr=>{
    return $(tr).find('td').toArray().map(td=>{
      const text = $(td).text().trim();
      const cls = ($(td).attr('class')||'').split(/\s+/);
      let color = null;
      for(const c of cls){ if(classColor[c]){ color = classColor[c]; break; } }
      return {text, color};
    });
  });
  return {grid, classColor};
}

// Build color->clinicId map by scanning legend area for cells whose text matches a known clinic name
function buildColorMap(grid, nameToId){
  const map = {};
  for(let i=0;i<grid.length;i++){
    const row = grid[i];
    for(let j=0;j<row.length;j++){
      const cell = row[j];
      const id = nameToId[cell.text];
      if(id && cell.color && !isWhite(cell.color)){
        // first occurrence wins (legend usually appears once)
        if(!map[cell.color]) map[cell.color] = id;
      }
    }
  }
  return map;
}

// Decode cell -> clinic/status id
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

// Find header row index (the row that contains many doctor names)
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

// Build colIndex -> doctorId from header row
function buildColMap(headerRow, nameToId){
  const m = {};
  for(let j=0;j<headerRow.length;j++){
    const id = nameToId[headerRow[j].text];
    if(id) m[j] = id;
  }
  return m;
}

// Find ALL day-candidate columns across the full width
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

// Pick the day column nearest to the median doctor column for the group
function pickDayCol(dayCols, colMap){
  const docCols = Object.keys(colMap).map(Number);
  if(docCols.length === 0 || dayCols.length === 0) return -1;
  const minD = Math.min(...docCols);
  const maxD = Math.max(...docCols);
  // Prefer day col immediately before the leftmost doctor col, but not too far
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

function extractGroupWithMap(grid, nameToDoctor, colorToClinic){
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

// ========== index.html update ==========

function updateExcelDataS(html, monthYearMap){
  // Compact format
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
      if(entries.length === 0){
        if(existing[key]){ delete existing[key]; changed++; }
        continue;
      }
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
  // JSON format on a single line: const EXCEL_DATA = {...};
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
      if(entries.length === 0){
        if(existing[key]){ delete existing[key]; changed++; }
        continue;
      }
      const oldStr = JSON.stringify(existing[key]||[]);
      const newStr = JSON.stringify(entries);
      if(oldStr !== newStr){ existing[key] = entries; changed++; }
    }
  }
  // Sort keys for stable diff
  const sorted = {};
  Object.keys(existing).sort().forEach(k=>{ sorted[k] = existing[k]; });
  const newBlock = `const EXCEL_DATA = ${JSON.stringify(sorted)};`;
  return {html: html.replace(m[0], newBlock), changed};
}

async function main(){
  const indexPath = path.join(__dirname,'..','index.html');
  let html = fs.readFileSync(indexPath,'utf8');

  const sheets = await getSheetList();
  console.log('Sheets:', sheets.length);

  // First pass: fetch all sheets, build global color->clinic maps
  const fetched = [];
  for(const s of sheets){
    const ym = extractMonth(s.name);
    if(!ym) continue;
    const sheetUrl = `https://docs.google.com/spreadsheets/d/e/2PACX-1vQ-k3oggMr8RmnfQp8B_M8afOLX5FQbBO7puwG3SUAb4rGVETSqYC8J-COVXKeIL2PI727e8sq4BsFh/pubhtml/sheet?headers=false&gid=${s.gid}`;
    try {
      const sheetHtml = await fetchText(sheetUrl);
      const parsed = parseSheet(sheetHtml);
      fetched.push({name:s.name, ym, grid: parsed.grid});
    } catch(e){
      console.error(`Fetch failed ${s.name}: ${e.message}`);
    }
  }
  // Build global color maps by merging legends from all sheets
  const globalColorS = {};
  const globalColorD = {};
  for(const f of fetched){
    Object.assign(globalColorS, buildColorMap(f.grid, CLINIC_NAME_TO_ID_S));
    Object.assign(globalColorD, buildColorMap(f.grid, CLINIC_NAME_TO_ID_K));
  }
  console.log(`Global 正翔会 color map: ${Object.keys(globalColorS).length} colors`);
  console.log(`Global 清翔会 color map: ${Object.keys(globalColorD).length} colors`);

  const sResults = [];
  const dResults = [];
  for(const f of fetched){
    const {ym, grid} = f;
    console.log(`Processing ${f.name}`);
    try {
      const sData = extractGroupWithMap(grid, NAME_TO_S, globalColorS);
      const dData = extractGroupWithMap(grid, NAME_TO_D, globalColorD);

      if(sData){
        console.log(`  正翔会: ${Object.keys(sData.days).length} days`);
        sResults.push({year:ym.year, month:ym.month, data:sData});
      }
      if(dData){
        console.log(`  清翔会: ${Object.keys(dData.days).length} days`);
        dResults.push({year:ym.year, month:ym.month, data:dData});
      }
    } catch(e){
      console.error(`  Failed: ${e.message}`);
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
  console.log(`Total changes: ${totalChanged}`);
  if(totalChanged === 0){ console.log('No changes'); return; }
  fs.writeFileSync(indexPath, html, 'utf8');
  console.log('index.html updated');
}

main().catch(e=>{console.error(e); process.exit(1);});
