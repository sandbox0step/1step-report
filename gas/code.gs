// =================================================================
//  統合 GAS スクリプト
//  1. 除草作業 完了報告書 -> スプレッドシート（index.html）
//  2. ASRカメラ 写真一括  -> Googleドライブ保存（camera.html STEP2）
//  3. ASRカメラ URLのみ  -> スプレッドシート（camera.html STEP3）
//  4. 写真データ取得     -> ASRカメラシート検索（asr-auto.html）
// =================================================================
//
// デプロイ手順
//  (1) スプレッドシートを開く
//      https://docs.google.com/spreadsheets/d/1vN9wtH2nEiSpC4QxpYphaJ-369eGmNHV4k5DB5ETvms/edit
//  (2) メニュー「拡張機能」->「Apps Script」-> このコードを貼り付けて保存
//  (3)「デプロイ」->「新しいデプロイ」
//      種類: ウェブアプリ / 実行者: 自分 / アクセス: 全員
//  (4)「アクセスを承認」-> Googleアカウントでログイン
//  (5) 表示された URL を camera.html / index.html の GAS_URL に設定
//
// 変更後の再デプロイ
//  「デプロイ」->「デプロイを管理」-> 鉛筆アイコン ->
//  バージョン「新しいバージョン」->「デプロイ」
// =================================================================

// ----- 設定 -----
var SPREADSHEET_ID = '1vN9wtH2nEiSpC4QxpYphaJ-369eGmNHV4k5DB5ETvms';
var REPORT_SHEET   = 'シート1';
var CAMERA_SHEET   = 'ASRカメラ';

// ----- ヘッダー定義 -----
var REPORT_HEADERS = [
  '送信日時', '作業日', '案件名', '担当者名', '現場名称',
  '工番', '所在地', '作業時間', '作業人数', '天候・気温',
  '備考・連絡事項', '共有リンクURL'
];

// camera_asr: 縦配列 --- 現場名 | 日付 | カテゴリ | アルバムURL
var CAMERA_HEADERS = ['現場名', '日付', 'カテゴリ', 'アルバムURL'];

// =================================================================
// エントリーポイント（認証チェックなし・全員アクセス可）
// =================================================================
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(30000);

  try {
    var data = JSON.parse(e.postData.contents);
    var result;
    if (data.type === 'camera_upload')    { result = uploadPhotosAndGetUrl(data); }
    else if (data.type === 'camera_asr')  { result = saveCameraToSheet(data); }
    else if (data.type === 'get_camera_data') { result = getCameraData(data); }
    else { result = saveReportToSheet(data); }
    return makeJson(result);
  } catch (err) {
    Logger.log('エラー: ' + err.message);
    return makeJson({ status: 'error', message: err.toString() });
  }
}

// =================================================================
// 写真を Drive に一括保存してフォルダURLを返す（camera.html STEP2）
//
// 受け取るデータ:
//   {
//     type:       "camera_upload",
//     category:   "作業前",
//     folderName: "現場名_2026-05-08_作業前",
//     photos:     [{ filename: "...", data: "base64..." }, ...]
//   }
//
// フォルダ構成: ASR / folderName
// =================================================================
function uploadPhotosAndGetUrl(data) {
  var folderName = (data.folderName || '未設定').replace(/[\\/:*?"<>|]/g, '_');
  var photos     = data.photos || [];

  var root           = DriveApp.getRootFolder();
  var asrFolder      = getOrCreateFolder('ASR', root);
  var categoryFolder = getOrCreateFolder(folderName, asrFolder);

  photos.forEach(function(photo, i) {
    var filename = photo.filename || (('000' + (i + 1)).slice(-3) + '_' + nowFilename() + '.jpg');
    var bytes    = Utilities.base64Decode(photo.data);
    var blob     = Utilities.newBlob(bytes, 'image/jpeg', filename);
    categoryFolder.createFile(blob);
  });

  categoryFolder.setSharing(
    DriveApp.Access.ANYONE_WITH_LINK,
    DriveApp.Permission.VIEW
  );

  var url = 'https://drive.google.com/drive/folders/' + categoryFolder.getId();
  return { status: 'ok', url: url };
}

// =================================================================
// ASRカメラのURLをスプレッドシートに書き込む（camera.html STEP3）
//
// 受け取るデータ:
//   {
//     type:     "camera_asr",
//     siteName: "テスト現場",
//     date:     "2026-05-09",
//     modes:    [{ name: "作業前", url: "https://..." }, ...]
//   }
//
// 書き込み形式（1カテゴリ1行）:
//   A列: 現場名  B列: 日付  C列: カテゴリ  D列: アルバムURL
// =================================================================
function saveCameraToSheet(data) {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CAMERA_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(CAMERA_SHEET);
  }

  var a1 = sheet.getRange(1, 1).getValue();
  if (a1 !== CAMERA_HEADERS[0]) {
    sheet.clearContents();
    sheet.appendRow(CAMERA_HEADERS);
    sheet.getRange(1, 1, 1, CAMERA_HEADERS.length)
         .setFontWeight('bold')
         .setBackground('#dce8ff');
    sheet.setFrozenRows(1);
  }

  var siteName = data.siteName || '';
  var date     = data.date     || '';
  var modes    = data.modes    || [];
  modes.forEach(function(m) {
    if (!m.url) return;
    sheet.appendRow([siteName, date, m.name, m.url]);
  });

  return { status: 'ok' };
}

// =================================================================
// 報告書データをスプレッドシートに保存（index.html 用・変更なし）
// =================================================================
function saveReportToSheet(data) {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(REPORT_SHEET) || ss.getActiveSheet();

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(REPORT_HEADERS);
    sheet.getRange(1, 1, 1, REPORT_HEADERS.length)
         .setFontWeight('bold')
         .setBackground('#e8f5ec');
    sheet.setFrozenRows(1);
    sheet.getDataRange().createFilter();
  }

  var jst = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd_HH:mm:ss');

  sheet.appendRow([
    jst,
    data.workDate    || data.date      || '',
    data.projectName || data.project   || '',
    data.workerName  || data.staff     || '',
    data.siteName    || '',
    data.siteId      || data.jobNo     || '',
    data.location    || '',
    data.workTime    || '',
    data.workerCount || data.workers   || '',
    data.weather     || '',
    data.remarks     || '',
    data.shareLink   || data.icloudUrl || ''
  ]);

  if (!sheet.getFilter()) {
    sheet.getDataRange().createFilter();
  }

  return { status: 'ok' };
}

// =================================================================
// ヘルパー関数
// =================================================================
function getOrCreateFolder(name, parentFolder) {
  var it = parentFolder.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parentFolder.createFolder(name);
}

function nowFilename() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd_HHmmss');
}

function makeJson(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// =================================================================
// 現場名・日付でASRカメラシートを検索してフォルダURL・写真IDを返す
// （asr-auto.html 用）
//
// 受け取るデータ:
//   { type: "get_camera_data", siteName: "現場名", date: "2026-05-10" }
//
// 返却値:
//   {
//     status: "ok",
//     data: {
//       "作業前": { url: "https://...", photos: ["fileId1", ...] },
//       "作業後": { url: "https://...", photos: [...] },
//       "点検":   { url: "https://...", photos: [...] }
//     }
//   }
// =================================================================
function getCameraData(data) {
  var siteName = String(data.siteName || '').trim();
  var date     = String(data.date     || '').trim();

  if (!siteName || !date) {
    return { status: 'error', message: '現場名と日付が必要です' };
  }

  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CAMERA_SHEET);
  if (!sheet) return { status: 'error', message: 'ASRカメラシートが見つかりません' };

  var rows   = sheet.getDataRange().getValues();
  var result = {};

  for (var i = 1; i < rows.length; i++) {
    var rowSite = String(rows[i][0]).trim();
    var rowDate = String(rows[i][1]).trim();
    var rowCat  = String(rows[i][2]).trim();
    var rowUrl  = String(rows[i][3]).trim();

    if (rowSite !== siteName || rowDate !== date || !rowUrl) continue;

    result[rowCat] = rowUrl;
  }

  if (Object.keys(result).length === 0) {
    return { status: 'error', message: 'データが見つかりません' };
  }
  return { status: 'ok', data: result };
}

// =================================================================
// Drive アクセステスト（GASエディタから手動実行して権限確認）
// 実行後: ログにフォルダIDが出れば OK。テストフォルダは自動削除。
// =================================================================
function testDriveAccess() {
  var folder = DriveApp.createFolder('テスト確認用');
  Logger.log(folder.getId());
  folder.setTrashed(true);
}

function testCameraUpload() {
  var data = {
    type: "camera_upload",
    category: "作業前",
    folderName: "テスト_作業前",
    photos: [
      {
        filename: "test.jpg",
        data: "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AJQAB/9k="
      }
    ]
  };
  try {
    var result = uploadPhotosAndGetUrl(data);
    Logger.log(JSON.stringify(result));
  } catch (e) {
    Logger.log('エラー: ' + e.toString());
  }
}

function testCameraAsr() {
  var data = {
    type:     'camera_asr',
    siteName: 'テスト現場',
    date:     '2026-05-09',
    modes: [
      { name: '作業前', url: 'https://drive.google.com/drive/folders/dummy1' },
      { name: '作業後', url: 'https://drive.google.com/drive/folders/dummy2' },
      { name: '点検',   url: 'https://drive.google.com/drive/folders/dummy3' }
    ]
  };
  try {
    var result = saveCameraToSheet(data);
    Logger.log(JSON.stringify(result));
  } catch (e) {
    Logger.log('エラー: ' + e.toString());
  }
}

// =================================================================
// ASRカメラシートのヘッダーを強制的に正しい形式に書き換える
// GASエディタから手動実行する（1回だけでOK）
// =================================================================
function fixCameraSheetHeader() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CAMERA_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(CAMERA_SHEET);
    Logger.log('シートを新規作成しました');
  }

  sheet.getRange(1, 1, 1, CAMERA_HEADERS.length).setValues([CAMERA_HEADERS]);
  sheet.getRange(1, 1, 1, CAMERA_HEADERS.length)
       .setFontWeight('bold')
       .setBackground('#dce8ff');
  sheet.setFrozenRows(1);

  Logger.log('ヘッダーを書き換えました: ' + CAMERA_HEADERS.join(' | '));
}

function testGetCameraData() {
  var result = getCameraData({
    siteName: "てる",
    date: "2026/05/10"
  });
  Logger.log(JSON.stringify(result));
}
