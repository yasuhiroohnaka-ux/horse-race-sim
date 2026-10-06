import type { PredictionSnapshot } from './types';
import { buildPredictionSnapshotSourceStatusSummary } from './sourceStatus';

export function snapshotPreference(snapshot: PredictionSnapshot) {
  const { snapshotId, raceId, capturedAt, snapshotTakenAt, scheduledStartTime, raceDate,
    predictionOrigin, snapshotType, sourceStatus, livePreRaceEligible, dataQuality, dataLineage } = snapshot;
  return { snapshotId, raceId, capturedAt, snapshotTakenAt, scheduledStartTime, raceDate,
    predictionOrigin, snapshotType, sourceStatus, livePreRaceEligible,
    dataQuality: { fieldComplete: dataQuality?.fieldComplete }, dataLineage: { sourceStatus: dataLineage?.sourceStatus } };
}
export async function snapshotHash(snapshot: PredictionSnapshot) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(snapshot)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2,'0')).join('');
}
export async function snapshotMetadata(snapshot: PredictionSnapshot) {
  return { version: '1', raceId: snapshot.raceId, preference: JSON.stringify(snapshotPreference(snapshot)),
    summary: JSON.stringify(buildPredictionSnapshotSourceStatusSummary([snapshot])), sha256: await snapshotHash(snapshot) };
}
