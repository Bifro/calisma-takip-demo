// Isolated local preview: Firestore requests are intercepted in this page only.
// No preview interaction reads or writes the production database.
const http=require('node:http');const fs=require('node:fs');const path=require('node:path');
const fixture=`<script>
(()=>{const nativeFetch=window.fetch.bind(window);let version=1,fields={
sessions:{stringValue:'[]'},tasks:{stringValue:'{"daily":[],"weekly":[]}'},dayTasks:{stringValue:'{}'},weekTasks:{stringValue:'{}'},dayGoals:{stringValue:'{}'},runningStart:{stringValue:'null'}};
window.fetch=async function(url,options){if(!String(url).startsWith('https://firestore.googleapis.com/'))return nativeFetch(url,options);
if(new URL(location.href).searchParams.has('offline'))throw new Error('Preview offline');
if(options&&options.method==='PATCH'){if(new URL(url).searchParams.get('currentDocument.updateTime')!=='preview-'+version)return new Response('{}',{status:412});
Object.assign(fields,JSON.parse(options.body).fields);version++;}
return new Response(JSON.stringify({fields,updateTime:'preview-'+version}),{status:200,headers:{'Content-Type':'application/json'}});};})();
</script>`;
http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const files={'/':'index.html','/index.html':'index.html','/plan.js':'plan.js','/workflow.js':'workflow.js','/plan.css':'plan.css','/mobile.css':'mobile.css','/favicon.ico':'favicon.ico','/site.webmanifest':'site.webmanifest','/assets/logo.png':'assets/logo.png','/assets/icon-192.png':'assets/icon-192.png','/assets/icon-512.png':'assets/icon-512.png','/assets/apple-touch-icon.png':'assets/apple-touch-icon.png'};
  const file=files[pathname];if(!file){res.writeHead(404);return res.end();}
  const binary=/\.(png|ico)$/.test(file);
  let content=fs.readFileSync(path.join(__dirname,file),binary?undefined:'utf8');
  if(file==='index.html')content=content.replace('<head>','<head>'+fixture);
  res.setHeader('Content-Type',file.endsWith('.png')?'image/png':file.endsWith('.ico')?'image/x-icon':file.endsWith('.webmanifest')?'application/manifest+json':file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html; charset=utf-8');
  res.end(content);
}).listen(Number(process.env.STUDY_PREVIEW_PORT||8765),'127.0.0.1',()=>console.log('Isolated local preview ready'));
