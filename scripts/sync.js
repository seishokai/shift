// Sync script for 正翔会 shift data
// Fetches Google Sheets pubhtml, extracts shifts by CSS-class background colors,
// merges into index.html EXCEL_DATA_S block.

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const PUBHTML = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ-k3oggMr8RmnfQp8B_M8afOLX5FQbBO7puwG3SUAb4rGVETSqYC8J-COVXKeIL2PI727e8sq4BsFh/pubhtml';

const NAME_TO_ID = {
  '大西':'s1','上之郷':'s2','大久保':'s3','田中':'s4',
  '伊藤':'s5','梅村':'s6','森':'s7','森脩':'s8',
  '竹村':'s9','若山':'s10','谷口':'s11','松清':'s12','後藤':'s13'
};

function pad(n){return String(n).padStart(2,'0');}

// Extract color from CSS class rules
function buildClassColorMap(html){
  const map = {};
  const styleBlocks = html.match(/<style[^>]*>([\s\S]*?)<\/style>/g) || [];
  for(const block of styleBlocks){
    // match: .s0{...background-color:#xxxxxx...}
    const rules = block.match(/\.[a-zA-Z0-9_-]+\s*\{[^}]*\}/g) || [];
    for(const rule of rules){
      const cls = rule.match(/^\.([a-zA-Z0-9_-]+)/);
      const bg = rule.match(/background-color:\s*(#[0-9a-fA-F]{6}|rgb\([^)]+\))/);
      if(cls && bg) map[cls[1]] = bg[1];
    }
  }
  return map;
}

function colorToClinic(color, text){
  if(!color) return null;
  if(/有給|有休/.test(text)) return 'yukyu';
  let r,g,b;
  const hex = color.match(/^#([0-9a-fA-F]{6})$/);
  if(hex){
    r = parseInt(hex[1].substr(0,2),16);
    g = parseInt(hex[1].substr(2,2),16);
    b = parseInt(hex[1].substr(4,2),16);
  } else {
    const m = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if(!m) return null;
    r=+m[1]; g=+m[2]; b=+m[3];
  }
  if(r>240 && g>240 && b>240) return null; // white
  if(r>200 && g<80 && b<80) return 'anjo';
  if(r>200 && g>200 && b<80) return 'minami';
  if(b>150 && r<100) return 'll';
  if(b>200 && g>100 && r<80) return 'll';
  if(r>150 && g>80 && g<140 && b<80) return 'aoi';
  if(text && /休/.test(text)) return 'yasumi';
  return null;
}

async function fetchText(url){
  const res = await fetch(url);
  if(!res.ok) throw new Error('HTTP '+res.status+' '+url);
  return await res.text();
}

async function getSheetList(){
  const html = await fetchText(PUBHTML);
  const items = [];
  // pubhtml embeds JS like: ...(GID" == gid)});items.push({name: "NAME", pageUrl: "..."
  const re = /(\d+)"\s*==\s*gid\)\}\)\s*;\s*items\.push\(\{\s*name:\s*"([^"]+)"/g;
  let mm;
  while((mm = re.exec(html))){
    items.push({gid: mm[1], name: mm[2]});
  }
  return items;
}

function extractMonth(name){
  // "26年7月" → 07
  const m = name.match(/(\d+)年(\d+)月/);
  if(!m) return null;
  return {year: 2000+parseInt(m[1]), month: parseInt(m[2])};
}

async function extractSheet(gid){
  const url = `https://docs.google.com/spreadsheets/d/e/2PACX-1vQ-k3oggMr8RmnfQp8B_M8afOLX5FQbBO7puwG3SUAb4rGVETSqYC8J-COVXKeIL2PI727e8sq4BsFh/pubhtml/sheet?headers=false&gid=${gid}`;
  const html = await fetchText(url);
  const classColor = buildClassColorMap(html);
  const $ = cheerio.load(html);
  const rows = $('table tr').toArray();
  if(rows.length < 4) return [];

  // header row index 2
  const headerCells = $(rows[2]).find('td').toArray();
  const colMap = {};
  for(let j=0;j<headerCells.length;j++){
    const name = $(headerCells[j]).text().trim();
    if(NAME_TO_ID[name]) colMap[j] = NAME_TO_ID[name];
  }

  const results = [];
  for(let i=4;i<rows.length;i++){
    const cells = $(rows[i]).find('td').toArray();
    const dayText = cells[1] ? $(cells[1]).text().trim() : '';
    const day = parseInt(dayText);
    if(!day || isNaN(day)) continue;

    const entries = [];
    for(const colIdx of Object.keys(colMap)){
      const cell = cells[colIdx];
      if(!cell) continue;
      const text = $(cell).text().trim();
      const cls = ($(cell).attr('class')||'').split(/\s+/);
      let color = null;
      for(const c of cls){ if(classColor[c]){ color = classColor[c]; break; } }
      const clinic = colorToClinic(color, text);
      if(clinic) entries.push(colMap[colIdx]+':'+clinic);
    }
    if(entries.length){
      results.push({day, line:''});
      results[results.length-1].line = entries.join(',');
    }
  }
  return results;
}

function parseExistingData(html){
  // returns { 'YYYY-MM-DD': 'entries' }
  const m = html.match(/var EXCEL_DATA_S = \(function\(\)\{\s*var raw = \[([\s\S]*?)\];/);
  if(!m) throw new Error('EXCEL_DATA_S block not found');
  const data = {};
  const re = /'(\d{4}-\d{2}-\d{2})\|([^']*)'/g;
  let mm;
  while((mm = re.exec(m[1]))){
    data[mm[1]] = mm[2];
  }
  return {data, blockStart: m.index, blockFull: m[0], rawBody: m[1]};
}

function serializeData(data){
  const keys = Object.keys(data).sort();
  return keys.map(k=>`    '${k}|${data[k]}'`).join(',\n');
}

async function main(){
  const indexPath = path.join(__dirname,'..','index.html');
  const html = fs.readFileSync(indexPath,'utf8');
  const existing = parseExistingData(html);

  const sheets = await getSheetList();
  console.log('Sheets found:', sheets.length);

  let changed = 0;
  for(const s of sheets){
    const ym = extractMonth(s.name);
    if(!ym) continue;
    console.log(`Processing ${s.name} (gid=${s.gid})`);
    try {
      const rows = await extractSheet(s.gid);
      for(const r of rows){
        const key = `${ym.year}-${pad(ym.month)}-${pad(r.day)}`;
        if(existing.data[key] !== r.line){
          existing.data[key] = r.line;
          changed++;
        }
      }
    } catch(e){
      console.error(`Failed ${s.name}:`, e.message);
    }
  }

  console.log(`Changed entries: ${changed}`);
  if(changed === 0){
    console.log('No changes');
    return;
  }

  const newBody = '\n'+serializeData(existing.data)+'\n  ';
  const newBlock = `var EXCEL_DATA_S = (function(){\n  var raw = [${newBody}];`;
  const newHtml = html.replace(existing.blockFull, newBlock);
  fs.writeFileSync(indexPath, newHtml, 'utf8');
  console.log('index.html updated');
}

main().catch(e=>{console.error(e); process.exit(1);});
