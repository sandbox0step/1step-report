// =================================================================
//  統合 GAS スクリプト
//  1. 除草作業 完了報告書 -> スプレッドシート（index.html）
//  2. ASRカメラ 写真一括  -> Googleドライブ保存（camera.html STEP2）
//  3. ASRカメラ URLのみ  -> スプレッドシート（camera.html STEP3）
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

// camera_asr: 縦配列 --- カテゴリ | アルバムURL
var CAMERA_HEADERS = ['カテゴリ', 'アルバムURL'];

// =================================================================
// エントリーポイント（認証チェックなし・全員アクセス可）
// =================================================================
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var result;
    if (data.type === 'camera_upload') { result = uploadPhotosAndGetUrl(data); }
    else if (data.type === 'camera_asr') { result = saveCameraToSheet(data); }
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
// ASRカメラのURLをスプレッドシートに縦配列で書き込む（camera.html STEP3）
//
// 書き込みイメージ:
//   行1: 作業前 | https://drive.google.com/drive/folders/...
//   行2: 作業後 | https://drive.google.com/drive/folders/...
//   行3: 点検   | https://drive.google.com/drive/folders/...
// =================================================================
function saveCameraToSheet(data) {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CAMERA_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(CAMERA_SHEET);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(CAMERA_HEADERS);
    sheet.getRange(1, 1, 1, CAMERA_HEADERS.length)
         .setFontWeight('bold')
         .setBackground('#dce8ff');
    sheet.setFrozenRows(1);
  }

  var modes = data.modes || [];
  modes.forEach(function(m) {
    if (!m.url) return;
    sheet.appendRow([m.name, m.url]);
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
// Drive アクセステスト（GASエディタから手動実行して権限確認）
// 実行後: ログにフォルダIDが出れば OK。テストフォルダは自動削除。
// =================================================================
function testDriveAccess() {
  var folder = DriveApp.createFolder('テスト');
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
