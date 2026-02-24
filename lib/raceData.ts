import { Horse } from './types';

export interface ArchivedRace {
    courseId: string;
    label: string;
    date: string;
    hashtag: string;
    horses: Horse[];
}

// ============================================================
// 今週のレース デフォルト登録馬データ（2026/3/1）
// ※ 枠番未確定のため gateNumber は仮番号
// ※ 能力値はレーティング・近走成績ベースの暫定値
// ※ predictionCount（集合知スコア）はネット話題度ベースの暫定値（2/24調べ）
// ============================================================

/** 中山記念 2026 特別登録馬（2/24時点・集合知スコアはネット話題度暫定値） */
const NAKAYAMA_KINEN_HORSES: Horse[] = [
    { id: '1',  gateNumber: 1,  name: 'レーベンスティール',   jockey: '戸崎圭太',   speed: 92, stamina: 88, power: 88, guts: 85, runningStyle: 'Sashi',  predictionCount: 150, simulatedOdds: 0, realOdds: 3.5 },
    { id: '2',  gateNumber: 2,  name: 'エコロヴァルツ',       jockey: '横山武史',   speed: 88, stamina: 86, power: 85, guts: 88, runningStyle: 'Senko',  predictionCount: 80,  simulatedOdds: 0, realOdds: 4.5 },
    { id: '3',  gateNumber: 3,  name: 'チェルヴィニア',       jockey: 'C.ルメール', speed: 90, stamina: 85, power: 84, guts: 82, runningStyle: 'Sashi',  predictionCount: 100, simulatedOdds: 0, realOdds: 7.0 },
    { id: '4',  gateNumber: 4,  name: 'セイウンハーデス',     jockey: '幸英明',     speed: 86, stamina: 88, power: 86, guts: 84, runningStyle: 'Senko',  predictionCount: 30,  simulatedOdds: 0, realOdds: 7.5 },
    { id: '5',  gateNumber: 5,  name: 'カラマティアノス',     jockey: '津村明秀',   speed: 87, stamina: 85, power: 84, guts: 86, runningStyle: 'Senko',  predictionCount: 50,  simulatedOdds: 0, realOdds: 8.0 },
    { id: '6',  gateNumber: 6,  name: 'シャンパンカラー',     jockey: '岩田康誠',   speed: 85, stamina: 82, power: 82, guts: 80, runningStyle: 'Senko',  predictionCount: 25,  simulatedOdds: 0, realOdds: 13.5 },
    { id: '7',  gateNumber: 7,  name: 'マジックサンズ',       jockey: '横山和生',   speed: 84, stamina: 84, power: 82, guts: 82, runningStyle: 'Sashi',  predictionCount: 15,  simulatedOdds: 0, realOdds: 19.5 },
    { id: '8',  gateNumber: 8,  name: 'サイルーン',           jockey: '佐々木大輔', speed: 83, stamina: 82, power: 80, guts: 80, runningStyle: 'Senko',  predictionCount: 10,  simulatedOdds: 0, realOdds: 28.5 },
    { id: '9',  gateNumber: 9,  name: 'ニシノエージェント',   jockey: '未定',       speed: 80, stamina: 82, power: 80, guts: 78, runningStyle: 'Sashi',  predictionCount: 3,   simulatedOdds: 0, realOdds: 35.0 },
    { id: '10', gateNumber: 10, name: 'マイネルモーント',     jockey: '石川裕紀人', speed: 80, stamina: 80, power: 80, guts: 80, runningStyle: 'Oikomi', predictionCount: 5,   simulatedOdds: 0, realOdds: 36.5 },
    { id: '11', gateNumber: 11, name: 'ショウナンマグマ',     jockey: '吉田豊',     speed: 82, stamina: 80, power: 82, guts: 80, runningStyle: 'Nige',   predictionCount: 3,   simulatedOdds: 0, realOdds: 50.0 },
    { id: '12', gateNumber: 12, name: 'オニャンコポン',       jockey: '菅原明良',   speed: 82, stamina: 84, power: 82, guts: 82, runningStyle: 'Senko',  predictionCount: 8,   simulatedOdds: 0, realOdds: 50.0 },
    { id: '13', gateNumber: 13, name: 'サンストックトン',     jockey: '松岡正海',   speed: 80, stamina: 82, power: 80, guts: 80, runningStyle: 'Sashi',  predictionCount: 2,   simulatedOdds: 0, realOdds: 60.0 },
    { id: '14', gateNumber: 14, name: 'サトノエピック',       jockey: '未定',       speed: 78, stamina: 80, power: 78, guts: 78, runningStyle: 'Sashi',  predictionCount: 1,   simulatedOdds: 0, realOdds: 80.0 },
];

/** オーシャンS 2026 特別登録馬（2/24時点・集合知スコアはネット話題度暫定値） */
const OCEAN_STAKES_HORSES: Horse[] = [
    { id: '1',  gateNumber: 1,  name: 'ママコチャ',           jockey: '川田将雅',   speed: 92, stamina: 80, power: 88, guts: 88, runningStyle: 'Senko',  predictionCount: 120, simulatedOdds: 0, realOdds: 3.0 },
    { id: '2',  gateNumber: 2,  name: 'ファンダム',           jockey: 'C.ルメール', speed: 90, stamina: 78, power: 86, guts: 85, runningStyle: 'Senko',  predictionCount: 60,  simulatedOdds: 0, realOdds: 4.0 },
    { id: '3',  gateNumber: 3,  name: 'ルガル',               jockey: '鮫島駿',     speed: 91, stamina: 78, power: 88, guts: 86, runningStyle: 'Senko',  predictionCount: 100, simulatedOdds: 0, realOdds: 4.5 },
    { id: '4',  gateNumber: 4,  name: 'インビンシブルパパ',   jockey: '佐々木大輔', speed: 88, stamina: 76, power: 84, guts: 82, runningStyle: 'Nige',   predictionCount: 40,  simulatedOdds: 0, realOdds: 6.5 },
    { id: '5',  gateNumber: 5,  name: 'レイピア',             jockey: '戸崎圭太',   speed: 86, stamina: 78, power: 82, guts: 82, runningStyle: 'Sashi',  predictionCount: 20,  simulatedOdds: 0, realOdds: 10.5 },
    { id: '6',  gateNumber: 6,  name: 'フリッカージャブ',     jockey: '松山弘平',   speed: 85, stamina: 76, power: 82, guts: 80, runningStyle: 'Senko',  predictionCount: 15,  simulatedOdds: 0, realOdds: 16.5 },
    { id: '7',  gateNumber: 7,  name: 'ルージュラナキラ',     jockey: '横山武史',   speed: 84, stamina: 76, power: 80, guts: 80, runningStyle: 'Sashi',  predictionCount: 12,  simulatedOdds: 0, realOdds: 18.5 },
    { id: '8',  gateNumber: 8,  name: 'ヨシノイースター',     jockey: '田辺裕信',   speed: 84, stamina: 78, power: 82, guts: 82, runningStyle: 'Sashi',  predictionCount: 10,  simulatedOdds: 0, realOdds: 23.0 },
    { id: '9',  gateNumber: 9,  name: 'ビッグシーザー',       jockey: '北村友一',   speed: 84, stamina: 76, power: 82, guts: 80, runningStyle: 'Nige',   predictionCount: 8,   simulatedOdds: 0, realOdds: 25.5 },
    { id: '10', gateNumber: 10, name: 'ピューロマジック',     jockey: '横山和生',   speed: 85, stamina: 74, power: 80, guts: 78, runningStyle: 'Nige',   predictionCount: 15,  simulatedOdds: 0, realOdds: 29.0 },
    { id: '11', gateNumber: 11, name: 'ペアポルックス',       jockey: '岩田康誠',   speed: 82, stamina: 78, power: 80, guts: 80, runningStyle: 'Sashi',  predictionCount: 5,   simulatedOdds: 0, realOdds: 35.0 },
    { id: '12', gateNumber: 12, name: 'ウイングレイテスト',   jockey: '松岡正海',   speed: 82, stamina: 78, power: 80, guts: 80, runningStyle: 'Senko',  predictionCount: 5,   simulatedOdds: 0, realOdds: 36.0 },
    { id: '13', gateNumber: 13, name: 'フィオライア',         jockey: '太宰啓介',   speed: 80, stamina: 76, power: 78, guts: 78, runningStyle: 'Sashi',  predictionCount: 8,   simulatedOdds: 0, realOdds: 43.0 },
    { id: '14', gateNumber: 14, name: 'フリームファクシ',     jockey: '菅原明良',   speed: 80, stamina: 76, power: 78, guts: 78, runningStyle: 'Senko',  predictionCount: 2,   simulatedOdds: 0, realOdds: 55.0 },
    { id: '15', gateNumber: 15, name: 'オタルエバー',         jockey: '大野拓弥',   speed: 78, stamina: 76, power: 78, guts: 76, runningStyle: 'Sashi',  predictionCount: 1,   simulatedOdds: 0, realOdds: 60.0 },
    { id: '16', gateNumber: 16, name: 'カリボール',           jockey: '柴田善臣',   speed: 78, stamina: 76, power: 78, guts: 76, runningStyle: 'Senko',  predictionCount: 1,   simulatedOdds: 0, realOdds: 80.0 },
];

/** チューリップ賞 2026 特別登録馬（2/24時点・集合知スコアはネット話題度暫定値） */
const TULIP_SHO_HORSES: Horse[] = [
    { id: '1',  gateNumber: 1,  name: 'アランカール',         jockey: '武豊',       speed: 90, stamina: 82, power: 84, guts: 85, runningStyle: 'Senko',  predictionCount: 130, simulatedOdds: 0, realOdds: 2.0 },
    { id: '2',  gateNumber: 2,  name: 'タイセイボーグ',       jockey: '西村淳也',   speed: 88, stamina: 80, power: 82, guts: 82, runningStyle: 'Senko',  predictionCount: 90,  simulatedOdds: 0, realOdds: 4.0 },
    { id: '3',  gateNumber: 3,  name: 'コニーアイランド',     jockey: '川田将雅',   speed: 87, stamina: 82, power: 82, guts: 84, runningStyle: 'Sashi',  predictionCount: 50,  simulatedOdds: 0, realOdds: 6.5 },
    { id: '4',  gateNumber: 4,  name: 'ソルパッサーレ',       jockey: '浜中俊',     speed: 85, stamina: 80, power: 80, guts: 80, runningStyle: 'Sashi',  predictionCount: 20,  simulatedOdds: 0, realOdds: 10.5 },
    { id: '5',  gateNumber: 5,  name: 'ホワイトオーキッド',   jockey: '松山弘平',   speed: 84, stamina: 80, power: 80, guts: 80, runningStyle: 'Senko',  predictionCount: 15,  simulatedOdds: 0, realOdds: 15.0 },
    { id: '6',  gateNumber: 6,  name: 'ナムラコスモス',       jockey: '田口貫太',   speed: 82, stamina: 80, power: 80, guts: 78, runningStyle: 'Senko',  predictionCount: 8,   simulatedOdds: 0, realOdds: 19.5 },
    { id: '7',  gateNumber: 7,  name: 'エレガンスアスク',     jockey: '坂井瑠星',   speed: 82, stamina: 78, power: 78, guts: 80, runningStyle: 'Sashi',  predictionCount: 10,  simulatedOdds: 0, realOdds: 23.5 },
    { id: '8',  gateNumber: 8,  name: 'スマートプリエール',   jockey: '吉村誠之助', speed: 80, stamina: 78, power: 78, guts: 78, runningStyle: 'Senko',  predictionCount: 5,   simulatedOdds: 0, realOdds: 28.0 },
    { id: '9',  gateNumber: 9,  name: 'エイズルブルーム',     jockey: '池添謙一',   speed: 80, stamina: 78, power: 78, guts: 78, runningStyle: 'Sashi',  predictionCount: 5,   simulatedOdds: 0, realOdds: 33.0 },
    { id: '10', gateNumber: 10, name: 'ダンデノン',           jockey: '北村友一',   speed: 78, stamina: 78, power: 78, guts: 76, runningStyle: 'Senko',  predictionCount: 3,   simulatedOdds: 0, realOdds: 46.5 },
    { id: '11', gateNumber: 11, name: 'グランドオーパス',     jockey: '高杉吏麒',   speed: 78, stamina: 76, power: 76, guts: 76, runningStyle: 'Sashi',  predictionCount: 2,   simulatedOdds: 0, realOdds: 55.0 },
    { id: '12', gateNumber: 12, name: 'グレースジェンヌ',     jockey: '岩田望来',   speed: 78, stamina: 76, power: 76, guts: 76, runningStyle: 'Senko',  predictionCount: 2,   simulatedOdds: 0, realOdds: 60.0 },
    { id: '13', gateNumber: 13, name: 'ダンシングドール',     jockey: '未定',       speed: 76, stamina: 76, power: 76, guts: 76, runningStyle: 'Sashi',  predictionCount: 1,   simulatedOdds: 0, realOdds: 80.0 },
    { id: '14', gateNumber: 14, name: 'アンディムジーク',     jockey: '未定',       speed: 76, stamina: 76, power: 76, guts: 76, runningStyle: 'Senko',  predictionCount: 1,   simulatedOdds: 0, realOdds: 80.0 },
    { id: '15', gateNumber: 15, name: 'サキドリトッケン',     jockey: '飛田愛斗',   speed: 76, stamina: 76, power: 76, guts: 76, runningStyle: 'Senko',  predictionCount: 3,   simulatedOdds: 0, realOdds: 100.0 },
];

// ============================================================
// コースID → デフォルト馬データのマッピング
// ============================================================
const DEFAULT_HORSES_MAP: Record<string, Horse[]> = {
    'nakayama-turf-1800': NAKAYAMA_KINEN_HORSES,
    'nakayama-turf-1200': OCEAN_STAKES_HORSES,
    'hanshin-turf-1600':  TULIP_SHO_HORSES,
};

// ============================================================
// フェブラリーS 2026 アーカイブデータ
// ============================================================
export const ARCHIVED_RACES: ArchivedRace[] = [
    {
        courseId: 'tokyo-dirt-1600',
        label: 'フェブラリーS 2026',
        date: '2026-02-22',
        hashtag: '#フェブラリーS',
        horses: [
            { id: '1', gateNumber: 1, name: 'オメガギネス', jockey: '岩田康誠', speed: 85, stamina: 82, power: 80, guts: 80, runningStyle: 'Sashi', predictionCount: 20, simulatedOdds: 0, realOdds: 19.6 },
            { id: '2', gateNumber: 2, name: 'ハッピーマン', jockey: '高杉吏麒', speed: 80, stamina: 80, power: 78, guts: 75, runningStyle: 'Sashi', predictionCount: 5, simulatedOdds: 0, realOdds: 68.1 },
            { id: '3', gateNumber: 3, name: 'ブライアンセンス', jockey: '岩田望来', speed: 81, stamina: 82, power: 80, guts: 78, runningStyle: 'Sashi', predictionCount: 8, simulatedOdds: 0, realOdds: 60.3 },
            { id: '4', gateNumber: 4, name: 'ペリエール', jockey: '佐々木大輔', speed: 82, stamina: 80, power: 85, guts: 80, runningStyle: 'Sashi', predictionCount: 15, simulatedOdds: 0, realOdds: 32.4 },
            { id: '5', gateNumber: 5, name: 'シックスペンス', jockey: '戸崎圭太', speed: 86, stamina: 84, power: 82, guts: 85, runningStyle: 'Senko', predictionCount: 40, simulatedOdds: 0, realOdds: 17.3 },
            { id: '6', gateNumber: 6, name: 'ラムジェット', jockey: '三浦皇成', speed: 88, stamina: 90, power: 92, guts: 88, runningStyle: 'Oikomi', predictionCount: 120, simulatedOdds: 0, realOdds: 8.3 },
            { id: '7', gateNumber: 7, name: 'ロングラン', jockey: '荻野極', speed: 78, stamina: 85, power: 80, guts: 82, runningStyle: 'Sashi', predictionCount: 2, simulatedOdds: 0, realOdds: 157.4 },
            { id: '8', gateNumber: 8, name: 'サクラトゥジュール', jockey: 'R.キング', speed: 82, stamina: 80, power: 80, guts: 78, runningStyle: 'Sashi', predictionCount: 10, simulatedOdds: 0, realOdds: 43.0 },
            { id: '9', gateNumber: 9, name: 'ダブルハートボンド', jockey: '坂井瑠星', speed: 92, stamina: 88, power: 85, guts: 90, runningStyle: 'Senko', predictionCount: 180, simulatedOdds: 0, realOdds: 2.9 },
            { id: '10', gateNumber: 10, name: 'サンデーファンデー', jockey: '横山和生', speed: 84, stamina: 82, power: 80, guts: 80, runningStyle: 'Senko', predictionCount: 25, simulatedOdds: 0, realOdds: 17.0 },
            { id: '11', gateNumber: 11, name: 'サンライズホーク', jockey: '松岡正海', speed: 75, stamina: 80, power: 82, guts: 80, runningStyle: 'Sashi', predictionCount: 1, simulatedOdds: 0, realOdds: 227.2 },
            { id: '12', gateNumber: 12, name: 'コスタノヴァ', jockey: 'C.ルメール', speed: 90, stamina: 85, power: 88, guts: 90, runningStyle: 'Sashi', predictionCount: 160, simulatedOdds: 0, realOdds: 3.5 },
            { id: '13', gateNumber: 13, name: 'ナチュラルライズ', jockey: '横山武史', speed: 88, stamina: 85, power: 80, guts: 85, runningStyle: 'Nige', predictionCount: 140, simulatedOdds: 0, realOdds: 21.9 },
            { id: '14', gateNumber: 14, name: 'ウィルソンテソーロ', jockey: '川田将雅', speed: 85, stamina: 88, power: 90, guts: 92, runningStyle: 'Senko', predictionCount: 30, simulatedOdds: 0, realOdds: 6.2 },
            { id: '15', gateNumber: 15, name: 'ペプチドナイル', jockey: '富田暁', speed: 83, stamina: 85, power: 85, guts: 80, runningStyle: 'Senko', predictionCount: 12, simulatedOdds: 0, realOdds: 57.8 },
            { id: '16', gateNumber: 16, name: 'サイモンザナドゥ', jockey: '池添謙一', speed: 81, stamina: 84, power: 82, guts: 85, runningStyle: 'Sashi', predictionCount: 10, simulatedOdds: 0, realOdds: 59.6 },
        ]
    }
];

// ============================================================
// Public API
// ============================================================

/**
 * コースIDに応じたデフォルト馬データを返す
 * 1. アーカイブデータがあればそれを返す
 * 2. 今週のレースデータがあればそれを返す
 * 3. なければ空のプレースホルダーを生成
 */
export function getDefaultHorses(courseId: string): Horse[] {
    // アーカイブ
    const archived = ARCHIVED_RACES.find(r => r.courseId === courseId);
    if (archived) return archived.horses.map(h => ({ ...h }));

    // 今週のレース
    const preset = DEFAULT_HORSES_MAP[courseId];
    if (preset) return preset.map(h => ({ ...h }));

    // フォールバック
    return Array.from({ length: 8 }, (_, i) => ({
        id: String(i + 1),
        gateNumber: i + 1,
        name: `馬${i + 1}`,
        jockey: '未定',
        speed: 80,
        stamina: 80,
        power: 80,
        guts: 80,
        runningStyle: 'Senko' as const,
        predictionCount: 0,
        simulatedOdds: 0,
        realOdds: 0,
    }));
}

/**
 * コースIDがアーカイブレースかどうか判定
 */
export function isArchivedCourse(courseId: string): boolean {
    return ARCHIVED_RACES.some(r => r.courseId === courseId);
}
