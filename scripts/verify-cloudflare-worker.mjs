import { unstable_dev } from 'wrangler';
import { checkPublicRoutes } from './cloudflare-public-checks.mjs';
const worker=await unstable_dev('dist/server/static-entry.mjs',{config:'dist/server/wrangler.json',local:true,persist:false,port:0,inspectorPort:0,logLevel:'error',experimental:{disableExperimentalWarning:true,disableDevRegistry:true,watch:false,enableContainers:false}});
try { console.log(JSON.stringify(await checkPublicRoutes((route,options)=>worker.fetch(route,options)))); }
finally { await worker.stop(); }
