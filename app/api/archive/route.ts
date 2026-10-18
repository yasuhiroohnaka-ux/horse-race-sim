import { retiredReviewResponse } from '@/lib/publicReviewAccess.mjs';

export function GET() {
  return retiredReviewResponse();
}
