import { Horse } from './types';

export interface ArchivedRace {
    courseId: string;
    label: string;
    date: string;
    hashtag: string;
    horses: Horse[];
}

// フェブラリーS 2026 アーカイブデータ
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

/**
 * コースIDに応じたデフォルト馬データを返す
 * アーカイブデータがあればそれを返し、なければプレースホルダーを生成
 */
export function getDefaultHorses(courseId: string): Horse[] {
    const archived = ARCHIVED_RACES.find(r => r.courseId === courseId);
    if (archived) return archived.horses.map(h => ({ ...h })); // deep copy

    // 新規レース用プレースホルダー（8頭）
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
