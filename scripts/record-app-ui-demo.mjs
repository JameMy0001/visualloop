// Captures the running VisualLoop WEB frontend and real Core Server revision pipeline.
// The AI-compatible endpoint is a deterministic local TEST PROVIDER, not a live AI model.
// Only real UI events, real feedback submissions, and a validated file revision are recorded.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const ROOT=process.cwd(), OUT=path.join(ROOT,"docs/assets/visualloop-app-capture.gif");
const workspace=fs.mkdtempSync(path.join(os.tmpdir(),"visualloop-demo-"));
const framesDir=path.join(workspace,"frames");
fs.mkdirSync(framesDir);
const svgFile=path.join(workspace,"dashboard.svg");
const processes=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const W=1180,H=720,FPS=7;
let index=0, cdp, chrome;
const SVG1='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 600" width="960" height="600"><rect width="960" height="600" fill="#F1F5F9"/><rect x="32" y="28" width="896" height="544" rx="18" fill="white"/><text x="65" y="86" font-family="Arial,sans-serif" font-size="34" fill="#111827" font-weight="bold">NOVA / analytics</text><text x="65" y="113" font-family="Arial,sans-serif" font-size="16" fill="#64748b">Dashboard draft • needs review</text><rect x="65" y="151" width="252" height="155" rx="6" fill="#CBD5E1"/><text x="89" y="184" font-family="Arial" font-size="15" fill="#64748b">TOTAL REVENUE</text><text x="89" y="255" font-family="Arial" font-size="49" fill="#64748b">$48</text><rect x="330" y="151" width="252" height="155" rx="6" fill="#CBD5E1"/><text x="355" y="184" font-family="Arial" font-size="15" fill="#64748b">ACTIVE USERS</text><text x="355" y="255" font-family="Arial" font-size="49" fill="#64748b">???</text><rect x="595" y="151" width="265" height="155" rx="6" fill="#FCA5A5"/><text x="620" y="184" font-family="Arial" font-size="15" fill="#991b1b">CONVERSION</text><text x="620" y="256" font-family="Arial" font-size="46" fill="#991b1b">0.0%</text><rect x="65" y="336" width="796" height="181" rx="7" fill="#F1F5F9"/><text x="89" y="369" font-family="Arial" font-size="19" fill="#475569">Revenue trend</text><path d="M95 465 L200 459 L305 480 L415 422 L520 493 L625 387 L815 470" fill="none" stroke="#94a3b8" stroke-width="7" stroke-linecap="square"/><text x="724" y="546" font-family="Arial" font-size="15" fill="#ef4444">Unstyled / Draft 01</text></svg>';
const SVG2='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 600" width="960" height="600"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0F172A"/><stop offset="1" stop-color="#132B45"/></linearGradient><linearGradient id="chart" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#2DD4BF" stop-opacity=".40"/><stop offset="1" stop-color="#2DD4BF" stop-opacity=".01"/></linearGradient></defs><rect width="960" height="600" rx="18" fill="url(#bg)"/><rect x="26" y="25" width="908" height="550" rx="17" fill="#111C32" stroke="#334155"/><circle cx="63" cy="67" r="11" fill="#2DD4BF"/><text x="90" y="76" font-family="Arial,sans-serif" font-size="28" fill="#F8FAFC" font-weight="bold">NOVA <tspan fill="#2DD4BF">/</tspan> analytics</text><text x="64" y="117" font-family="Arial,sans-serif" font-size="15" fill="#94A3B8">Performance overview  /  Last 30 days</text><rect x="65" y="152" width="250" height="145" rx="14" fill="#1E293B" stroke="#334155"/><text x="89" y="190" font-family="Arial" font-size="15" fill="#94A3B8">TOTAL REVENUE</text><text x="89" y="248" font-family="Arial" font-size="41" fill="#FFFFFF" font-weight="bold">$48,920</text><text x="89" y="276" font-family="Arial" font-size="14" fill="#2DD4BF">↑ 12.8% vs last month</text><rect x="330" y="152" width="250" height="145" rx="14" fill="#1E293B" stroke="#334155"/><text x="354" y="190" font-family="Arial" font-size="15" fill="#94A3B8">ACTIVE USERS</text><text x="354" y="248" font-family="Arial" font-size="41" fill="#FFFFFF" font-weight="bold">12,480</text><text x="354" y="276" font-family="Arial" font-size="14" fill="#2DD4BF">↑ 8.2% vs last month</text><rect x="595" y="152" width="264" height="145" rx="14" fill="#1E293B" stroke="#334155"/><text x="620" y="190" font-family="Arial" font-size="15" fill="#94A3B8">CONVERSION RATE</text><text x="620" y="248" font-family="Arial" font-size="41" fill="#FFFFFF" font-weight="bold">6.42%</text><text x="620" y="276" font-family="Arial" font-size="14" fill="#2DD4BF">↑ 2.4 pts improvement</text><rect x="65" y="327" width="795" height="209" rx="14" fill="#1E293B" stroke="#334155"/><text x="90" y="368" font-family="Arial" font-size="19" fill="#F8FAFC" font-weight="bold">Revenue performance</text><path d="M98 481 L202 464 L305 470 L415 428 L520 437 L626 390 L737 411 L824 366 L824 506 L98 506Z" fill="url(#chart)"/><path d="M98 481 L202 464 L305 470 L415 428 L520 437 L626 390 L737 411 L824 366" fill="none" stroke="#2DD4BF" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><g stroke="#334155" stroke-width="2"><path d="M98 507H824"/><path d="M98 457H824" stroke-dasharray="5 6"/><path d="M98 407H824" stroke-dasharray="5 6"/></g><text x="705" y="554" font-family="Arial" font-size="14" fill="#2DD4BF">REFINED / REV 02</text></svg>';
fs.writeFileSync(svgFile,SVG1);
function assert(ok,msg){if(!ok)throw new Error(msg);}
async function waitUntil(fn,ms=25000){const start=Date.now();let last;while(Date.now()-start<ms){try{const a=await fn();if(a)return a;}catch(e){last=e;}await sleep(250)}throw new Error("Timed out waiting: "+String(last||fn));}
async function api(url,body){const r=await fetch("http://127.0.0.1:4178"+url,body===undefined?{}:{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});const t=await r.text();assert(r.ok,"API "+url+" "+r.status+" "+t.slice(0,300));return JSON.parse(t)}
function start(cmd,args,extra={}){const p=spawn(cmd,args,{cwd:ROOT,stdio:["ignore","pipe","pipe"],...extra});p.stdout?.on("data",x=>{if(process.env.DEMO_VERBOSE)process.stdout.write(String(x))});p.stderr?.on("data",x=>process.stderr.write(String(x)));processes.push(p);return p}
const aiServer=http.createServer(async(req,res)=>{if(req.method!=="POST"||req.url!=="/v1/chat/completions"){res.writeHead(404);res.end();return}try{let body="";for await(const chunk of req)body+=chunk;const p=JSON.parse(body);assert(p.messages?.[0]?.content.includes("CURRENT CODE"),"Expected genuine VisualLoop AI prompt");await sleep(1800);res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({choices:[{message:{role:"assistant",content:SVG2}}]}))}catch(e){res.writeHead(500);res.end(String(e))}});
class CDP{constructor(ws){this.ws=new WebSocket(ws);this.id=0;this.pending=new Map()}async open(){await new Promise((res,rej)=>{this.ws.addEventListener("open",res,{once:true});this.ws.addEventListener("error",rej,{once:true})});this.ws.addEventListener("message",e=>{const msg=JSON.parse(e.data);if(msg.id&&this.pending.has(msg.id)){const p=this.pending.get(msg.id);this.pending.delete(msg.id);msg.error?p.reject(Error(JSON.stringify(msg.error))):p.resolve(msg.result)}})}send(method,params={}){return new Promise((resolve,reject)=>{const id=++this.id;this.pending.set(id,{resolve,reject});this.ws.send(JSON.stringify({id,method,params}))})}close(){this.ws.close()}}
async function ev(expression){const r=await cdp.send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value}
async function cursor(x,y){await ev('var p=document.getElementById("__demoPointer");if(p){p.style.left="'+x+'px";p.style.top="'+y+'px"}')}
async function shot(){const b=(await cdp.send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false})).data;const p=path.join(framesDir,String(index++).padStart(4,"0")+".png");fs.writeFileSync(p,Buffer.from(b,"base64"));assert(fs.statSync(p).size>14000,"Blank/tiny screenshot "+p)}
async function hold(n){for(let i=0;i<n;i++)await shot()}
async function move(x,y,tx,ty,n=8,kind){for(let i=1;i<=n;i++){const t=i/n;const xx=Math.round(x+(tx-x)*t),yy=Math.round(y+(ty-y)*t);await cursor(xx,yy);if(kind)await cdp.send("Input.dispatchMouseEvent",{type:"mouseMoved",x:xx,y:yy,buttons:kind==="drag"?1:0});await shot()}}
async function click(x,y){await cursor(x,y);await cdp.send("Input.dispatchMouseEvent",{type:"mousePressed",x,y,button:"left",clickCount:1});await cdp.send("Input.dispatchMouseEvent",{type:"mouseReleased",x,y,button:"left",clickCount:1})}
async function box(query){return await ev('(()=>{const e=document.querySelector('+JSON.stringify(query)+');if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()')}
async function main(){
 try {
 await new Promise(r=>aiServer.listen(8099,"127.0.0.1",r));
 start("node",["packages/core-server/dist/cli.js","--no-auth"],{env:{...process.env,VISUALLOOP_NO_AUTH:"1",VISUALLOOP_AI_PROVIDER:"openai-compatible",VISUALLOOP_AI_MODEL:"local-model",OPENAI_COMPATIBLE_BASE_URL:"http://127.0.0.1:8099/v1",HOME:workspace}});
 await waitUntil(async()=>{try{return (await fetch("http://127.0.0.1:4178/v1/health")).ok}catch{return false}});
 start("pnpm",["--filter","@visualloop/desktop","dev:web","--host","127.0.0.1"],{env:{...process.env}});
 await waitUntil(async()=>{try{return (await fetch("http://127.0.0.1:5173")).ok}catch{return false}});
 const binary=process.env.CHROME_PATH||["/usr/bin/google-chrome","/usr/bin/chromium","/opt/google/chrome/chrome"].find(fs.existsSync);
 assert(binary,"Chromium/Chrome executable not found");
 chrome=start(binary,["--headless=new","--no-sandbox","--disable-dev-shm-usage","--disable-gpu","--no-first-run","--remote-debugging-port=9229","--remote-allow-origins=*","--user-data-dir="+path.join(workspace,"chrome")]);
 await waitUntil(async()=>{try{return (await fetch("http://127.0.0.1:9229/json/version")).ok}catch{return false}});
 const tab=await(await fetch("http://127.0.0.1:9229/json/new?http://127.0.0.1:5173",{method:"PUT"})).json();
 cdp=new CDP(tab.webSocketDebuggerUrl);await cdp.open();
 await cdp.send("Emulation.setDeviceMetricsOverride",{width:W,height:H,deviceScaleFactor:1,mobile:false});
 await cdp.send("Page.enable");
 await waitUntil(async()=>Boolean(await ev("document.querySelector('main') && document.querySelector('button')")));
 await ev('(()=>{const p=document.createElement("div");p.id="__demoPointer";p.style.cssText="position:fixed;left:590px;top:350px;width:18px;height:22px;z-index:999999;pointer-events:none;filter:drop-shadow(1px 2px 1px #0009)";p.innerHTML="<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 20 24\'><path d=\'M2 2L2 21L7 16L11 23L15 21L11 14L18 14Z\' fill=\'white\' stroke=\'#0f172a\' stroke-width=\'1.4\'/></svg>";document.body.appendChild(p)})()');
 await hold(5);
 const session=await api("/v1/sessions",{adapterId:"demo-recorder",agentName:"Demo agent (test provider)",workspaceRoot:workspace});
 const publication={sessionId:session.sessionId,artifactId:"demo_dashboard",revision:1,kind:"svg",entrypoint:"dashboard.svg",title:"NOVA Analytics — first draft",viewport:{width:960,height:600,devicePixelRatio:1,zoom:1,scrollX:0,scrollY:0}};
 await api("/v1/artifacts",publication);
 await waitUntil(async()=>!!(await ev("document.querySelector('.cursor-crosshair')")));
 await hold(10);
 // Ensure the current model points to the deterministic local test provider.
 assert(await ev('(()=>{const s=document.querySelector("select");if(!s)return false;s.value="openai-compatible:local-model";s.dispatchEvent(new Event("change",{bubbles:true}));return s.value==="openai-compatible:local-model"})()'),"Model selector missing");
 const canvas=await box(".cursor-crosshair");assert(canvas&&canvas.w>300&&canvas.h>240,"Real annotation canvas unavailable");
 const targets=[[.18,.18,.34,.32],[.51,.18,.74,.32],[.74,.52,.95,.81]];
 let x=850,y=620;
 for(const [ax,ay,bx,by] of targets){
  const sx=Math.round(canvas.x+canvas.w*ax),sy=Math.round(canvas.y+canvas.h*ay),ex=Math.round(canvas.x+canvas.w*bx),ey=Math.round(canvas.y+canvas.h*by);
  await move(x,y,sx,sy,5);await cdp.send("Input.dispatchMouseEvent",{type:"mousePressed",x:sx,y:sy,button:"left",clickCount:1});
  await move(sx,sy,ex,ey,7,"drag");await cdp.send("Input.dispatchMouseEvent",{type:"mouseReleased",x:ex,y:ey,button:"left",clickCount:1});await hold(3);x=ex;y=ey;
 }
 assert((await ev('document.querySelectorAll("input[placeholder=\'Describe what needs to change...\']").length'))>=3,"Real annotation state did not record 3 circles");
 const ta=await box('textarea[placeholder^="E.g."]');assert(ta,"Instruction field not available");
 await move(x,y,Math.round(ta.x+50),Math.round(ta.y+25),6);await click(Math.round(ta.x+50),Math.round(ta.y+25));
 await cdp.send("Input.insertText",{text:"Refine all three circled regions: correct KPI values, improve hierarchy and colors, and make the chart easier to read."});
 await hold(8);
 const submit=await ev('(()=>{const b=[...document.querySelectorAll("button")].find(x=>x.textContent.trim().toLowerCase()==="send feedback");if(!b)return null;const r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()');
 assert(submit,"Send feedback button unavailable");
 await move(Math.round(ta.x+50),Math.round(ta.y+25),Math.round(submit.x),Math.round(submit.y),7);
 await click(Math.round(submit.x),Math.round(submit.y));await hold(6);
 const feedback=await waitUntil(async()=>{try{const r=await fetch("http://127.0.0.1:4178/v1/feedback/latest?sessionId="+session.sessionId);return r.ok?await r.json():null}catch{return null}},10000);
 assert(feedback.annotations.length>=3,"Feedback missing real circle annotations");
 assert(feedback.generalInstruction.includes("Refine all three"),"Typed instruction missing from submitted feedback");
 await waitUntil(async()=>{const state=await api("/v1/state");return state.activeArtifact?.revision===2&&state.activeArtifact.content?.includes("REFINED")},30000);
 await hold(16);
 const list=fs.readdirSync(framesDir).filter(f=>f.endsWith(".png"));assert(list.length>60,"Too few recorded frames: "+list.length);
 const distinct=new Set(list.map(f=>createHash("sha1").update(fs.readFileSync(path.join(framesDir,f))).digest("hex")));
 assert(distinct.size>18,"GIF would contain too little real UI motion: "+distinct.size);
 const args=["-y","-loglevel","error","-framerate",String(FPS),"-i",path.join(framesDir,"%04d.png"),"-vf","fps="+FPS+",scale=1000:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3","-loop","0",OUT];
 const f=spawnSync("ffmpeg",args,{stdio:"inherit",timeout:180000});assert(f.status===0,"ffmpeg failed");
 const v=spawnSync("ffprobe",["-v","error","-count_frames","-select_streams","v:0","-show_entries","stream=nb_read_frames","-of","default=noprint_wrappers=1:nokey=1",OUT],{encoding:"utf8"});
 assert(v.status===0&&Number(v.stdout.trim())>60,"GIF frame validation failed");
 console.log("SUCCESS real UI frames="+list.length+" distinct="+distinct.size+" gifBytes="+fs.statSync(OUT).size+" feedbackAnnotations="+feedback.annotations.length);
 // Only after all end-to-end assertions succeeded, replace the README's simulated demo.
 const readmePath=path.join(ROOT,"README.md");
 let readme=fs.readFileSync(readmePath,"utf8");
 const re=/<div align="center">\s*<img src="docs\/assets\/visualloop-ui-workflow-demo\.gif"[\s\S]*?<\/div>/;
 assert(re.test(readme),"README demo anchor changed; refusing to overwrite");
 const replacement='<div align="center">\n  <img src="docs/assets/visualloop-app-capture.gif" alt="VisualLoop running web UI: live SVG preview, three real mouse-drawn annotations, feedback submission to local core, and verified revision 2" width="800" />\n  <br />\n  <a href="docs/assets/visualloop-app-capture.gif">Watch the VisualLoop app workflow capture</a>\n  <br />\n  <sub>Captured from the running VisualLoop browser UI and Core Server on commit 95a41ac. Mouse annotations, submitted feedback, source-file replacement, and revision publication use the actual application; the AI response is supplied by a deterministic local OpenAI-compatible test provider, not a live external model. This is not a native Tauri screen recording.</sub>\n</div>';
 readme=readme.replace(re,replacement);
 fs.writeFileSync(readmePath,readme);
}finally{try{cdp?.close()}catch{}for(const p of processes)try{p.kill("SIGTERM")}catch{}await new Promise(r=>aiServer.close(r));}
}
main().catch(e=>{console.error("CAPTURE FAILED:",e.stack||e);process.exitCode=1;try{cdp?.close()}catch{}for(const p of processes)try{p.kill("SIGTERM")}catch{}try{aiServer.close()}catch{}});
