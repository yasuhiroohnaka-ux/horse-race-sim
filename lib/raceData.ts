import { Horse } from './types';

export interface ArchivedRace {
    courseId: string;
    label: string;
    date: string;
    hashtag: string;
    horses: Horse[];
}

// ============================================================
// SP/ST 算出ロジック
// ============================================================
// 1. オッズ → ベース能力値（総合力）を算出
// 2. 脚質でSP/STの配分を変える
//    逃げ: SP寄り（瞬発力型）  差し: ST寄り（持続力型）
// 3. 馬ごとに決定的バラつきを加え、同オッズでも差がつく
//
// 例: odds 3.5 → base 90
//   逃げ → SP 93 / ST 87    差し → SP 87 / ST 93
// ============================================================

/** 文字列から決定的ハッシュ値を生成（乱数の代わり） */
function hashStr(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
}

/**
 * オッズからベース能力値（総合力）を算出
 * odds 1.5 → 95, odds 3 → 90, odds 10 → 82, odds 50 → 74, odds 100 → 71
 */
function oddsToBase(odds: number): number {
    if (!odds || odds <= 0) return 75;
    const winProb = Math.min(0.72 / odds, 0.55);
    const normalized = Math.max(0,
        (Math.log(0.6) - Math.log(Math.max(winProb, 0.005))) /
        (Math.log(0.6) - Math.log(0.005))
    );
    return Math.round(92 - normalized * 18);
}

/** 脚質ごとのSP/ST配分（SPシフト値、STは逆方向） */
const STYLE_SPLIT: Record<string, { sp: number; st: number }> = {
    Nige:   { sp: +3, st: -3 },  // 逃げ: 瞬発力型
    Senko:  { sp: +1, st: -1 },  // 先行: やや速度型
    Sashi:  { sp: -1, st: +2 },  // 差し: 持続力型
    Oikomi: { sp: -3, st: +3 },  // 追込: スタミナ型
};

function clamp(v: number, min: number, max: number) {
    return Math.max(min, Math.min(max, v));
}

/** オッズ＋脚質ベースでHorse配列の SP/ST を一括算出 */
function assignAbilities(horses: Omit<Horse, 'speed' | 'stamina' | 'power' | 'guts'>[], _distance: number): Horse[] {
    return horses.map(h => {
        const base = oddsToBase(h.realOdds ?? 50);
        const split = STYLE_SPLIT[h.runningStyle] ?? { sp: 0, st: 0 };

        // 馬固有のバラつき（idベースで決定的、±2）
        const hash = hashStr(h.id + h.name);
        const spNoise = (hash % 5) - 2;         // -2 ~ +2
        const stNoise = ((hash >> 3) % 5) - 2;  // -2 ~ +2

        const sp = clamp(base + split.sp + spNoise, 68, 97);
        const st = clamp(base + split.st + stNoise, 68, 97);

        return {
            ...h,
            speed: sp,
            stamina: st,
            power: clamp(base + ((hash >> 6) % 5) - 2, 68, 97),
            guts:  clamp(base + ((hash >> 9) % 5) - 2, 68, 97),
        } as Horse;
    });
}

// ============================================================
// 今週のレース デフォルト登録馬データ（2026/3/1）
// ※ 枠番未確定のため gateNumber は仮番号
// ※ SP/ST はオッズから自動算出（oddsToSpeed/oddsToStamina）
// ※ predictionCount（集合知スコア）はネット話題度ベースの暫定値（2/24調べ）
// ============================================================

/** 中山記念 2026 特別登録馬（2/24時点・集合知スコアはネット話題度暫定値）
 *  混合戦 G2: 牡57kg / 牝55kg
 *  状態値: 戦績安定度・臨戦過程・格落ち出走などを総合判断 */
const NAKAYAMA_KINEN_HORSES: Horse[] = assignAbilities([
    { id: '1',  gateNumber: 1,  name: 'レーベンスティール',   jockey: '戸崎圭太',   runningStyle: 'Sashi',  predictionCount: 150, simulatedOdds: 0, realOdds: 3.5, sex: 'M', weight: 57, condition: 7 },
    { id: '2',  gateNumber: 2,  name: 'エコロヴァルツ',       jockey: '横山武史',   runningStyle: 'Senko',  predictionCount: 80,  simulatedOdds: 0, realOdds: 4.5, sex: 'M', weight: 57, condition: 8 },
    { id: '3',  gateNumber: 3,  name: 'チェルヴィニア',       jockey: 'C.ルメール', runningStyle: 'Sashi',  predictionCount: 100, simulatedOdds: 0, realOdds: 7.0, sex: 'F', weight: 55, condition: 5 },
    { id: '4',  gateNumber: 4,  name: 'セイウンハーデス',     jockey: '幸英明',     runningStyle: 'Senko',  predictionCount: 30,  simulatedOdds: 0, realOdds: 7.5, sex: 'M', weight: 57, condition: 7 },
    { id: '5',  gateNumber: 5,  name: 'カラマティアノス',     jockey: '津村明秀',   runningStyle: 'Senko',  predictionCount: 50,  simulatedOdds: 0, realOdds: 8.0, sex: 'M', weight: 56, condition: 6 },
    { id: '6',  gateNumber: 6,  name: 'シャンパンカラー',     jockey: '岩田康誠',   runningStyle: 'Senko',  predictionCount: 25,  simulatedOdds: 0, realOdds: 13.5, sex: 'M', weight: 57, condition: 5 },
    { id: '7',  gateNumber: 7,  name: 'マジックサンズ',       jockey: '横山和生',   runningStyle: 'Sashi',  predictionCount: 15,  simulatedOdds: 0, realOdds: 19.5, sex: 'M', weight: 57, condition: 5 },
    { id: '8',  gateNumber: 8,  name: 'サイルーン',           jockey: '佐々木大輔', runningStyle: 'Senko',  predictionCount: 10,  simulatedOdds: 0, realOdds: 28.5, sex: 'M', weight: 57, condition: 5 },
    { id: '9',  gateNumber: 9,  name: 'ニシノエージェント',   jockey: '未定',       runningStyle: 'Sashi',  predictionCount: 3,   simulatedOdds: 0, realOdds: 35.0, sex: 'M', weight: 57, condition: 4 },
    { id: '10', gateNumber: 10, name: 'マイネルモーント',     jockey: '石川裕紀人', runningStyle: 'Oikomi', predictionCount: 5,   simulatedOdds: 0, realOdds: 36.5, sex: 'M', weight: 57, condition: 5 },
    { id: '11', gateNumber: 11, name: 'ショウナンマグマ',     jockey: '吉田豊',     runningStyle: 'Nige',   predictionCount: 3,   simulatedOdds: 0, realOdds: 50.0, sex: 'M', weight: 57, condition: 5 },
    { id: '12', gateNumber: 12, name: 'オニャンコポン',       jockey: '菅原明良',   runningStyle: 'Senko',  predictionCount: 8,   simulatedOdds: 0, realOdds: 50.0, sex: 'M', weight: 57, condition: 4 },
    { id: '13', gateNumber: 13, name: 'サンストックトン',     jockey: '松岡正海',   runningStyle: 'Sashi',  predictionCount: 2,   simulatedOdds: 0, realOdds: 60.0, sex: 'M', weight: 57, condition: 4 },
    { id: '14', gateNumber: 14, name: 'スパークリシャール',   jockey: '未定',       runningStyle: 'Senko',  predictionCount: 12,  simulatedOdds: 0, realOdds: 63.5, sex: 'M', weight: 57, condition: 4 },
], 1800);

/** オーシャンS 2026 特別登録馬（2/24時点・集合知スコアはネット話題度暫定値）
 *  混合戦 G3別定: 基本 牡57kg / 牝55kg + 重賞勝ち加算
 *  ルガル 58kg（G1勝ち+1）、ママコチャ 56kg（重賞勝ち+1）、ファンダム 牡57kg
 *  状態値: G1馬の格落ち出走、成績のムラ、高齢馬の衰えなどを反映 */
const OCEAN_STAKES_HORSES: Horse[] = assignAbilities([
    { id: '1',  gateNumber: 1,  name: 'ママコチャ',           jockey: '川田将雅',   runningStyle: 'Senko',  predictionCount: 120, simulatedOdds: 0, realOdds: 3.0, sex: 'F', weight: 56, condition: 6 },
    { id: '2',  gateNumber: 2,  name: 'ファンダム',           jockey: 'C.ルメール', runningStyle: 'Senko',  predictionCount: 60,  simulatedOdds: 0, realOdds: 4.0, sex: 'M', weight: 57, condition: 6 },
    { id: '3',  gateNumber: 3,  name: 'ルガル',               jockey: '鮫島駿',     runningStyle: 'Senko',  predictionCount: 100, simulatedOdds: 0, realOdds: 4.5, sex: 'M', weight: 58, condition: 8 },
    { id: '4',  gateNumber: 4,  name: 'インビンシブルパパ',   jockey: '佐々木大輔', runningStyle: 'Nige',   predictionCount: 40,  simulatedOdds: 0, realOdds: 6.5, sex: 'M', weight: 57, condition: 7 },
    { id: '5',  gateNumber: 5,  name: 'レイピア',             jockey: '戸崎圭太',   runningStyle: 'Sashi',  predictionCount: 20,  simulatedOdds: 0, realOdds: 10.5, sex: 'M', weight: 57, condition: 5 },
    { id: '6',  gateNumber: 6,  name: 'フリッカージャブ',     jockey: '松山弘平',   runningStyle: 'Senko',  predictionCount: 15,  simulatedOdds: 0, realOdds: 16.5, sex: 'M', weight: 57, condition: 5 },
    { id: '7',  gateNumber: 7,  name: 'ルージュラナキラ',     jockey: '横山武史',   runningStyle: 'Sashi',  predictionCount: 12,  simulatedOdds: 0, realOdds: 18.5, sex: 'F', weight: 55, condition: 5 },
    { id: '8',  gateNumber: 8,  name: 'ヨシノイースター',     jockey: '田辺裕信',   runningStyle: 'Sashi',  predictionCount: 10,  simulatedOdds: 0, realOdds: 23.0, sex: 'M', weight: 57, condition: 5 },
    { id: '9',  gateNumber: 9,  name: 'ビッグシーザー',       jockey: '北村友一',   runningStyle: 'Nige',   predictionCount: 8,   simulatedOdds: 0, realOdds: 25.5, sex: 'M', weight: 57, condition: 5 },
    { id: '10', gateNumber: 10, name: 'ピューロマジック',     jockey: '横山和生',   runningStyle: 'Nige',   predictionCount: 15,  simulatedOdds: 0, realOdds: 29.0, sex: 'F', weight: 55, condition: 4 },
    { id: '11', gateNumber: 11, name: 'ペアポルックス',       jockey: '岩田康誠',   runningStyle: 'Sashi',  predictionCount: 5,   simulatedOdds: 0, realOdds: 35.0, sex: 'M', weight: 57, condition: 4 },
    { id: '12', gateNumber: 12, name: 'ウイングレイテスト',   jockey: '松岡正海',   runningStyle: 'Senko',  predictionCount: 5,   simulatedOdds: 0, realOdds: 36.0, sex: 'M', weight: 57, condition: 4 },
    { id: '13', gateNumber: 13, name: 'フィオライア',         jockey: '太宰啓介',   runningStyle: 'Sashi',  predictionCount: 8,   simulatedOdds: 0, realOdds: 43.0, sex: 'F', weight: 55, condition: 5 },
    { id: '14', gateNumber: 14, name: 'フリームファクシ',     jockey: '菅原明良',   runningStyle: 'Senko',  predictionCount: 2,   simulatedOdds: 0, realOdds: 55.0, sex: 'M', weight: 57, condition: 4 },
    { id: '15', gateNumber: 15, name: 'オタルエバー',         jockey: '大野拓弥',   runningStyle: 'Sashi',  predictionCount: 1,   simulatedOdds: 0, realOdds: 60.0, sex: 'M', weight: 57, condition: 3 },
    { id: '16', gateNumber: 16, name: 'カリボール',           jockey: '柴田善臣',   runningStyle: 'Senko',  predictionCount: 1,   simulatedOdds: 0, realOdds: 80.0, sex: 'M', weight: 57, condition: 3 },
], 1200);

/** チューリップ賞 2026 特別登録馬（2/24時点・集合知スコアはネット話題度暫定値）
 *  牝馬限定 G2: 全馬55kg（3歳牝馬限定）
 *  状態値: キャリアの浅い3歳馬 — 前走内容・勢いで判断 */
const TULIP_SHO_HORSES: Horse[] = assignAbilities([
    { id: '1',  gateNumber: 1,  name: 'アランカール',         jockey: '武豊',       runningStyle: 'Senko',  predictionCount: 130, simulatedOdds: 0, realOdds: 2.0, sex: 'F', weight: 55, condition: 8 },
    { id: '2',  gateNumber: 2,  name: 'タイセイボーグ',       jockey: '西村淳也',   runningStyle: 'Senko',  predictionCount: 90,  simulatedOdds: 0, realOdds: 4.0, sex: 'F', weight: 55, condition: 7 },
    { id: '3',  gateNumber: 3,  name: 'コニーアイランド',     jockey: '川田将雅',   runningStyle: 'Sashi',  predictionCount: 50,  simulatedOdds: 0, realOdds: 6.5, sex: 'F', weight: 55, condition: 6 },
    { id: '4',  gateNumber: 4,  name: 'ソルパッサーレ',       jockey: '浜中俊',     runningStyle: 'Sashi',  predictionCount: 20,  simulatedOdds: 0, realOdds: 10.5, sex: 'F', weight: 55, condition: 5 },
    { id: '5',  gateNumber: 5,  name: 'ホワイトオーキッド',   jockey: '松山弘平',   runningStyle: 'Senko',  predictionCount: 15,  simulatedOdds: 0, realOdds: 15.0, sex: 'F', weight: 55, condition: 5 },
    { id: '6',  gateNumber: 6,  name: 'ナムラコスモス',       jockey: '田口貫太',   runningStyle: 'Senko',  predictionCount: 8,   simulatedOdds: 0, realOdds: 19.5, sex: 'F', weight: 55, condition: 5 },
    { id: '7',  gateNumber: 7,  name: 'エレガンスアスク',     jockey: '坂井瑠星',   runningStyle: 'Sashi',  predictionCount: 10,  simulatedOdds: 0, realOdds: 23.5, sex: 'F', weight: 55, condition: 5 },
    { id: '8',  gateNumber: 8,  name: 'スマートプリエール',   jockey: '吉村誠之助', runningStyle: 'Senko',  predictionCount: 5,   simulatedOdds: 0, realOdds: 28.0, sex: 'F', weight: 55, condition: 4 },
    { id: '9',  gateNumber: 9,  name: 'エイズルブルーム',     jockey: '池添謙一',   runningStyle: 'Sashi',  predictionCount: 5,   simulatedOdds: 0, realOdds: 33.0, sex: 'F', weight: 55, condition: 5 },
    { id: '10', gateNumber: 10, name: 'ダンデノン',           jockey: '北村友一',   runningStyle: 'Senko',  predictionCount: 3,   simulatedOdds: 0, realOdds: 46.5, sex: 'F', weight: 55, condition: 4 },
    { id: '11', gateNumber: 11, name: 'グランドオーパス',     jockey: '高杉吏麒',   runningStyle: 'Sashi',  predictionCount: 2,   simulatedOdds: 0, realOdds: 55.0, sex: 'F', weight: 55, condition: 4 },
    { id: '12', gateNumber: 12, name: 'グレースジェンヌ',     jockey: '岩田望来',   runningStyle: 'Senko',  predictionCount: 2,   simulatedOdds: 0, realOdds: 60.0, sex: 'F', weight: 55, condition: 4 },
    { id: '13', gateNumber: 13, name: 'ダンシングドール',     jockey: '未定',       runningStyle: 'Sashi',  predictionCount: 1,   simulatedOdds: 0, realOdds: 80.0, sex: 'F', weight: 55, condition: 3 },
    { id: '14', gateNumber: 14, name: 'アンディムジーク',     jockey: '未定',       runningStyle: 'Senko',  predictionCount: 1,   simulatedOdds: 0, realOdds: 80.0, sex: 'F', weight: 55, condition: 3 },
    { id: '15', gateNumber: 15, name: 'サキドリトッケン',     jockey: '飛田愛斗',   runningStyle: 'Senko',  predictionCount: 3,   simulatedOdds: 0, realOdds: 100.0, sex: 'F', weight: 55, condition: 4 },
], 1600);

// ============================================================
// コースID → デフォルト馬データのマッピング
// ============================================================
const DEFAULT_HORSES_MAP: Record<string, Horse[]> = {
    'nakayama-turf-1800': NAKAYAMA_KINEN_HORSES,
    'nakayama-turf-1200': OCEAN_STAKES_HORSES,
    'hanshin-turf-1600':  TULIP_SHO_HORSES,
};

// ============================================================
// フェブラリーS 2026 アーカイブデータ（G1定量: 牡58kg / 牝56kg）
// ============================================================
export const ARCHIVED_RACES: ArchivedRace[] = [
    {
        courseId: 'tokyo-dirt-1600',
        label: 'フェブラリーS 2026',
        date: '2026-02-22',
        hashtag: '#フェブラリーS',
        horses: [
            { id: '1', gateNumber: 1, name: 'オメガギネス', jockey: '岩田康誠', speed: 85, stamina: 82, power: 80, guts: 80, runningStyle: 'Sashi', predictionCount: 20, simulatedOdds: 0, realOdds: 19.6, sex: 'M', weight: 58, condition: 5 },
            { id: '2', gateNumber: 2, name: 'ハッピーマン', jockey: '高杉吏麒', speed: 80, stamina: 80, power: 78, guts: 75, runningStyle: 'Sashi', predictionCount: 5, simulatedOdds: 0, realOdds: 68.1, sex: 'M', weight: 58, condition: 4 },
            { id: '3', gateNumber: 3, name: 'ブライアンセンス', jockey: '岩田望来', speed: 81, stamina: 82, power: 80, guts: 78, runningStyle: 'Sashi', predictionCount: 8, simulatedOdds: 0, realOdds: 60.3, sex: 'M', weight: 58, condition: 5 },
            { id: '4', gateNumber: 4, name: 'ペリエール', jockey: '佐々木大輔', speed: 82, stamina: 80, power: 85, guts: 80, runningStyle: 'Sashi', predictionCount: 15, simulatedOdds: 0, realOdds: 32.4, sex: 'M', weight: 58, condition: 5 },
            { id: '5', gateNumber: 5, name: 'シックスペンス', jockey: '戸崎圭太', speed: 86, stamina: 84, power: 82, guts: 85, runningStyle: 'Senko', predictionCount: 40, simulatedOdds: 0, realOdds: 17.3, sex: 'M', weight: 58, condition: 5 },
            { id: '6', gateNumber: 6, name: 'ラムジェット', jockey: '三浦皇成', speed: 88, stamina: 90, power: 92, guts: 88, runningStyle: 'Oikomi', predictionCount: 120, simulatedOdds: 0, realOdds: 8.3, sex: 'M', weight: 58, condition: 7 },
            { id: '7', gateNumber: 7, name: 'ロングラン', jockey: '荻野極', speed: 78, stamina: 85, power: 80, guts: 82, runningStyle: 'Sashi', predictionCount: 2, simulatedOdds: 0, realOdds: 157.4, sex: 'M', weight: 58, condition: 3 },
            { id: '8', gateNumber: 8, name: 'サクラトゥジュール', jockey: 'R.キング', speed: 82, stamina: 80, power: 80, guts: 78, runningStyle: 'Sashi', predictionCount: 10, simulatedOdds: 0, realOdds: 43.0, sex: 'M', weight: 58, condition: 5 },
            { id: '9', gateNumber: 9, name: 'ダブルハートボンド', jockey: '坂井瑠星', speed: 92, stamina: 88, power: 85, guts: 90, runningStyle: 'Senko', predictionCount: 180, simulatedOdds: 0, realOdds: 2.9, sex: 'F', weight: 56, condition: 8 },
            { id: '10', gateNumber: 10, name: 'サンデーファンデー', jockey: '横山和生', speed: 84, stamina: 82, power: 80, guts: 80, runningStyle: 'Senko', predictionCount: 25, simulatedOdds: 0, realOdds: 17.0, sex: 'M', weight: 58, condition: 5 },
            { id: '11', gateNumber: 11, name: 'サンライズホーク', jockey: '松岡正海', speed: 75, stamina: 80, power: 82, guts: 80, runningStyle: 'Sashi', predictionCount: 1, simulatedOdds: 0, realOdds: 227.2, sex: 'M', weight: 58, condition: 3 },
            { id: '12', gateNumber: 12, name: 'コスタノヴァ', jockey: 'C.ルメール', speed: 90, stamina: 85, power: 88, guts: 90, runningStyle: 'Sashi', predictionCount: 160, simulatedOdds: 0, realOdds: 3.5, sex: 'M', weight: 58, condition: 7 },
            { id: '13', gateNumber: 13, name: 'ナチュラルライズ', jockey: '横山武史', speed: 88, stamina: 85, power: 80, guts: 85, runningStyle: 'Nige', predictionCount: 140, simulatedOdds: 0, realOdds: 21.9, sex: 'M', weight: 58, condition: 6 },
            { id: '14', gateNumber: 14, name: 'ウィルソンテソーロ', jockey: '川田将雅', speed: 85, stamina: 88, power: 90, guts: 92, runningStyle: 'Senko', predictionCount: 30, simulatedOdds: 0, realOdds: 6.2, sex: 'M', weight: 58, condition: 6 },
            { id: '15', gateNumber: 15, name: 'ペプチドナイル', jockey: '富田暁', speed: 83, stamina: 85, power: 85, guts: 80, runningStyle: 'Senko', predictionCount: 12, simulatedOdds: 0, realOdds: 57.8, sex: 'M', weight: 58, condition: 4 },
            { id: '16', gateNumber: 16, name: 'サイモンザナドゥ', jockey: '池添謙一', speed: 81, stamina: 84, power: 82, guts: 85, runningStyle: 'Sashi', predictionCount: 10, simulatedOdds: 0, realOdds: 59.6, sex: 'M', weight: 58, condition: 5 },
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
        sex: 'M' as const,
        weight: 57,
        condition: 5,
    }));
}

/**
 * コースIDがアーカイブレースかどうか判定
 */
export function isArchivedCourse(courseId: string): boolean {
    return ARCHIVED_RACES.some(r => r.courseId === courseId);
}
