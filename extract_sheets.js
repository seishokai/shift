const { JSDOM } = require('jsdom');
const fs = require('fs');

const BASE = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ-k3oggMr8RmnfQp8B_M8afOLX5FQbBO7puwG3SUAb4rGVETSqYC8J-COVXKeIL2PI727e8sq4BsFh/pubhtml';
const SHEETS = [
  {gid:'268297603', year:2026, month:4},
  {gid:'2037248363', year:2026, month:5},
  {gid:'1824842710', year:2026, month:6},
  {gid:'1805706624', year:2026, month:7}
];
const NI={'小池':'d1','越知':'d2','荒木':'d3','山田':'d4','古田':'d5','原':'d6','竹内':'d7','大西':'d8','田村':'d9','立松':'d10','武内':'d11','長谷':'d12','永江':'d13','加藤':'d14','れみ':'d15','西村':'d16','鈴木':'d17','中山':'d18','星野':'d19','綱島':'d20','向田':'d21','鶴田':'d22','清水':'d23','内藤':'d24','上野':'d25','珠里':'d26','小倉':'d27','浦野':'d28','土屋':'d29','英':'d30','明石':'d31','太田':'d32','河野':'d33','青木':'d34','岩田':'d35'};
const CM={'#006411':'esca','#006011':'esca','#006511':'esca','#7030a0':'r','#ff99ff':'wiz','#ff0066':'luminas','#0000cc':'chaya','#85200c':'asano','#00ff00':'chiryu','#00ffff':'komaki','#ffcc99':'yagoto','#b4a7d6':'omori','#ffff00':'kyoto','#434343':'ginza','#000000':'houmon'};
const TS={'休み':'yasumi','有給':'yukyu','代休':'daikyu','産休':'yasumi'};

function rgbH(rgb){
  if(!rgb||rgb==='transparent')return null;
  if(rgb[0]==='#')return rgb.toLowerCase();
  var m=rgb.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if(!m)return null;
  return '#'+((1<<24)+(+m[1]<<16)+(+m[2]<<8)+ +m[3]).toString(16).slice(1);
}
function hexCl(h){
  if(!h)return null;if(CM[h])return CM[h];
  var r1=parseInt(h.slice(1,3),16),g1=parseInt(h.slice(3,5),16),b1=parseInt(h.slice(5,7),16);
  for(var k in CM){var r2=parseInt(k.slice(1,3),16),g2=parseInt(k.slice(3,5),16),b2=parseInt(k.slice(5,7),16);
    if(Math.abs(r1-r2)<30&&Math.abs(g1-g2)<30&&Math.abs(b1-b2)<30)return CM[k];}
  return null;
}

function parseTable(table, cc, year, month) {
  const rows = table.querySelectorAll('tr');
  console.log('  Found table with ' + rows.length + ' rows');
  let nameRow = -1; const colToDoc = {}; let dayCol = -1;
  /* 休診日セクション検出用 */
  let kyushinCol = -1; let kyushinDateCol = -1; let kyushinColorCols = [];
  for(let i = 0; i < Math.min(5, rows.length); i++) {
    const cells = rows[i].querySelectorAll('td');
    let ci = 0; const tmp = {};
    /* 「清翔会」ラベルの位置を探す */
    let seishoStart = -1;
    for(let j = 0; j < cells.length; j++) {
      const cs = parseInt(cells[j].colSpan) || 1;
      const tx = (cells[j].textContent||'').trim();
      if(tx === '清翔会') seishoStart = ci + cs;
      if(tx === '休診日') kyushinCol = ci;
      if(NI[tx] && (seishoStart < 0 || ci >= seishoStart)) { tmp[ci] = tx; }
      ci += cs;
    }
    /* 清翔会ラベルがあればその後のドクターだけ使う */
    let filtered = tmp;
    if(seishoStart >= 0) {
      filtered = {};
      for(const [col, name] of Object.entries(tmp)) {
        if(parseInt(col) >= seishoStart) filtered[col] = name;
      }
    }
    const n = Object.keys(filtered).length;
    if(n >= 10) { nameRow = i; Object.assign(colToDoc, filtered); dayCol = Math.min(...Object.keys(filtered).map(Number)) - 2; break; }
  }
  if(nameRow < 0) { console.log('  Doctor names not found'); return { shifts:{}, closedDates:{} }; }
  console.log('  Found ' + Object.keys(colToDoc).length + ' doctors, dayCol=' + dayCol);
  /* 休診日セクション: 列→医院マッピングを構築 */
  const kyushinColMap = {}; /* col番号 → clinicId */
  if(kyushinCol >= 0) {
    console.log('  Found 休診日 section at col ' + kyushinCol);
    /* 休診日ヘッダーから数行以内のデータ行で、各列の背景色から医院を特定 */
    /* まず最初の数データ行をスキャンして列の色パターンを収集 */
    const colColors = {}; /* col => {color: count} */
    for(let sr = nameRow + 1; sr < Math.min(nameRow + 40, rows.length); sr++) {
      const scl = rows[sr].querySelectorAll('td');
      let sci = 0;
      for(let sj = 0; sj < scl.length; sj++) {
        const scs = parseInt(scl[sj].colSpan) || 1;
        if(sci > kyushinCol + 1) { /* 日付・曜日列の後 */
          const sCls = (scl[sj].className||'').replace('freezebar-cell','').trim().split(/\s+/);
          let sBg = null;
          for(const sc of sCls) { const clr = cc[sc]; if(clr) { sBg = rgbH(clr); break; } }
          if(sBg && sBg !== '#ffffff') {
            if(!colColors[sci]) colColors[sci] = {};
            colColors[sci][sBg] = (colColors[sci][sBg]||0) + 1;
          }
        }
        sci += scs;
      }
    }
    /* 各列で最頻出の色をその列の医院として登録 */
    for(const [col, colors] of Object.entries(colColors)) {
      const topColor = Object.entries(colors).sort((a,b)=>b[1]-a[1])[0];
      if(topColor) {
        const cid = hexCl(topColor[0]);
        if(cid) {
          kyushinColMap[col] = cid;
          console.log('    休診日col '+col+' => '+cid+' ('+topColor[0]+', '+topColor[1]+'件)');
        }
      }
    }
  }
  let ds = nameRow + 1;
  for(let dr = ds; dr < rows.length; dr++) {
    const fc = rows[dr].querySelector('td');
    if(fc && (fc.className||'').includes('freezebar')) ds = dr + 1; else break;
  }
  const R = {}; const mxD = new Date(year, month, 0).getDate();
  const closedDates = {}; /* { "2026-06-07": ["esca","r"], ... } */
  let foundDay1 = false; /* 1日が出現したかどうか */
  for(let dr = ds; dr < ds + mxD + 10; dr++) {
    if(dr >= rows.length) break;
    const cl = rows[dr].querySelectorAll('td');
    let ci = 0, dn = ''; const sh = [];
    /* 休診日セクションの色付きセルを収集 */
    const closedClinics = [];
    for(let j = 0; j < cl.length; j++) {
      const cs = parseInt(cl[j].colSpan) || 1;
      if(ci === dayCol) dn = (cl[j].textContent||'').trim();
      if(colToDoc[ci]) {
        const cellCls = (cl[j].className||'').replace('freezebar-cell','').trim().split(/\s+/);
        let bgHex = null;
        for(const c of cellCls) { const clr = cc[c]; if(clr) { bgHex = rgbH(clr); break; } }
        const tx = (cl[j].textContent||'').trim();
        const di = NI[colToDoc[ci]];
        let ci2 = null;
        if(tx && TS[tx]) ci2 = TS[tx];
        else if(tx === '訪問1' || tx === '訪問2') ci2 = 'houmon';
        else if(bgHex && bgHex !== '#ffffff') ci2 = hexCl(bgHex);
        if(ci2 && di) {
          let memo = '';
          if(tx === '＋') memo = '＋'; else if(tx === '訪問1') memo = '訪問1'; else if(tx === '訪問2') memo = '訪問2';
          sh.push({docId:di, clinicId:ci2, memo});
        }
      }
      /* 休診日セクション: 列マッピングで医院を特定、色付きなら休診 */
      if(kyushinCol >= 0 && kyushinColMap[ci]) {
        const cellCls2 = (cl[j].className||'').replace('freezebar-cell','').trim().split(/\s+/);
        let bgH2 = null;
        for(const c of cellCls2) { const clr = cc[c]; if(clr) { bgH2 = rgbH(clr); break; } }
        if(bgH2 && bgH2 !== '#ffffff') {
          const cid = kyushinColMap[ci];
          if(!closedClinics.includes(cid)) closedClinics.push(cid);
        }
      }
      ci += cs;
    }
    const d = parseInt(dn);
    if(d === 1) foundDay1 = true;
    /* 1日が出現する前の行は前月データなのでスキップ */
    if(!foundDay1) continue;
    /* 1日出現後に日付が前月に戻ったら（翌月の1日等）終了 */
    if(foundDay1 && d === 1 && Object.keys(R).length > 0) break;
    if(d >= 1 && d <= mxD) {
      const dateStr = year+'-'+String(month).padStart(2,'0')+'-'+String(d).padStart(2,'0');
      if(sh.length > 0) R[dateStr] = sh;
      if(closedClinics.length > 0) closedDates[dateStr] = closedClinics;
    }
  }
  return { shifts: R, closedDates };
}

async function fetchAndParse(url) {
  const resp = await fetch(url, {redirect:'follow'});
  const html = await resp.text();
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const cc = {};
  doc.querySelectorAll('style').forEach(s => {
    const re = /\.(s\d+)\s*\{[^}]*background-color:\s*([^;]+)/g; let m;
    while((m = re.exec(s.textContent)) !== null) cc[m[1]] = m[2].trim();
  });
  return { doc, cc, html };
}

async function extractSheet(gid, year, month) {
  console.log('Fetching ' + year + '/' + month + '...');
  // Try widget URL first (direct table content)
  const widgetUrl = BASE + '/sheet?headers=false&gid=' + gid;
  let { doc, cc, html } = await fetchAndParse(widgetUrl);
  let table = doc.querySelector('table');
  if(!table) {
    // Try the main page and extract iframe
    console.log('  Widget URL has no table, trying main page...');
    const mainResult = await fetchAndParse(BASE + '?gid=' + gid + '&single=true');
    // Look for iframe
    const iframe = mainResult.doc.querySelector('iframe');
    if(iframe && iframe.src) {
      let iframeSrc = iframe.src;
      if(iframeSrc.startsWith('/')) iframeSrc = 'https://docs.google.com' + iframeSrc;
      console.log('  Found iframe, fetching...');
      const iResult = await fetchAndParse(iframeSrc);
      table = iResult.doc.querySelector('table');
      cc = {...cc, ...iResult.cc};
    }
  }
  if(!table) { console.log('  No table found'); return { shifts:{}, closedDates:{} }; }
  return parseTable(table, cc, year, month);
}

async function main() {
  const allData = {};
  const allClosed = {};
  for(const s of SHEETS) {
    const result = await extractSheet(s.gid, s.year, s.month);
    Object.assign(allData, result.shifts);
    Object.assign(allClosed, result.closedDates);
    const total = Object.values(result.shifts).reduce((sum, a) => sum + a.length, 0);
    const closedCount = Object.keys(result.closedDates).length;
    console.log('  => ' + Object.keys(result.shifts).length + ' days, ' + total + ' shifts, ' + closedCount + ' closed-day entries\n');
  }
  fs.writeFileSync('all_shifts.json', JSON.stringify(allData));
  fs.writeFileSync('all_closed.json', JSON.stringify(allClosed));
  const grandTotal = Object.values(allData).reduce((sum, a) => sum + a.length, 0);
  console.log('TOTAL: ' + Object.keys(allData).length + ' days, ' + grandTotal + ' shifts');
  console.log('CLOSED_DATES: ' + Object.keys(allClosed).length + ' entries');
  if(Object.keys(allData).length > 0) {
    const html = fs.readFileSync('index.html', 'utf-8');
    const lines = html.split('\n');
    for(let i = 0; i < lines.length; i++) {
      if(lines[i].startsWith('const EXCEL_DATA = ')) {
        lines[i] = 'const EXCEL_DATA = ' + JSON.stringify(allData) + ';';
      }
      if(lines[i].startsWith('const CLOSED_DATES = ')) {
        lines[i] = 'const CLOSED_DATES = ' + JSON.stringify(allClosed) + ';';
      }
    }
    fs.writeFileSync('index.html', lines.join('\n'), 'utf-8');
    console.log('Updated EXCEL_DATA and CLOSED_DATES in index.html');
  }
}
main().catch(e => console.error(e));
