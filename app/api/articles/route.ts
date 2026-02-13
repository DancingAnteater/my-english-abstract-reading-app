import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { NextResponse } from 'next/server';

const serviceAccountAuth = new JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

async function getDoc() {
  const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID!, serviceAccountAuth);
  await doc.loadInfo();
  return doc;
}

// GET: 記事一覧の取得 (変更なし)
export async function GET() {
  const doc = await getDoc();
  const sheet = doc.sheetsByIndex[0]; // 1枚目のシート
  const rows = await sheet.getRows();

  const articles = rows.map((row) => ({
    id: row.get('id'),
    title: row.get('title'),
    tags: row.get('tags'),
    status: row.get('status'),
    stats: row.get('stats') ? JSON.parse(row.get('stats')) : null,
    gameData: row.get('game_data') ? JSON.parse(row.get('game_data')) : null,
  }));

  return NextResponse.json(articles);
}

// POST: 完了データの書き込み (大幅変更)
export async function POST(req: Request) {
  const body = await req.json();
  const { id, title, purpose, methods, results, memo, stats } = body; // 受け取るデータを追加

  const doc = await getDoc();
  
  // 1. 記事シートの更新
  const articleSheet = doc.sheetsByIndex[0];
  const rows = await articleSheet.getRows();
  const row = rows.find((r) => r.get('id') === id);

  if (row) {
    // 4つの項目を保存
    row.set('purpose', purpose);
    row.set('methods', methods);
    row.set('results', results);
    row.set('memo', memo);
    row.set('status', 'Done');
    await row.save();
  } else {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // 2. 学習記録シートへの追記 (新規機能)
  try {
    const logSheet = doc.sheetsByIndex[1]; // 2枚目のシート
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    await logSheet.addRow({
      date: today,
      article_id: id,
      title: title,
      count_sentences: stats.sentences,
      count_words: stats.words
    });
  } catch (e) {
    console.error("Log sheet error:", e);
    // ログ書き込み失敗しても、ユーザーには成功を返す（メイン機能ではないため）
  }
  
  return NextResponse.json({ success: true });
}