/**
 * =================================================================
 *  除草作業 完了報告書  →  Googleスプレッドシート 連携スクリプト
 * =================================================================
 *
 * 【設定手順】
 *
 *  ① Googleスプレッドシートを開く
 *     https://docs.google.com/spreadsheets/d/1vN9wtH2nEiSpC4QxpYphaJ-369eGmNHV4k5DB5ETvms/edit
 *
 *  ② メニュー「拡張機能」→「Apps Script」をクリック
 *
 *  ③ エディタに表示されている既存コードをすべて削除し、
 *     このファイルの内容をすべて貼り付けて保存（Ctrl+S）
 *
 *  ④ 画面上部「デプロイ」ボタン →「新しいデプロイ」をクリック
 *
 *  ⑤ 設定画面で以下を選択してデプロイ
 *     ・種類の選択：「ウェブアプリ」
 *     ・次のユーザーとして実行：「自分（メールアドレス）」
 *     ・アクセスできるユーザー：「全員」
 *     ・「デプロイ」ボタンをクリック
 *
 *  ⑥ 「アクセスを承認」→ Googleアカウントでログイン
 *     「詳細」→「（安全でないページ）へ移動」→「許可」
 *
 *  ⑦ 表示された「ウェブアプリの URL」をコピーする
 *     例: https://script.google.com/macros/s/XXXXXXXX/exec
 *
 *  ⑧ index.html の SHEET_URL にそのURLを貼り付けて保存・再デプロイ
 *     var SHEET_URL = 'https://script.google.com/macros/s/XXXXXXXX/exec';
 *
 * 【コード修正後の再デプロイ手順】
 *  「デプロイ」→「デプロイを管理」→ 鉛筆アイコン（編集）→
 *  バージョン：「新しいバージョン」を選択 →「デプロイ」
 *
 * 【スプレッドシートのシート名について】
 *  デフォルトは「シート1」。変更した場合は下の SHEET_NAME を修正する。
 * =================================================================
 */

// ===== 設定 =====
var SPREADSHEET_ID = '1vN9wtH2nEiSpC4QxpYphaJ-369eGmNHV4k5DB5ETvms';
var SHEET_NAME     = 'シート1';

var HEADERS = [
  '送信日時',
  '作業日',
  '案件名',
  '担当者名',
  '現場名称',
  '工番',
  '所在地',
  '作業時間',
  '作業人数',
  '天候・気温',
  '備考・連絡事項',
  '共有リンクURL'
];

// ===== POST受信処理 =====
function doPost(e) {
  try {
    var data  = JSON.parse(e.postData.contents);
    var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SHEET_NAME) || ss.getActiveSheet();

    // 1行目にヘッダーがなければ追加・書式設定・フィルター有効化
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      var headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
      headerRange.setFontWeight('bold').setBackground('#e8f5ec');
      sheet.setFrozenRows(1);
      sheet.getDataRange().createFilter();
    }

    // 送信日時（日本時間）
    var jst = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');

    // データ行を追加
    sheet.appendRow([
      jst,
      data.date      || '',
      data.project   || '',
      data.staff     || '',
      data.siteName  || '',
      data.jobNo     || '',
      data.location  || '',
      data.workTime  || '',
      data.workers   || '',
      data.weather   || '',
      data.remarks   || '',
      data.icloudUrl || ''
    ]);

    // 行追加後にフィルターが外れる場合があるため再設定
    if (!sheet.getFilter()) {
      sheet.getDataRange().createFilter();
    }

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
