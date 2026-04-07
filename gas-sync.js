/**
 * Google Apps Script: スプレッドシート → Supabase 同期
 *
 * 【セットアップ手順】
 * 1. スプレッドシートで「拡張機能」→「Apps Script」を開く
 * 2. このコードを貼り付ける
 * 3. SUPABASE_URL と SUPABASE_KEY を設定する
 * 4. syncToSupabase() を実行してテスト
 * 5. トリガー設定：「編集」→「トリガー」→ syncToSupabase を「時間ベース」で5分おきに実行
 *
 * 【スプレッドシートのカラム構成】
 * A: 登録日 | B: 予約日時 | C: 名前 | D: 施術 | E: クリニック
 * F: メールアドレス | G: 連絡先 | H: プロモーション | I: 事前キャンセル
 * J: 来院有無 | K: 成約有無
 */

const SUPABASE_URL = 'https://trsugjpvhlkwjvtloype.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyc3VnanB2aGxrd2p2dGxveXBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4NTc4ODQsImV4cCI6MjA5MDQzMzg4NH0.GASbFeN_dLduCw81DQen8e4Hwc0TkHrcZWbB8dgNsec';
const SHEET_NAME = 'hikaru_Affiliates'; // シート名

function syncToSupabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    Logger.log('シートが見つかりません: ' + SHEET_NAME);
    return;
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0]; // ヘッダー行
  const rows = data.slice(1); // データ行

  // 既存データを取得（name + appointment_date で重複チェック）
  const existing = getExistingRecords();
  const existingKeys = new Set(existing.map(r => makeKey(r.name, r.appointment_date)));

  let newRecords = [];
  let updateRecords = [];

  for (const row of rows) {
    if (!row[2]) continue; // 名前が空ならスキップ

    const record = {
      registration_date: formatDateForDB(row[0]),
      appointment_date: formatDateForDB(row[1]),
      name: String(row[2]).trim(),
      treatment: String(row[3]).trim(),
      clinic: String(row[4]).trim(),
      email: String(row[5]).trim(),
      phone: String(row[6]).trim(),
      promotion: String(row[7]).trim(),
      pre_cancel: String(row[8]).trim() || null,
    };

    const key = makeKey(record.name, record.appointment_date);

    if (!existingKeys.has(key)) {
      newRecords.push(record);
    }
  }

  // 新規レコードをバッチ挿入
  if (newRecords.length > 0) {
    upsertRecords(newRecords);
    Logger.log(newRecords.length + '件の新規予約を同期しました');
  } else {
    Logger.log('新規予約はありません');
  }

  // スプレッドシート側のJ列・K列をSupabaseから逆同期（Webで更新した内容を反映）
  syncBackToSheet(sheet, data, existing);
}

/**
 * Supabase → スプレッドシート逆同期（来院有無・成約有無）
 */
function syncBackToSheet(sheet, sheetData, supabaseData) {
  const rows = sheetData.slice(1);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row[2]) continue;

    const name = String(row[2]).trim();
    const apptDate = formatDateForDB(row[1]);

    // Supabaseから該当レコードを探す
    const match = supabaseData.find(r =>
      r.name === name && r.appointment_date === apptDate
    );

    if (match) {
      const rowIdx = i + 2; // ヘッダー分 +1, 0始まり +1

      // J列（来院有無）: Supabase側に値があればシートに書き戻す
      if (match.visited && match.visited !== String(row[9] || '').trim()) {
        sheet.getRange(rowIdx, 10).setValue(match.visited);
      }

      // K列（成約有無）: Supabase側に値があればシートに書き戻す
      if (match.contracted && match.contracted !== String(row[10] || '').trim()) {
        sheet.getRange(rowIdx, 11).setValue(match.contracted);
      }
    }
  }
}

/**
 * 既存レコードを全件取得
 */
function getExistingRecords() {
  const url = SUPABASE_URL + '/rest/v1/reservations?select=id,name,appointment_date,visited,contracted';
  const options = {
    method: 'get',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
    },
    muteHttpExceptions: true,
  };
  const res = UrlFetchApp.fetch(url, options);
  if (res.getResponseCode() !== 200) {
    Logger.log('取得エラー: ' + res.getContentText());
    return [];
  }
  return JSON.parse(res.getContentText());
}

/**
 * レコードをバッチ挿入
 */
function upsertRecords(records) {
  const url = SUPABASE_URL + '/rest/v1/reservations';
  const options = {
    method: 'post',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=ignore-duplicates',
    },
    payload: JSON.stringify(records),
    muteHttpExceptions: true,
  };
  const res = UrlFetchApp.fetch(url, options);
  if (res.getResponseCode() >= 300) {
    Logger.log('挿入エラー: ' + res.getContentText());
  }
}

/**
 * 重複チェック用キー
 */
function makeKey(name, date) {
  return (name || '').trim() + '|' + (date || '');
}

/**
 * 日付をDB用フォーマットに変換
 */
function formatDateForDB(val) {
  if (!val) return null;
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    const h = String(val.getHours()).padStart(2, '0');
    const min = String(val.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${d}T${h}:${min}:00`;
  }
  return String(val).trim();
}

/**
 * メニューに同期ボタンを追加
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🔄 予約同期')
    .addItem('Supabaseに同期', 'syncToSupabase')
    .addToUi();
}
