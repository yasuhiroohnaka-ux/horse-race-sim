import { checkPublicRoutes } from './cloudflare-public-checks.mjs';
const base='https://horse-race-sim.svo-app.workers.dev';
console.log(JSON.stringify(await checkPublicRoutes((route:string,options:RequestInit)=>fetch(base+route,{...options,signal:AbortSignal.timeout(45000)}),{live:true})));
