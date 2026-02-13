'use client';
import { useState, useEffect } from 'react';
import {
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// --- 型定義 ---
type Article = {
  id: string;
  title: string;
  stats: { sentences: number; words: number } | null;
  gameData: GameSentence[] | null;
  status: string;
};

type GameSentence = {
  original: string;
  japanese: string;
  words: string[];
};

// --- DnD用のソート可能な単語コンポーネント ---
function SortableWord({ id, word, onRemove }: { id: string; word: string; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      // ダブルクリックか、ドラッグせずにクリックした時に削除扱いにするため、
      // 本来はonClickで良いが、DnDライブラリとの兼ね合いでonPointerDown等が優先される。
      // ここではシンプルに「クリックで削除」も機能するように、親から渡されたonRemoveを発火させるボタンを内包するか、
      // またはユーザー体験として「×ボタン」をつけるのが一般的だが、今回は「クリックで戻す」を維持する。
      onClick={(e) => {
        // ドラッグ動作でない単なるクリックの場合のみ発火させたいが、
        // dnd-kitのlistenersがクリックイベントを消費する場合があるため注意が必要。
        // 今回はPointerSensorの設定で区別しているため、onClickも有効になるはず。
        onRemove();
      }}
      className="px-3 py-2 bg-blue-100 rounded cursor-grab active:cursor-grabbing hover:bg-red-100 select-none shadow-sm border border-blue-200"
    >
      {word}
    </div>
  );
}

// --- メインコンポーネント ---
export default function Home() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/articles')
      .then((res) => res.json())
      .then((data) => {
        setArticles(data);
        setLoading(false);
      });
  }, []);

  // 完了時の処理: ステータスをDoneに更新して一覧に戻る
  const handleComplete = (id: string) => {
    setArticles((prev) => 
      prev.map((a) => a.id === id ? { ...a, status: 'Done' } : a)
    );
    setSelectedArticle(null);
  };

  if (loading) return <div className="p-10 text-center">Loading...</div>;

  if (selectedArticle) {
    return (
      <GameView 
        article={selectedArticle} 
        onBack={() => setSelectedArticle(null)} 
        onComplete={handleComplete}
      />
    );
  }

  return (
    <main className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">論文要旨学習</h1>
      <div className="grid gap-4">
        {articles.map((article) => (
          <div 
            key={article.id} 
            onClick={() => article.gameData && setSelectedArticle(article)}
            className={`p-4 border rounded-lg cursor-pointer hover:bg-gray-50 transition 
              ${!article.gameData ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div className="flex justify-between items-start">
              <h2 className="font-semibold">{article.title}</h2>
              <span className={`text-xs px-2 py-1 rounded ${article.status === 'Done' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                {article.status || 'New'}
              </span>
            </div>
            {article.stats && (
              <p className="text-sm text-gray-500 mt-2">
                {article.stats.sentences}文 / {article.stats.words}単語
              </p>
            )}
            {!article.gameData && <p className="text-xs text-red-500 mt-1">データ生成待ち</p>}
          </div>
        ))}
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
  onComplete: (id: string) => void;
}) {
  const [step, setStep] = useState(0);
  // 並べ替え用に、ID付きのオブジェクトとして管理する (dnd-kitのため)
  const [userWords, setUserWords] = useState<{id: string, text: string}[]>([]);
  const [availableWords, setAvailableWords] = useState<string[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

  // フォーム用ステート
  const [formData, setFormData] = useState({
    purpose: '',
    methods: '',
    results: '',
    memo: ''
  });

  const currentQ = article.gameData![step];
  const isLast = step === article.gameData!.length - 1;

  // DnDのセンサー設定 (マウス操作とタッチ操作の感度調整)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // 5px以上動かしたらドラッグとみなす (クリックとの誤爆防止)
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // 初期化
  useEffect(() => {
    if (currentQ) {
      const shuffled = [...currentQ.words].sort(() => Math.random() - 0.5);
      setAvailableWords(shuffled);
      setUserWords([]);
      setIsCorrect(null);
    }
  }, [step, currentQ]);

  // 単語追加 (クリック)
  const handleWordClick = (word: string, index: number) => {
    const newAvailable = [...availableWords];
    newAvailable.splice(index, 1);
    setAvailableWords(newAvailable);
    
    // ユニークIDを付与して追加
    setUserWords([...userWords, { id: `${word}-${Date.now()}`, text: word }]);
  };

  // 単語削除 (クリック) - ソート済みエリアから戻す
  const handleRemove = (id: string) => {
    const target = userWords.find(w => w.id === id);
    if (!target) return;

    const newUserWords = userWords.filter(w => w.id !== id);
    setUserWords(newUserWords);
    setAvailableWords([...availableWords, target.text]);
  };

  // ドラッグ終了時の並べ替え処理
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
    const cleanOriginal = currentQ.original.trim().replace(/\s+/g, ' ');
    const cleanUser = userSentence.trim().replace(/\s+/g, ' ');

    // 簡易判定: 記号を除去して比較
    const normalize = (str: string) => str.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g,"");
    
    if (normalize(cleanOriginal) === normalize(cleanUser)) {
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
        stats: article.stats, // 統計情報も送る
        ...formData 
      }),
    });
    alert('保存しました！お疲れ様でした。');
    onComplete(article.id);
  };

  if (showResult) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <h2 className="text-xl font-bold mb-4">🎉 学習完了！</h2>
        <div className="bg-gray-50 p-4 rounded mb-6 text-sm max-h-40 overflow-y-auto">
          {article.gameData!.map((q, i) => (
            <div key={i} className="mb-2 border-b pb-2">
              <p className="font-semibold">{q.original}</p>
              <p className="text-gray-500">{q.japanese}</p>
            </div>
          ))}
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold mb-1">Purpose (目的)</label>
            <textarea 
              className="w-full p-2 border rounded" 
              placeholder="この研究は何のために行われた？"
              value={formData.purpose}
              onChange={e => setFormData({...formData, purpose: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-sm font-bold mb-1">Methods (方法)</label>
            <textarea 
              className="w-full p-2 border rounded" 
              placeholder="どんな手法を使った？"
              value={formData.methods}
              onChange={e => setFormData({...formData, methods: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-sm font-bold mb-1">Results (結果)</label>
            <textarea 
              className="w-full p-2 border rounded" 
              placeholder="何がわかった？"
              value={formData.results}
              onChange={e => setFormData({...formData, results: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-sm font-bold mb-1">Memo / Questions</label>
            <textarea 
              className="w-full p-2 border rounded" 
              placeholder="気になった点や感想"
              value={formData.memo}
              onChange={e => setFormData({...formData, memo: e.target.value})}
            />
          </div>
          
          <button onClick={handleSubmit} className="w-full bg-blue-600 text-white py-3 rounded font-bold hover:bg-blue-700">
            保存して終了
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <span className="text-sm text-gray-500">Sentence {step + 1} / {article.gameData!.length}</span>
        <button onClick={onBack} className="text-sm text-gray-400">Exit</button>
      </div>

      <div className="mb-8">
        <p className="text-lg font-medium mb-2 text-blue-600">ヒント: {currentQ.japanese}</p>
        
        {/* 回答エリア (Sortable) */}
        <div className="min-h-[80px] p-4 border-2 border-dashed border-blue-200 rounded mb-6 bg-gray-50">
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
            <button key={i} onClick={() => handleWordClick(word, i)} className="px-3 py-2 border rounded hover:bg-gray-100 shadow-sm bg-white">
              {word}
            </button>
          ))}
        </div>

        {isCorrect === null ? (
          <button 
            onClick={checkAnswer} 
            disabled={userWords.length === 0}
            className="w-full py-3 bg-gray-800 text-white rounded disabled:opacity-50 hover:bg-gray-700 transition"
          >
            Check Answer
          </button>
        ) : (
          <div className={`p-4 rounded text-center ${isCorrect ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            <p className="font-bold text-lg mb-2">{isCorrect ? 'Correct! 👏' : 'Try Again 😢'}</p>
            {isCorrect && (
               <div className="mt-2">
                 <p className="text-sm mb-2 font-mono bg-white/50 p-2 rounded">{currentQ.original}</p>
                 <button onClick={nextStep} className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 shadow">Next</button>
               </div>
            )}
            {!isCorrect && (
              <button onClick={() => setIsCorrect(null)} className="mt-2 px-4 py-1 border border-red-300 rounded hover:bg-red-50">Retry</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}