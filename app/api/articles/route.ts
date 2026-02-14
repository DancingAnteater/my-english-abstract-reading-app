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

// GET: 記事一覧 ＋ 今日の成績を取得
export async function GET() {
  const doc = await getDoc();
  
  // 1. 記事一覧を取得 (シート1)
  const sheet = doc.sheetsByIndex[0];
  const rows = await sheet.getRows();
  const articles = rows.map((row) => ({
    id: row.get('id'),
    title: row.get('title'),
    tags: row.get('tags'),
    status: row.get('status'),
    stats: row.get('stats') ? JSON.parse(row.get('stats')) : null,
    gameData: row.get('game_data') ? JSON.parse(row.get('game_data')) : null,
  }));

  // 2. 今日の成績を集計 (シート2)
  const logSheet = doc.sheetsByIndex[1];
  const logRows = await logSheet.getRows();
  
  // --- 修正後 (日本時間 JST 対応) ---
  const now = new Date();
  // 9時間 (9 * 60分 * 60秒 * 1000ミリ秒) を足してJSTにする
  const jstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const today = jstDate.toISOString().split('T')[0];
  
  // 今日のログだけ抽出
  const todayLogs = logRows.filter(r => r.get('date') === today);

  const dailyStats = {
    papers: todayLogs.length,
    sentences: todayLogs.reduce((sum, r) => sum + Number(r.get('count_sentences') || 0), 0),
    words: todayLogs.reduce((sum, r) => sum + Number(r.get('count_words') || 0), 0),
  };

  return NextResponse.json({ articles, dailyStats });
}

// POST: 変更なし (前回のコードのまま)
export async function POST(req: Request) {
  const body = await req.json();
  const { id, title, purpose, methods, results, memo, stats } = body;

  const doc = await getDoc();
  const articleSheet = doc.sheetsByIndex[0];
  const rows = await articleSheet.getRows();
  const row = rows.find((r) => r.get('id') === id);

  if (row) {
    row.set('purpose', purpose);
    row.set('methods', methods);
    row.set('results', results);
    row.set('memo', memo);
    row.set('status', 'Done');
    await row.save();
  } else {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const logSheet = doc.sheetsByIndex[1];
    // --- 修正後 (日本時間 JST 対応) ---
    const now = new Date();
    // 9時間 (9 * 60分 * 60秒 * 1000ミリ秒) を足してJSTにする
    const jstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const today = jstDate.toISOString().split('T')[0];
    await logSheet.addRow({
      date: today,
      article_id: id,
      title: title,
      count_sentences: stats.sentences,
      count_words: stats.words
    });
  } catch (e) {
    console.error("Log sheet error:", e);
  }
  
  return NextResponse.json({ success: true });
}