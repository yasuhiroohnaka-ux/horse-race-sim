import { Course } from "./types";
export type { Course };


export const COURSES: Course[] = [
    // ── 今週のレース（2026/3/1） ──
    {
        id: 'nakayama-turf-1800',
        name: '中山 芝 1800m (中山記念)',
        distance: 1800,
        surface: 'Turf',
        straightLength: 310,
        hashtag: '#中山記念',
        segments: [
            { distance: 176, slope: -0.5, type: 'straight' },
            { distance: 300, slope: 0, type: 'corner' },
            { distance: 300, slope: 0, type: 'corner' },
            { distance: 414, slope: 0, type: 'straight' },
            { distance: 300, slope: 0, type: 'corner' },
            { distance: 310, slope: 2.2, type: 'straight' },
        ]
    },
    {
        id: 'nakayama-turf-1200',
        name: '中山 芝 1200m (オーシャンS)',
        distance: 1200,
        surface: 'Turf',
        straightLength: 310,
        hashtag: '#オーシャンS',
        segments: [
            { distance: 290, slope: -1.0, type: 'straight' },
            { distance: 300, slope: 0, type: 'corner' },
            { distance: 300, slope: 0, type: 'corner' },
            { distance: 310, slope: 2.2, type: 'straight' },
        ]
    },
    {
        id: 'hanshin-turf-1600',
        name: '阪神 芝 1600m (チューリップ賞)',
        distance: 1600,
        surface: 'Turf',
        straightLength: 473.6,
        hashtag: '#チューリップ賞',
        segments: [
            { distance: 176, slope: 0, type: 'straight' },
            { distance: 300, slope: 0, type: 'corner' },
            { distance: 350, slope: -0.5, type: 'straight' },
            { distance: 300, slope: 0, type: 'corner' },
            { distance: 474, slope: 1.5, type: 'straight' },
        ]
    },
    // ── 通年コース ──
    {
        id: 'tokyo-2400',
        name: '東京 芝 2400m (日本ダービー/ジャパンC)',
        distance: 2400,
        surface: 'Turf',
        straightLength: 525.9,
        hashtag: '#日本ダービー',
        segments: [
            { distance: 300, slope: 0, type: 'straight' },
            { distance: 400, slope: 0, type: 'corner' },
            { distance: 400, slope: 0, type: 'corner' },
            { distance: 450, slope: -1.0, type: 'straight' },
            { distance: 300, slope: 0, type: 'corner' },
            { distance: 300, slope: 0.5, type: 'corner' },
            { distance: 525, slope: 2.0, type: 'straight' },
        ]
    },
    {
        id: 'nakayama-2500',
        name: '中山 芝 2500m (有馬記念)',
        distance: 2500,
        surface: 'Turf',
        straightLength: 310,
        hashtag: '#有馬記念',
        segments: [
            { distance: 200, slope: -1.0, type: 'straight' },
            { distance: 400, slope: 0, type: 'corner' },
            { distance: 400, slope: 0, type: 'corner' },
            { distance: 310, slope: 2.2, type: 'straight' },
            { distance: 400, slope: 0, type: 'corner' },
            { distance: 400, slope: 0, type: 'corner' },
            { distance: 400, slope: -1.0, type: 'straight' },
            { distance: 400, slope: 0, type: 'corner' },
            { distance: 400, slope: 0, type: 'corner' },
            { distance: 310, slope: 2.2, type: 'straight' },
        ]
    },
    // ── アーカイブ ──
    {
        id: 'tokyo-dirt-1600',
        name: '東京 ダート 1600m (フェブラリーS)',
        distance: 1600,
        surface: 'Dirt',
        straightLength: 501.6,
        hashtag: '#フェブラリーS',
        archived: true,
        segments: [
            { distance: 400, slope: 0, type: 'straight' },
            { distance: 350, slope: 0, type: 'corner' },
            { distance: 350, slope: 0, type: 'corner' },
            { distance: 501, slope: 2.0, type: 'straight' },
        ]
    },
];

/** アクティブ（非アーカイブ）コースのみ */
export const ACTIVE_COURSES = COURSES.filter(c => !c.archived);

/** アーカイブ済みコースのみ */
export const ARCHIVED_COURSES = COURSES.filter(c => c.archived);
