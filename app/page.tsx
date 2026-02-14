'use client';
import { useState, useEffect } from 'react';
import {
  DndContext, 
  closestCenter,
  TouchSensor, // スマホ用センサー
  MouseSensor, // PC用センサー
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  horizontalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// --- 型定義 ---
type Article = {
  id: string;
  title: string;
  tags: string;
  stats: { sentences: number; words: number } | null;
  gameData: GameSentence[] | null;
  status: string;
};

type GameSentence = {
  original: string;
  japanese: string;
  words: string[];
};

type DailyStats = {
  papers: number;
  sentences: number;
  words: number;
};

// --- DnD用の単語パーツ ---
function SortableWord({ id, word, onRemove }: { id: string; word: string; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    touchAction: 'none', // 【重要】スマホでのスクロール干渉を防ぐ
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      // ダブルクリック等の誤作動防止のため、onClickではなくポインターイベントで制御するのが理想ですが
      // 簡易的にクリック削除も残します
      onClick={onRemove}
      className={`
        px-3 py-2 rounded cursor-grab active:cursor-grabbing select-none shadow-sm border
        bg-blue-100 border-blue-200 text-blue-900 
        dark:bg-blue-900 dark:border-blue-700 dark:text-blue-100
      `}
    >
      {word}
    </div>
  );
}

// --- メイン画面 ---
export default function Home() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStats>({ papers: 0, sentences: 0, words: 0 });
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/articles')
      .then((res) => res.json())
      .then((data) => {
        setArticles(data.articles);
        setDailyStats(data.dailyStats); // 成績をセット
        setLoading(false);
      });
  }, []);

  const handleComplete = (id: string, addedStats: {sentences: number, words: number}) => {
    // 完了したらリストのステータス更新 ＆ 今日の成績を即座に加算
    setArticles((prev) => prev.map((a) => a.id === id ? { ...a, status: 'Done' } : a));
    setDailyStats((prev) => ({
      papers: prev.papers + 1,
      sentences: prev.sentences + addedStats.sentences,
      words: prev.words + addedStats.words
    }));
    setSelectedArticle(null);
  };

  if (loading) return <div className="p-10 text-center dark:text-white">Loading...</div>;

  if (selectedArticle) {
    return (
      <GameView 
        article={selectedArticle} 
        onBack={() => setSelectedArticle(null)} 
        onComplete={handleComplete}
      />
    );
  }

  // 【フィルタリング】未完了(Doneじゃない) かつ ゲームデータがあるものだけ表示
  const playableArticles = articles.filter(a => a.status !== 'Done' && a.gameData);

  return (
    <main className="max-w-2xl mx-auto p-6 min-h-screen dark:text-gray-100">
      <h1 className="text-2xl font-bold mb-4">論文要旨学習</h1>

      {/* 今日の成績パネル */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-8 border dark:border-gray-700 flex justify-around text-center">
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Papers</p>
          <p className="text-2xl font-bold">{dailyStats.papers}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Sentences</p>
          <p className="text-2xl font-bold">{dailyStats.sentences}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Words</p>
          <p className="text-2xl font-bold">{dailyStats.words}</p>
        </div>
      </div>

      <h2 className="text-lg font-semibold mb-3">To Do</h2>
      <div className="grid gap-4">
        {playableArticles.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">今日の分はすべて完了しました！🎉</p>
        ) : (
          playableArticles.map((article) => (
            <div 
              key={article.id} 
              onClick={() => setSelectedArticle(article)}
              className="p-4 border dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition bg-white dark:bg-gray-800 shadow-sm"
            >
              <div className="flex justify-between items-start">
                <h2 className="font-semibold">{article.title}</h2>
                <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                  New
                </span>
              </div>
              <div className="flex gap-2 mt-2">
                {(article.tags || '').split(',').map(tag => (
                  <span key={tag} className="text-xs bg-gray-100 dark:bg-gray-600 px-2 py-0.5 rounded text-gray-600 dark:text-gray-300">
                    {tag.trim()}
                  </span>
                ))}
              </div>
              {article.stats && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                  {article.stats.sentences} sentences / {article.stats.words} words
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </main>
  );
}

// --- ゲーム画面 ---
function GameView({ 
  article, 
  onBack, 
  onComplete 
}: { 
  article: Article; 
  onBack: () => void;
  onComplete: (id: string, stats: {sentences: number, words: number}) => void;
}) {
  const [step, setStep] = useState(0);
  const [userWords, setUserWords] = useState<{id: string, text: string}[]>([]);
  const [availableWords, setAvailableWords] = useState<string[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  
  // 【追加】答えをのぞき見しているかどうかの状態
  const [isPeeking, setIsPeeking] = useState(false);

  const [formData, setFormData] = useState({
    purpose: '',
    methods: '',
    results: '',
    memo: ''
  });

  const currentQ = article.gameData![step];
  const isLast = step === article.gameData!.length - 1;

  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 100,
        tolerance: 5,
      },
    })
  );

  useEffect(() => {
    if (currentQ) {
      const shuffled = [...currentQ.words].sort(() => Math.random() - 0.5);
      setAvailableWords(shuffled);
      setUserWords([]);
      setIsCorrect(null);
      setIsPeeking(false); // 新しい問題に行ったら、のぞき見モードは解除
    }
  }, [step, currentQ]);

  const handleWordClick = (word: string, index: number) => {
    const newAvailable = [...availableWords];
    newAvailable.splice(index, 1);
    setAvailableWords(newAvailable);
    setUserWords([...userWords, { id: `${word}-${Date.now()}`, text: word }]);
  };

  const handleRemove = (id: string) => {
    const target = userWords.find(w => w.id === id);
    if (!target) return;
    const newUserWords = userWords.filter(w => w.id !== id);
    setUserWords(newUserWords);
    setAvailableWords([...availableWords, target.text]);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      setUserWords((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over?.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const checkAnswer = () => {
    const userSentence = userWords.map(w => w.text).join(' ');
    const normalize = (str: string) => str.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g,"").replace(/\s/g, "");
    if (normalize(currentQ.original) === normalize(userSentence)) {
      setIsCorrect(true);
    } else {
      setIsCorrect(false);
    }
  };

  const nextStep = () => {
    if (isLast) {
      setShowResult(true);
    } else {
      setStep(step + 1);
    }
  };

  const handleSubmit = async () => {
    await fetch('/api/articles', {
      method: 'POST',
      body: JSON.stringify({ 
        id: article.id,
        title: article.title,
        stats: article.stats, 
        ...formData 
      }),
    });
    onComplete(article.id, article.stats || {sentences:0, words:0});
  };

  if (showResult) {
    // (結果画面は変更なし)
    return (
      <div className="max-w-2xl mx-auto p-6 min-h-screen dark:text-gray-100">
        <h2 className="text-xl font-bold mb-4">🎉 学習完了！</h2>
        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded mb-6 text-sm max-h-40 overflow-y-auto border dark:border-gray-700">
          {article.gameData!.map((q, i) => (
            <div key={i} className="mb-2 border-b dark:border-gray-700 pb-2">
              <p className="font-semibold">{q.original}</p>
              <p className="text-gray-500 dark:text-gray-400">{q.japanese}</p>
            </div>
          ))}
        </div>
        <div className="space-y-4">
          {['purpose', 'methods', 'results', 'memo'].map((field) => (
            <div key={field}>
              <label className="block text-sm font-bold mb-1 capitalize text-gray-700 dark:text-gray-300">{field}</label>
              <textarea 
                className="w-full p-2 border rounded bg-white dark:bg-gray-800 dark:border-gray-700 dark:text-white" 
                rows={2}
                value={(formData as any)[field]}
                onChange={e => setFormData({...formData, [field]: e.target.value})}
              />
            </div>
          ))}
          <button onClick={handleSubmit} className="w-full bg-blue-600 text-white py-3 rounded font-bold hover:bg-blue-700">
            保存して終了
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 min-h-screen dark:text-gray-100">
      <div className="flex justify-between items-center mb-6">
        <span className="text-sm text-gray-500 dark:text-gray-400">Sentence {step + 1} / {article.gameData!.length}</span>
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-gray-600">Exit</button>
      </div>

      <div className="mb-8">
        <p className="text-lg font-medium mb-2 text-blue-600 dark:text-blue-400">ヒント: {currentQ.japanese}</p>
        
        {/* --- 表示エリアの分岐 --- */}
        {isPeeking ? (
           // 【のぞき見モード】正解の英文を表示
           <div className="min-h-[150px] p-6 border-2 border-yellow-400 bg-yellow-50 dark:bg-yellow-900/30 dark:border-yellow-600 rounded mb-6 flex items-center justify-center">
             <div className="text-center">
               <p className="text-sm text-yellow-700 dark:text-yellow-400 font-bold mb-2">Answer</p>
               <p className="text-xl font-bold text-gray-800 dark:text-gray-100">{currentQ.original}</p>
             </div>
           </div>
        ) : (
          // 【通常モード】ドラッグ＆ドロップエリアを表示
          <>
            <div className="min-h-[80px] p-4 border-2 border-dashed border-blue-200 dark:border-blue-800 rounded mb-6 bg-gray-50 dark:bg-gray-800">
              <DndContext 
                sensors={sensors} 
                collisionDetection={closestCenter} 
                onDragEnd={handleDragEnd}
              >
                <SortableContext 
                  items={userWords} 
                  strategy={horizontalListSortingStrategy}
                >
                  <div className="flex flex-wrap gap-2">
                    {userWords.map((item) => (
                      <SortableWord 
                        key={item.id} 
                        id={item.id} 
                        word={item.text} 
                        onRemove={() => handleRemove(item.id)}
                      />
                    ))}
                    {userWords.length === 0 && <span className="text-gray-400 text-sm">単語を選んで文を作ってください</span>}
                  </div>
                </SortableContext>
              </DndContext>
            </div>

            {/* 選択肢エリア */}
            <div className="flex flex-wrap gap-2 mb-8">
              {availableWords.map((word, i) => (
                <button 
                  key={i} 
                  onClick={() => handleWordClick(word, i)} 
                  className="px-3 py-2 border rounded hover:bg-gray-100 shadow-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-600"
                >
                  {word}
                </button>
              ))}
            </div>
          </>
        )}

        {/* --- ボタンエリアの分岐 --- */}
        {isCorrect === null ? (
          <div className="space-y-3">
            {isPeeking ? (
              // 【のぞき見中】「隠す」ボタンだけ表示
              <button 
                onClick={() => setIsPeeking(false)}
                className="w-full py-3 bg-yellow-500 text-white font-bold rounded hover:bg-yellow-600 transition"
              >
                Hide Answer & Try Again
              </button>
            ) : (
              // 【通常時】回答チェックなどのボタン
              <>
                <button 
                  onClick={checkAnswer} 
                  disabled={userWords.length === 0}
                  className="w-full py-3 bg-gray-800 text-white rounded disabled:opacity-50 hover:bg-gray-700 dark:bg-gray-600 dark:hover:bg-gray-500 transition"
                >
                  Check Answer
                </button>
                
                <div className="flex gap-2">
                  {/* Show Answer (Peek) */}
                  <button 
                    onClick={() => setIsPeeking(true)}
                    className="flex-1 py-2 border border-gray-300 text-gray-600 rounded hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 text-sm"
                  >
                    Show Answer
                  </button>
                  {/* Skip */}
                  <button 
                    onClick={nextStep}
                    className="flex-1 py-2 border border-gray-300 text-gray-600 rounded hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 text-sm"
                  >
                    Skip Question
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          // 【正解/不正解時の表示】
          <div className={`p-4 rounded text-center ${isCorrect ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100'}`}>
            <p className="font-bold text-lg mb-2">{isCorrect ? 'Correct! 👏' : 'Try Again 😢'}</p>
            {isCorrect && (
               <div className="mt-2">
                 <p className="text-sm mb-2 font-mono bg-white/50 dark:bg-black/30 p-2 rounded">{currentQ.original}</p>
                 <button onClick={nextStep} className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 shadow">Next</button>
               </div>
            )}
            {!isCorrect && (
              <button onClick={() => setIsCorrect(null)} className="mt-2 px-4 py-1 border border-red-300 dark:border-red-700 rounded hover:bg-red-50 dark:hover:bg-red-800">Retry</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}