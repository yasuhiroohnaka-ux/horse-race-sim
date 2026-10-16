export const RETIRED_REVIEW_PATHS = [
  '/api/archive', '/api/performance', '/api/weekly-diagnostics',
  '/api/note-payload', '/api/note-draft', '/api/review-repair',
];

export function retiredReviewResponse() {
  return Response.json({
    ok: false,
    error: 'Detailed reviews are no longer published. Prediction capture and result settlement continue.',
    summaryUrl: '/api/performance/summary',
  }, { status: 410, headers: { 'Cache-Control': 'no-store', 'X-Horse-Response': 'retired-review' } });
}

export function publicReviewResponse(request) {
  const pathname = decodeURI(new URL(request.url).pathname).replace(/\/+$/, '') || '/';
  if (pathname === '/archive') {
    return new Response(null, { status: 307, headers: { Location: '/#performance', 'Cache-Control': 'no-store' } });
  }
  if (RETIRED_REVIEW_PATHS.includes(pathname)) {
    const response = retiredReviewResponse();
    return request.method === 'HEAD' ? new Response(null, response) : response;
  }
  return null;
}
