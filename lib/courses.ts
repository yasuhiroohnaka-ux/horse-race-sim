import { Course } from "./types";
export type { Course };


export const COURSES: Course[] = [
    {
        id: 'tokyo-2400',
        name: 'Tokyo Turf 2400m (Japan Cup)',
        distance: 2400,
        surface: 'Turf',
        straightLength: 525.9,
        segments: [
            { distance: 300, slope: 0, type: 'straight' },
            { distance: 400, slope: 0, type: 'corner' }, // 1st corner
            { distance: 400, slope: 0, type: 'corner' }, // 2nd corner
            { distance: 450, slope: -1.0, type: 'straight' }, // Backstretch (slight down)
            { distance: 300, slope: 0, type: 'corner' }, // 3rd corner
            { distance: 300, slope: 0.5, type: 'corner' }, // 4th corner
            { distance: 525, slope: 2.0, type: 'straight' }, // Final Straight (Uphill then flat)
        ]
    },
    {
        id: 'nakayama-2500',
        name: 'Nakayama Turf 2500m (Arima Kinen)',
        distance: 2500,
        surface: 'Turf',
        straightLength: 310,
        segments: [
            { distance: 200, slope: -1.0, type: 'straight' }, // Start
            { distance: 400, slope: 0, type: 'corner' }, // 3rd corner (1st lap)
            { distance: 400, slope: 0, type: 'corner' }, // 4th corner (1st lap)
            { distance: 310, slope: 2.2, type: 'straight' }, // Home straight 1
            { distance: 400, slope: 0, type: 'corner' }, // 1st corner
            { distance: 400, slope: 0, type: 'corner' }, // 2nd corner
            { distance: 400, slope: -1.0, type: 'straight' }, // Backstretch
            { distance: 400, slope: 0, type: 'corner' }, // 3rd corner
            { distance: 400, slope: 0, type: 'corner' }, // 4th corner
            { distance: 310, slope: 2.2, type: 'straight' }, // Final Straight (Steep Uphill)
        ]
    },
    {
        id: 'hanshin-2200',
        name: 'Hanshin Turf 2200m (Takarazuka Kinen)',
        distance: 2200,
        surface: 'Turf',
        straightLength: 356.5, // Inner loop mostly used for 2200m
        segments: [
            { distance: 200, slope: -1.0, type: 'straight' },
            { distance: 400, slope: 0, type: 'corner' },
            { distance: 400, slope: 0, type: 'straight' },
            { distance: 400, slope: 0, type: 'corner' },
            { distance: 400, slope: 0, type: 'corner' },
            { distance: 356, slope: 1.8, type: 'straight' },
        ]
    }
];
