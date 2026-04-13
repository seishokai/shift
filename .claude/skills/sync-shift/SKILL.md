---
name: sync-shift
description: >
  正翔会のシフトデータをGoogleスプレッドシートから抽出し、index.htmlに反映してデプロイするスキル。
  「更新して」「シフト更新」「sync」「反映して」「スプレッドシート更新」「データ更新」と言われたら
  このスキルを使う。シフトや正翔会のデータ同期に関する依頼は全てこのスキルで対応する。
---

# 正翔会シフト同期スキル

Googleスプレッドシートから正翔会のシフトデータを抽出し、GitHub Pagesにデプロイする。

## スプレッドシート情報

- **pubhtml URL**: `https://docs.google.com/spreadsheets/d/e/2PACX-1vQ-k3oggMr8RmnfQp8B_M8afOLX5FQbBO7puwG3SUAb4rGVETSqYC8J-COVXKeIL2PI727e8sq4BsFh/pubhtml`
- 各月のシートは下部タブに「26年N月」形式で並んでいる
- 個別シートURL: `pubhtml/sheet?headers=false&gid=<GID>`

## 抽出手順

### 1. Chromeでスプレッドシートを開く

`mcp__Claude_in_Chrome__tabs_context_mcp` でタブを取得し、`mcp__Claude_in_Chrome__navigate` でpubhtml URLに移動。

### 2. 利用可能な月シートを確認

```javascript
// シートタブを取得
var tds = document.querySelectorAll('.switcherTable td');
// "26年7月" などのテキストでクリック
```

### 3. 各月シートのGIDを特定して移動

シートタブをクリック後、URLの `#gid=` からGIDを取得。
`pubhtml/sheet?headers=false&gid=<GID>` に直接移動して単独シートを表示。

### 4. ヘッダー行でドクター列を特定

Row index 2（3行目）がヘッダー。ドクター名と列インデックスを対応付ける:

| ドクター名 | ID | 備考 |
|-----------|------|------|
| 大西 | s1 | |
| 上之郷 | s2 | 月によって存在しない場合あり |
| 大久保 | s3 | |
| 田中 | s4 | |
| 伊藤 | s5 | |
| 梅村 | s6 | |
| 森 | s7 | |
| 森脩 | s8 | |
| 竹村 | s9 | |
| 若山 | s10 | |
| 谷口 | s11 | |
| 松清 | s12 | |
| 後藤 | s13 | |

**重要**: 岡崎、あおい、みなみ、安城 はドクターではなく休診日列。スキップすること。

ヘッダー行を動的に読んで列マッピングを構築する（月ごとに列構成が変わる可能性があるため）:

```javascript
var headerRow = document.querySelectorAll('table tr')[2];
var cells = headerRow.querySelectorAll('td');
var nameToId = {
  '大西':'s1','上之郷':'s2','大久保':'s3','田中':'s4',
  '伊藤':'s5','梅村':'s6','森':'s7','森脩':'s8',
  '竹村':'s9','若山':'s10','谷口':'s11','松清':'s12','後藤':'s13'
};
var skipNames = new Set(['岡崎','あおい','みなみ','安城','正翔会','清翔会','']);
var colMap = {}; // colIndex -> doctorId
for(var j = 0; j < cells.length; j++) {
  var name = cells[j].textContent.trim();
  if(nameToId[name]) colMap[j] = nameToId[name];
}
```

### 5. データ行からシフトを抽出

Row index 4以降がデータ行。各行:
- **col 1**: 日付（日）
- **col 2**: 曜日
- **col 3+**: ドクターのシフト（背景色で医院を判定）

```javascript
var rows = document.querySelectorAll('table tr');
var results = [];
for(var i = 4; i < rows.length; i++) {
  var cells = rows[i].querySelectorAll('td');
  var day = cells[1] ? cells[1].textContent.trim() : '';
  if(!day || isNaN(parseInt(day))) continue;
  
  var entries = [];
  for(var colIdx in colMap) {
    var cell = cells[colIdx];
    if(!cell) continue;
    var text = cell.textContent.trim();
    var bg = getComputedStyle(cell).backgroundColor;
    var clinic = mapColor(bg, text);
    if(clinic) entries.push(colMap[colIdx] + ':' + clinic);
  }
  if(entries.length > 0) {
    results.push('2026-' + mm + '-' + pad(day) + '|' + entries.join(','));
  }
}
```

### 6. 色→医院マッピング

背景色のRGB値は完全一致しない場合がある。以下の範囲で判定:

| 医院 | ID | 色の特徴 | RGB例 |
|------|------|---------|-------|
| LL | ll | 水色/シアン/青 | rgb(0,171,234), rgb(38,162,239) |
| 南 | minami | 黄色 | rgb(255,255,0) |
| 葵 | aoi | 茶色/ブラウン | rgb(185,112,52), rgb(193,107,8) |
| 安城 | anjo | 赤 | rgb(255,0,0) |

判定ロジック:
```javascript
function mapColor(bg, text) {
  // テキスト優先
  if(/有給|有休/.test(text)) return 'yukyu';
  if(/休み|休$/.test(text)) return 'yasumi';
  
  var m = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if(!m) return null;
  var r = parseInt(m[1]), g = parseInt(m[2]), b = parseInt(m[3]);
  
  // 白/透明 = シフトなし
  if(r > 240 && g > 240 && b > 240) return null;
  
  // 赤 = 安城
  if(r > 200 && g < 80 && b < 80) return 'anjo';
  // 黄 = 南
  if(r > 200 && g > 200 && b < 80) return 'minami';
  // 青/シアン = LL
  if(b > 150 && r < 100) return 'll';
  if(b > 200 && g > 100 && r < 80) return 'll';
  // 茶 = 葵
  if(r > 150 && g > 80 && g < 140 && b < 80) return 'aoi';
  
  // 不明な色 → テキストがあればyasumiの可能性
  if(text && /休/.test(text)) return 'yasumi';
  return null;
}
```

### 7. index.htmlを更新

ファイル: `C:\Users\USER\Downloads\shift\index.html`

`EXCEL_DATA_S` の `var raw = [` と `];` の間を新しいデータで置換。
既存データと新データをマージ（日付ベースで上書き）。

### 8. コミット&デプロイ

```bash
cd C:/Users/USER/Downloads/shift
git add index.html
git commit -m "正翔会シフトデータ更新: YYYY年MM月分追加"
git push
```

## 出力形式

コンパクトフォーマット: `'2026-MM-DD|s1:clinic,s2:clinic,...'`

例:
```
'2026-07-01|s1:aoi,s3:ll,s5:anjo,s6:ll,s7:aoi,s8:minami'
```

## 注意事項

- 月ごとにドクターの列構成が変わる可能性がある（上之郷が居ない月など）→ 必ずヘッダー行を動的に読む
- 空のシート（全セル白）はスキップ
- 既存データがある月は上書きマージ
- 更新完了後にプレビューで確認してからpush
