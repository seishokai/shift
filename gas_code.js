/* ===== 定数 ===== */
var CLINIC_LIST = ['ｴｽｶ','ｱｰﾙ','ｳｨｽﾞ','ﾙﾐﾅｽ','茶屋','知立','小牧','八事','大森','京都','銀座','ｱｻﾉ','八事1','八事2','訪1','訪2','東員','休み','有給','代休','代出','希望休'];
var DOW = ['日','月','火','水','木','金','土'];
var COLORS = {
  'ｴｽｶ':'#c0392b','ｱｰﾙ':'#7030a0','ｳｨｽﾞ':'#1e8449','ﾙﾐﾅｽ':'#27ae60',
  '茶屋':'#d4a017','ｱｻﾉ':'#85200c','知立':'#0a6b8a','小牧':'#d81b60',
  '八事':'#8b4513','八事1':'#9b6b3a','八事2':'#a0522d','大森':'#1f6b4e',
  '京都':'#6b3a87','銀座':'#7d6608','訪1':'#2c6e8a','訪2':'#4a9bb5',
  '訪問':'#2c6e8a','東員':'#b85c00',
  '休み':'#999999','有給':'#e53935','代休':'#1a5276','代出':'#555555',
  '希望休':'#7b2d8b','出勤希望':'#2e7d32'
};
var CLINIC_NAMES = ['ｴｽｶ','ｱｰﾙ','ｳｨｽﾞ','ﾙﾐﾅｽ','茶屋','知立','小牧','八事','大森','京都','銀座','ｱｻﾉ','八事1','八事2','訪1','訪2','東員'];
var DOC_NAMES = ['越知','荒木','山田','古田','原','竹内','大西','田村','立松','武内','長谷川','永江','れみ','西村','鈴木','星野','綱島','向田','清水','内藤','上野','珠里','土屋','青木','小倉','河野','英','中山','加藤','小池','太田','鶴田','木村','浦野','明石'];
var DIRECTORS = {'越知':'ｴｽｶ','荒木':'茶屋','山田':'ﾙﾐﾅｽ','古田':'ｱｰﾙ','原':'ｳｨｽﾞ','竹内':'小牧','大西':'知立','田村':'八事','中山':'京都','加藤':'大森','小池':'銀座'};
var CLOSED_WEEKDAY = {'小牧':2,'知立':3,'京都':4,'大森':4,'茶屋':4,'東員':0};

function onOpen() {
  SpreadsheetApp.getUi().createMenu('シフト管理')
    .addItem('📅 月シートを作成（自動反映付き）', 'createMonthSheet')
    .addItem('📝 シフト希望を反映', 'applyRequests')
    .addItem('👨‍⚕️ 院長を自動配置', 'autoFillDirectors')
    .addItem('📋 前月コピー', 'copyFromPrevMonth')
    .addItem('🎨 色を再適用', 'recolorCurrentSheet')
    .addItem('📊 医院別サマリー', 'createClinicSummary')
    .addItem('⚠️ エラーチェック', 'checkErrors')
    .addToUi();
}

function onEdit(e) {
  var range = e.range;
  if (range.getRow() < 2 || range.getColumn() < 2) return;
  var val = range.getValue();
  var oldVal = e.oldValue || '';
  if (['希望休','有給','代休'].indexOf(oldVal.toString().trim()) >= 0 && val !== oldVal) {
    range.setValue(oldVal);
    if (COLORS[oldVal]) range.setBackground(COLORS[oldVal]).setFontColor('#fff').setFontWeight('bold');
    SpreadsheetApp.getActiveSpreadsheet().toast(oldVal + ' is protected. Delete first.', '⚠️', 3);
    return;
  }
  if (!val) { range.setBackground(null).setFontColor('#000').setFontWeight('normal'); return; }
  val = val.toString().trim();
  if (COLORS[val]) range.setBackground(COLORS[val]).setFontColor('#fff').setFontWeight('bold');
  else range.setBackground(null).setFontColor('#000').setFontWeight('normal');
}

function makeRow(cols) { var r = []; for (var i = 0; i < cols; i++) r.push(''); return r; }
function toDateStr(val) {
  if (!val) return '';
  if (val instanceof Date) { return val.getFullYear() + '-' + String(val.getMonth()+1).padStart(2,'0') + '-' + String(val.getDate()).padStart(2,'0'); }
  return val.toString().trim();
}
function isClosedDay(cn, y, mn, d) {
  var w = new Date(y, mn-1, d).getDay(), closed = false;
  Object.keys(CLOSED_WEEKDAY).forEach(function(c) { if (cn === c && CLOSED_WEEKDAY[c] === w) closed = true; });
  if (w === 0 && cn === '東員') closed = true;
  if (w === 0) {
    var wk = Math.round((new Date(y, mn-1, d) - new Date(2026, 5, 7)) / (7*864e5));
    if (((wk%2)+2)%2===0 && (cn==='ｴｽｶ'||cn==='ｱｰﾙ')) closed = true;
    if (((wk%2)+2)%2!==0 && (cn==='ｳｨｽﾞ'||cn==='ﾙﾐﾅｽ'||cn==='大森')) closed = true;
  }
  return closed;
}

/* ===== vertical month sheet (row=date, col=doctor) ===== */
function createMonthSheet() {
  var ui = SpreadsheetApp.getUi();
  var result = ui.prompt('Enter month (e.g. 2026-07)');
  if (result.getSelectedButton() !== ui.Button.OK) return;
  var month = result.getResponseText().trim();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var year = parseInt(month.split('-')[0]), mon = parseInt(month.split('-')[1]);
  var days = new Date(year, mon, 0).getDate(), totalCols = DOC_NAMES.length + 1;
  var sheet = ss.getSheetByName(month);
  if (!sheet) sheet = ss.insertSheet(month);
  sheet.clear();
  var hdr = ['日付']; DOC_NAMES.forEach(function(n) { hdr.push(n); });
  var allRows = [hdr];
  for (var d = 1; d <= days; d++) {
    var row = [d + '(' + DOW[new Date(year, mon-1, d).getDay()] + ')'];
    for (var c = 0; c < DOC_NAMES.length; c++) row.push('');
    allRows.push(row);
  }
  allRows.push(makeRow(totalCols));
  var cntIdx = allRows.length;
  CLINIC_NAMES.forEach(function(cn) {
    var row = ['【' + cn + '】'];
    for (var c = 0; c < DOC_NAMES.length; c++) row.push('');
    allRows.push(row);
  });
  sheet.getRange(1, 1, allRows.length, totalCols).setValues(allRows);
  for (var c = 0; c < DOC_NAMES.length; c++) {
    var cl = getColLetter(c + 2);
    for (var ci = 0; ci < CLINIC_NAMES.length; ci++) sheet.getRange(cntIdx + 1 + ci, c + 2).setFormula('=COUNTIF(' + cl + '2:' + cl + (days+1) + ',"' + CLINIC_NAMES[ci] + '")');
  }
  sheet.getRange(1, 1, 1, totalCols).setFontWeight('bold').setHorizontalAlignment('center').setBackground('#e0ddd6').setFontSize(9);
  sheet.setFrozenRows(1); sheet.setFrozenColumns(1); sheet.setColumnWidth(1, 60);
  for (var c = 2; c <= totalCols; c++) sheet.setColumnWidth(c, 48);
  for (var d = 1; d <= days; d++) {
    var w = new Date(year, mon-1, d).getDay();
    if (w === 0) { sheet.getRange(d+1, 1).setFontColor('#e05252').setBackground('#ffd6d6'); sheet.getRange(d+1, 2, 1, DOC_NAMES.length).setBackground('#fff5f5'); }
    else if (w === 6) { sheet.getRange(d+1, 1).setFontColor('#4a7fd4').setBackground('#d6e4ff'); sheet.getRange(d+1, 2, 1, DOC_NAMES.length).setBackground('#f0f5ff'); }
  }
  sheet.getRange(2, 2, days, DOC_NAMES.length).setHorizontalAlignment('center');
  sheet.getRange(1, 1, allRows.length, totalCols).setBorder(true, true, true, true, true, true, '#d0d0cc', SpreadsheetApp.BorderStyle.SOLID);
  if (cntIdx <= allRows.length) sheet.getRange(cntIdx, 1, 1, totalCols).setBackground('#e8f5e9').setFontWeight('bold').setFontColor('#2e7d32');
  sheet.getRange(2, 2, days, DOC_NAMES.length).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(CLINIC_LIST, true).setAllowInvalid(true).build());
  for (var d2 = 1; d2 <= days; d2++) {
    var cl2 = [];
    CLINIC_NAMES.forEach(function(cn) { if (isClosedDay(cn, year, mon, d2)) cl2.push(cn); });
    if (cl2.length) sheet.getRange(d2 + 1, 1).setNote('休診: ' + cl2.join(', '));
  }
  applyRequestsAuto(sheet, month, year, mon, days);
  autoFillDirectorsAuto(sheet, month, year, mon, days);
  createClinicSummaryAuto(ss, month, year, mon, days);
  ui.alert(month + ' done');
}

function applyRequests() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), ui = SpreadsheetApp.getUi();
  var sheet = ss.getActiveSheet(), month = sheet.getName();
  if (!/^\d{4}-\d{2}$/.test(month)) { ui.alert('Select a month sheet first'); return; }
  var year = parseInt(month.split('-')[0]), mon = parseInt(month.split('-')[1]);
  var days = new Date(year, mon, 0).getDate();
  var cnt = applyRequestsAuto(sheet, month, year, mon, days);
  ui.alert(cnt + ' requests applied');
}

function applyRequestsAuto(sheet, month, year, mon, days) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var reqSheet = ss.getSheetByName('シフト希望');
  if (!reqSheet) return 0;
  var reqData = reqSheet.getDataRange().getValues();
  var data = sheet.getDataRange().getValues();
  var hdr = data[0], cnt = 0;
  for (var i = 1; i < reqData.length; i++) {
    var docName = reqData[i][0], rawDate = reqData[i][1], type = reqData[i][2];
    if (!docName || !rawDate || !type) continue;
    var dateStr = toDateStr(rawDate);
    if (dateStr.indexOf(month) !== 0) continue;
    var day = parseInt(dateStr.split('-')[2]);
    if (!day || day < 1 || day > days) continue;
    var docCol = -1;
    for (var c = 1; c < hdr.length; c++) { if (hdr[c] && hdr[c].toString().trim() === docName.toString().trim()) { docCol = c; break; } }
    if (docCol < 0) continue;
    if (data[day] && data[day][docCol] && data[day][docCol].toString().trim()) continue;
    var value = type.toString().trim();
    sheet.getRange(day + 1, docCol + 1).setValue(value);
    if (COLORS[value]) sheet.getRange(day + 1, docCol + 1).setBackground(COLORS[value]).setFontColor('#fff').setFontWeight('bold');
    if (data[day]) data[day][docCol] = value;
    cnt++;
  }
  return cnt;
}

function autoFillDirectors() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var m = sheet.getName(), y = parseInt(m.split('-')[0]), mn = parseInt(m.split('-')[1]);
  var days = new Date(y, mn, 0).getDate();
  var cnt = autoFillDirectorsAuto(sheet, m, y, mn, days);
  SpreadsheetApp.getUi().alert(cnt + ' directors placed');
}

function autoFillDirectorsAuto(sheet, month, year, mon, days) {
  var data = sheet.getDataRange().getValues();
  var hdr = data[0], cnt = 0;
  for (var c = 1; c < hdr.length; c++) {
    var doc = hdr[c]; if (!doc || !DIRECTORS[doc]) continue;
    var cl = DIRECTORS[doc];
    for (var d = 1; d <= days; d++) {
      if (data[d] && data[d][c] && data[d][c].toString().trim()) continue;
      if (isClosedDay(cl, year, mon, d)) continue;
      sheet.getRange(d + 1, c + 1).setValue(cl);
      if (COLORS[cl]) sheet.getRange(d + 1, c + 1).setBackground(COLORS[cl]).setFontColor('#fff').setFontWeight('bold');
      if (data[d]) data[d][c] = cl;
      cnt++;
    }
  }
  return cnt;
}

function copyFromPrevMonth() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), ui = SpreadsheetApp.getUi();
  var sheet = ss.getActiveSheet(), m = sheet.getName();
  var y = parseInt(m.split('-')[0]), mn = parseInt(m.split('-')[1]);
  var pm = mn - 1, py = y; if (pm < 1) { pm = 12; py--; }
  var pn = py + '-' + String(pm).padStart(2, '0');
  var ps = ss.getSheetByName(pn);
  if (!ps) { ui.alert(pn + ' not found'); return; }
  if (ui.alert('Copy from ' + pn + '?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  var pd = ps.getDataRange().getValues(), cd = sheet.getDataRange().getValues();
  var days = new Date(y, mn, 0).getDate(), hdr = cd[0], phdr = pd[0], cnt = 0;
  for (var c = 1; c < hdr.length; c++) {
    var doc = hdr[c]; if (!doc) continue;
    var pc = -1;
    for (var pc2 = 1; pc2 < phdr.length; pc2++) { if (phdr[pc2] && phdr[pc2].toString().trim() === doc.toString().trim()) { pc = pc2; break; } }
    if (pc < 0) continue;
    var dp = {};
    for (var d = 1; d < pd.length; d++) {
      var v = pd[d][pc]; if (!v) continue; v = v.toString().trim(); if (!v) continue;
      var pday = parseInt(pd[d][0]); if (!pday) continue;
      var w = new Date(py, pm-1, pday).getDay();
      if (!dp[w]) dp[w] = {}; dp[w][v] = (dp[w][v] || 0) + 1;
    }
    for (var d = 1; d <= days; d++) {
      if (cd[d] && cd[d][c] && cd[d][c].toString().trim()) continue;
      var w = new Date(y, mn-1, d).getDay();
      if (!dp[w]) continue;
      var best = null, bc = 0;
      Object.keys(dp[w]).forEach(function(v) { if (dp[w][v] > bc) { best = v; bc = dp[w][v]; } });
      if (best) { sheet.getRange(d+1, c+1).setValue(best); if (COLORS[best]) sheet.getRange(d+1, c+1).setBackground(COLORS[best]).setFontColor('#fff').setFontWeight('bold'); cnt++; }
    }
  }
  ui.alert(cnt + ' copied');
}

function checkErrors() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getValues();
  var m = sheet.getName(), y = parseInt(m.split('-')[0]), mn = parseInt(m.split('-')[1]);
  var days = new Date(y, mn, 0).getDate(), hdr = data[0], errs = [];
  for (var c = 1; c < hdr.length; c++) {
    var doc = hdr[c]; if (!doc || doc.toString().indexOf('【') === 0) continue;
    var wd = 0;
    for (var d = 1; d <= days; d++) {
      var v = data[d] ? data[d][c] : null; if (!v) continue; v = v.toString().trim();
      if (['休み','有給','代休','希望休'].indexOf(v) >= 0) continue;
      wd++;
      if (isClosedDay(v, y, mn, d)) errs.push(doc + ' ' + d + ': ' + v + ' is closed');
    }
    if (wd > 25) errs.push(doc + ': ' + wd + ' days (too many?)');
    if (wd > 0 && wd < 8) errs.push(doc + ': ' + wd + ' days (too few?)');
  }
  SpreadsheetApp.getUi().alert(errs.length ? errs.length + ' errors:\n\n' + errs.slice(0, 20).join('\n') : 'No errors!');
}

function createClinicSummary() {
  var ui = SpreadsheetApp.getUi();
  var result = ui.prompt('Enter month (e.g. 2026-06)');
  if (result.getSelectedButton() !== ui.Button.OK) return;
  var month = result.getResponseText().trim();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var src = ss.getSheetByName(month);
  if (!src) { ui.alert(month + ' not found'); return; }
  var year = parseInt(month.split('-')[0]), mon = parseInt(month.split('-')[1]);
  var days = new Date(year, mon, 0).getDate();
  createClinicSummaryAuto(ss, month, year, mon, days);
  ui.alert(month + '_医院別 created');
}

function createClinicSummaryAuto(ss, month, year, mon, days) {
  var src = ss.getSheetByName(month);
  if (!src) return;
  var data = src.getDataRange().getValues();
  var hdr = data[0];
  var clinicOrder = ['ｴｽｶ','ｱｰﾙ','ｳｨｽﾞ','ﾙﾐﾅｽ','茶屋','小牧','知立','八事','大森','京都','銀座','ｱｻﾉ','八事1','八事2','訪1','訪2','東員'];
  var byClinic = {};
  clinicOrder.forEach(function(cn) { byClinic[cn] = {}; });
  for (var c = 1; c < hdr.length; c++) {
    var doc = hdr[c]; if (!doc || doc.toString().indexOf('【') === 0) continue;
    for (var d = 1; d <= days; d++) {
      if (!data[d]) continue;
      var v = data[d][c]; if (!v) continue; v = v.toString().trim();
      if (byClinic[v]) { if (!byClinic[v][d]) byClinic[v][d] = []; byClinic[v][d].push(doc.toString()); }
    }
  }
  var sn = month + '_医院別';
  var sheet = ss.getSheetByName(sn);
  if (!sheet) sheet = ss.insertSheet(sn);
  sheet.clear();
  var totalCols = 1 + clinicOrder.length * 2;
  var headerRow = ['日付'];
  clinicOrder.forEach(function(cn) { headerRow.push(cn); headerRow.push('members'); });
  var rows = [headerRow];
  for (var d = 1; d <= days; d++) {
    var w = new Date(year, mon-1, d).getDay();
    var row = [d + '(' + DOW[w] + ')'];
    clinicOrder.forEach(function(cn) {
      var docs = byClinic[cn][d] || [];
      var closed = isClosedDay(cn, year, mon, d);
      row.push(closed ? '休' : (docs.length || ''));
      row.push(closed ? '' : docs.join(', '));
    });
    rows.push(row);
  }
  sheet.getRange(1, 1, rows.length, totalCols).setValues(rows);
  sheet.getRange(1, 1, 1, totalCols).setFontWeight('bold').setHorizontalAlignment('center').setBackground('#e0ddd6').setFontSize(8);
  sheet.setFrozenRows(1); sheet.setFrozenColumns(1);
  sheet.setColumnWidth(1, 50);
  for (var c = 0; c < clinicOrder.length; c++) {
    var col1 = 2 + c * 2, col2 = 3 + c * 2;
    sheet.setColumnWidth(col1, 25); sheet.setColumnWidth(col2, 90);
    if (COLORS[clinicOrder[c]]) {
      sheet.getRange(1, col1).setBackground(COLORS[clinicOrder[c]]).setFontColor('#fff');
      sheet.getRange(1, col2).setBackground(COLORS[clinicOrder[c]]).setFontColor('#fff');
    }
  }
  for (var d = 1; d <= days; d++) {
    var w = new Date(year, mon-1, d).getDay();
    if (w === 0) sheet.getRange(d+1, 1).setFontColor('#e05252').setBackground('#ffd6d6');
    else if (w === 6) sheet.getRange(d+1, 1).setFontColor('#4a7fd4').setBackground('#d6e4ff');
  }
  sheet.getRange(1, 1, rows.length, totalCols).setBorder(true, true, true, true, true, true, '#d0d0cc', SpreadsheetApp.BorderStyle.SOLID);
}

function recolorCurrentSheet() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getValues();
  for (var r = 1; r < data.length; r++) {
    if (data[r][0] && data[r][0].toString().indexOf('【') === 0) continue;
    for (var c = 1; c < data[r].length; c++) {
      var v = data[r][c]; if (!v) continue; v = v.toString().trim();
      if (COLORS[v]) sheet.getRange(r+1, c+1).setBackground(COLORS[v]).setFontColor('#fff').setFontWeight('bold');
    }
  }
  SpreadsheetApp.getUi().alert('Colors reapplied');
}

function getColLetter(n) { var s=''; while(n>0){var m2=(n-1)%26;s=String.fromCharCode(65+m2)+s;n=Math.floor((n-1)/26);}return s; }

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (e.parameter.action === 'read') {
    var sn = e.parameter.month, sh = ss.getSheetByName(sn);
    if (!sh) return ContentService.createTextOutput(JSON.stringify({shifts:{}})).setMimeType(ContentService.MimeType.JSON);
    var data = sh.getDataRange().getValues(), shifts = {}, hdr = data[0];
    for (var r = 1; r < data.length; r++) {
      var dayStr = data[r][0]; if (!dayStr) continue;
      var day = parseInt(dayStr); if (!day || isNaN(day)) continue;
      for (var c = 1; c < hdr.length; c++) {
        var docName = hdr[c]; if (!docName || docName.toString().indexOf('【') === 0) continue;
        var v = data[r][c]; if (v && v.toString().trim()) {
          var ds2 = sn + '-' + String(day).padStart(2, '0');
          if (!shifts[ds2]) shifts[ds2] = [];
          shifts[ds2].push({docName: docName.toString().trim(), clinic: v.toString().trim()});
        }
      }
    }
    return ContentService.createTextOutput(JSON.stringify({shifts: shifts})).setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput(JSON.stringify({})).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), body = JSON.parse(e.postData.contents);
  if (body.action === 'writeRequests') wReqs(ss, body.requests);
  return ContentService.createTextOutput(JSON.stringify({ok: true})).setMimeType(ContentService.MimeType.JSON);
}

function wReqs(ss, reqs) {
  var sh = ss.getSheetByName('シフト希望'); if (!sh) sh = ss.insertSheet('シフト希望'); sh.clear();
  var rows = [['ドクター','日付','種類']];
  reqs.forEach(function(r) { rows.push([r.docName, r.date, r.type]); });
  sh.getRange(1, 1, rows.length, 3).setValues(rows);
  sh.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#edebe6');
}
