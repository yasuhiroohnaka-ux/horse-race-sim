import { Course } from "./types";
export type { Course };


export const COURSES: Course[] = [
    {
        id: 'tokyo-dirt-1600',
        name: '東京 ダート 1600m (フェブラリーS)',
        distance: 1600,
        surface: 'Dirt',
        straightLength: 501.6,
        segments: [
            { distance: 400, slope: 0, type: 'straight' },
            { distance: 350, slope: 0, type: 'corner' },
            { distance: 350, slope: 0, type: 'corner' },
            { distance: 501, slope: 2.0, type: 'straight' },
        ]
    },
    {
        id: 'tokyo-2400',
        name: '東京 芝 2400m (日本ダービー/ジャパンC)',
        distance: 2400,
        surface: 'Turf',
        straightLength: 525.9,
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
];
