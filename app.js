const $ = (id) => document.getElementById(id);
const DB_NAME = "cliply-local", DB_VERSION = 1, MAX_FILE = 25 * 1024 * 1024;
const state = { mode: "text", file: null, db: null, pastes: [] };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const notice = (s, error = true) => { $("notice").textContent = s; $("notice").style.color = error ? "#ff9d9d" : "#8ee3b9"; };
const uid = () => crypto.randomUUID();
const slug = () => Array.from(crypto.getRandomValues(new Uint8Array(9)), n => "abcdefghjkmnpqrstuvwxyz23456789"[n % 32]).join("");
function openDB() { return new Promise((resolve, reject) => { const req = indexedDB.open(DB_NAME, DB_VERSION); req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains("pastes")) db.createObjectStore("pastes", {keyPath:"id"}); if (!db.objectStoreNames.contains("tokens")) db.createObjectStore("tokens", {keyPath:"id"}); }; req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
function store(name, mode="readonly") { return state.db.transaction(name, mode).objectStore(name); }
function all(name) { return new Promise((resolve,reject) => { const r=store(name).getAll(); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error); }); }
function put(name, value) { return new Promise((resolve,reject)=>{const r=store(name,"readwrite").put(value);r.onsuccess=()=>resolve(value);r.onerror=()=>reject(r.error);}); }
function del(name, key) { return new Promise((resolve,reject)=>{const r=store(name,"readwrite").delete(key);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error);}); }
function setMode(mode) { state.mode=mode; document.querySelectorAll(".segment").forEach(b=>b.classList.toggle("active",b.dataset.mode===mode)); $("text-mode").classList.toggle("hidden",mode!=="text"); $("file-mode").classList.toggle("hidden",mode!=="file"); $("language").closest(".field").classList.toggle("hidden",mode!=="text"); $("publish").textContent=mode==="text"?"Save paste ↗":"Save file ↗"; }
function expiresAt(choice) { const map={"1h":3600000,"1d":86400000,"7d":604800000,"30d":2592000000}; return map[choice] ? Date.now()+map[choice] : null; }
function visiblePastes() { const now=Date.now(); return state.pastes.filter(p=>!p.expiresAt || p.expiresAt>now); }
async function refresh() { state.pastes=await all("pastes"); renderPastes(); renderTokens(); }
function renderPastes() { const q=$("search").value.trim().toLowerCase(); const items=visiblePastes().filter(p=>(p.title+" "+(p.content||"")+" "+(p.fileName||"")).toLowerCase().includes(q)).sort((a,b)=>b.createdAt-a.createdAt); const grid=$("paste-grid"); if(!items.length){grid.innerHTML='<div class="empty-state">No matching local pastes. Create one above.</div>';return;} grid.innerHTML=items.map(p=>`<article class="paste-card"><div class="card-top"><span class="card-title">${esc(p.title)}</span><span class="tag">${esc(p.language||"file")}</span></div><div class="card-preview">${esc(p.content || `File: ${p.fileName} · ${(p.fileSize/1024).toFixed(1)} KB`)}</div><div class="card-foot"><span>${new Date(p.createdAt).toLocaleString()}</span><span><button class="inline-action" data-open="${p.id}">Open</button> · <button class="inline-action" data-export="${p.id}">Export</button> · <button class="inline-action danger-text" data-delete="${p.id}">Delete</button></span></div></article>`).join(""); grid.querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>openPaste(b.dataset.open)); grid.querySelectorAll("[data-export]").forEach(b=>b.onclick=()=>exportPaste(b.dataset.export)); grid.querySelectorAll("[data-delete]").forEach(b=>b.onclick=async()=>{if(confirm("Delete this local paste?")){await del("pastes",b.dataset.delete);await refresh();}}); }
function downloadBlob(blob, filename) { const url=URL.createObjectURL(blob); const a=document.createElement("a");a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }
function openPaste(id) { const p=state.pastes.find(x=>x.id===id); if(!p)return; if(p.file){downloadBlob(p.file,p.fileName);return;} $("paste-title").value=p.title;$("paste-content").value=p.content;$("language").value=p.language||"plaintext";setMode("text");location.hash="create";notice("Loaded saved paste into the editor.",false); }
async function exportPaste(id) {
  const p=state.pastes.find(x=>x.id===id);if(!p)return;
  const item={...p,file:undefined,fileType:p.file?.type||null,fileData:null};
  if(p.file)item.fileData=bytesToBase64(new Uint8Array(await p.file.arrayBuffer()));
  const backup={format:"cliply-local-backup",version:1,exportedAt:new Date().toISOString(),profile:JSON.parse(localStorage.getItem("cliply.profile")||"{}"),pastes:[item],tokens:[]};
  downloadBlob(new Blob([JSON.stringify(backup,null,2)],{type:"application/json"}),`${p.slug}.cliply.json`);
}
function showResult(p) { const localUrl=`${location.origin}${location.pathname}#p=${p.slug}`;$("share-url").value=localUrl;$("result-links").innerHTML=p.file?'<span>File saved locally; use Export data to move it.</span>':'<button class="inline-action" id="raw-local">View raw text</button>';$("result-modal").classList.remove("hidden");const raw=$("raw-local");if(raw)raw.onclick=()=>{const w=window.open("about:blank","_blank");if(w)w.document.write(`<pre>${esc(p.content)}</pre>`);}; }
async function publish() { notice("");try{let p={id:uid(),slug:slug(),title:$("paste-title").value.trim()||"Untitled paste",language:$("language").value,visibility:$("visibility").value,createdAt:Date.now(),expiresAt:expiresAt($("expiration").value),content:"",file:null,fileName:null,fileSize:0};if(state.mode==="text"){p.content=$("paste-content").value;if(!p.content.trim())throw Error("Add some content before saving.");}else{if(!state.file)throw Error("Choose a file first.");if(state.file.size>MAX_FILE)throw Error("File exceeds the 25 MB limit.");p.file=state.file;p.fileName=state.file.name;p.fileSize=state.file.size;p.language="file";}await put("pastes",p);await refresh();showResult(p);notice("Saved to this browser.",false);}catch(e){notice(e.message);} }
function bytesToHex(bytes){return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,"0")).join("");}
async function hashToken(token){return bytesToHex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token)));}
function randomToken(){const b=crypto.getRandomValues(new Uint8Array(32));return "cliply_local_"+btoa(String.fromCharCode(...b)).replace(/[+/=]/g,c=>({"+":"-","/":"_","=":""}[c]));}
async function deriveVaultKey(passphrase,salt){
  const material=await crypto.subtle.importKey("raw",new TextEncoder().encode(passphrase),"PBKDF2",false,["deriveKey"]);
  return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:310000,hash:"SHA-256"},material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
async function encryptSecret(secret,passphrase){
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await deriveVaultKey(passphrase,salt);
  const ciphertext=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,new TextEncoder().encode(secret));
  return {salt:bytesToBase64(salt),iv:bytesToBase64(iv),ciphertext:bytesToBase64(new Uint8Array(ciphertext))};
}
async function decryptSecret(token,passphrase){
  const from64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
  const key=await deriveVaultKey(passphrase,from64(token.salt));
  const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:from64(token.iv)},key,from64(token.ciphertext));
  return new TextDecoder().decode(plain);
}
async function createToken(){
  const secret=randomToken(),scope=$("token-scope").value,name=$("token-name").value.trim()||"Untitled token",expiry=$("token-expiry").value;
  const passphrase=prompt("Set a vault passphrase (12+ characters). You will need it to reveal this token later. Do not forget it.");
  if(passphrase===null)return;
  if(passphrase.length<12)throw Error("Vault passphrase must be at least 12 characters.");
  const duration={"7d":7,"30d":30,"90d":90};
  const encrypted=await encryptSecret(secret,passphrase);
  const token={id:uid(),name,scope,hash:await hashToken(secret),...encrypted,createdAt:Date.now(),expiresAt:duration[expiry]?Date.now()+duration[expiry]*86400000:null,revoked:false};
  await put("tokens",token);$("new-token-value").value=secret;$("new-token-panel").classList.remove("hidden");$("token-name").value="";await renderTokens();
}
async function renderTokens(){
  const tokens=(await all("tokens")).sort((a,b)=>b.createdAt-a.createdAt);
  const active=tokens.filter(t=>!t.revoked&&(!t.expiresAt||t.expiresAt>Date.now()));
  $("token-count").textContent=`${active.length} active · ${tokens.length} total`;
  const el=$("token-list");
  if(!tokens.length){el.innerHTML='<div class="empty-state">No tokens created.</div>';return;}
  el.innerHTML=tokens.map(t=>{
    const status=t.revoked?"Revoked":t.expiresAt&&t.expiresAt<=Date.now()?"Expired":"Active";
    const expiry=t.expiresAt?`Expires ${new Date(t.expiresAt).toLocaleDateString()}`:"Never expires";
    const reveal=!t.revoked&&(!t.expiresAt||t.expiresAt>Date.now())?`<button class="btn btn-quiet" data-reveal="${t.id}">Reveal</button>`:"";
    const revoke=!t.revoked&&(!t.expiresAt||t.expiresAt>Date.now())?`<button class="btn btn-quiet revoke-token" data-revoke="${t.id}">Revoke</button>`:"";
    return `<div class="token-row"><div class="token-meta"><strong>${esc(t.name)}</strong><span>${t.scope==="readwrite"?"Read + write":"Read only"} · Created ${new Date(t.createdAt).toLocaleDateString()} · ${expiry}</span></div><span class="token-status ${status==="Active"?"active":"inactive"}">${status}</span>${reveal}${revoke}</div>`;
  }).join("");
  el.querySelectorAll("[data-reveal]").forEach(b=>b.onclick=async()=>{const t=tokens.find(x=>x.id===b.dataset.reveal);if(!t)return;const pass=prompt("Enter the vault passphrase used when this token was created.");if(pass===null)return;try{const secret=await decryptSecret(t,pass);alert(`Token: ${secret}\n\nCopy it now and keep it private.`);}catch{alert("Could not decrypt token. Check the passphrase.");}});
  el.querySelectorAll("[data-revoke]").forEach(b=>b.onclick=async()=>{const t=tokens.find(x=>x.id===b.dataset.revoke);if(t){t.revoked=true;t.revokedAt=Date.now();await put("tokens",t);await renderTokens();}});
}
async function exportAll(){const pastes=await all("pastes"),tokens=await all("tokens");const encoded=[];for(const p of pastes){let item={...p,file:undefined,fileType:p.file?.type||null,fileData:null};if(p.file)item.fileData=await p.file.arrayBuffer().then(buf=>bytesToBase64(new Uint8Array(buf)));encoded.push(item);}const backup={format:"cliply-local-backup",version:1,exportedAt:new Date().toISOString(),profile:JSON.parse(localStorage.getItem("cliply.profile")||"{}"),pastes:encoded,tokens};downloadBlob(new Blob([JSON.stringify(backup)],{type:"application/json"}),`cliply-backup-${new Date().toISOString().slice(0,10)}.json`);}
function bytesToBase64(bytes){let binary="";for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(binary);}
async function importAll(file){const data=JSON.parse(await file.text());if(data.format!=="cliply-local-backup"||!Array.isArray(data.pastes))throw Error("This is not a valid Cliply backup.");for(const item of data.pastes){const p={...item};if(item.fileData){const bytes=Uint8Array.from(atob(item.fileData),c=>c.charCodeAt(0));p.file=new File([bytes],item.fileName||"upload",{type:item.fileType||"application/octet-stream"});}delete p.fileData;await put("pastes",p);}if(Array.isArray(data.tokens))for(const t of data.tokens)await put("tokens",t);if(data.profile)localStorage.setItem("cliply.profile",JSON.stringify(data.profile));loadProfile();await refresh();}
function loadProfile(){const profile=JSON.parse(localStorage.getItem("cliply.profile")||"{}");$("profile-name").value=profile.name||"";$("profile-label").textContent=profile.name||"Local workspace";}
function routeHash(){const raw=location.hash.match(/^#p=([a-z0-9]+)$/i);if(!raw)return;const p=state.pastes.find(x=>x.slug===raw[1]);if(!p){notice("That paste is not stored in this browser.");return;}if(p.file){downloadBlob(p.file,p.fileName);return;}$("paste-title").value=p.title;$("paste-content").value=p.content;$("language").value=p.language||"plaintext";setMode("text");document.title=`${p.title} — Cliply`;location.hash="create";notice("Opened a local paste.",false);}
document.querySelectorAll(".segment").forEach(b=>b.onclick=()=>setMode(b.dataset.mode));$("publish").onclick=publish;$("search").oninput=renderPastes;$("file-input").onchange=e=>{state.file=e.target.files[0]||null;$("selected-file").textContent=state.file?`${state.file.name} · ${(state.file.size/1048576).toFixed(2)} MB`:"";};const dz=$("dropzone");dz.ondragover=e=>{e.preventDefault();dz.style.borderColor="#a78bfa";};dz.ondragleave=()=>dz.style.borderColor="";dz.ondrop=e=>{e.preventDefault();dz.style.borderColor="";state.file=e.dataTransfer.files[0]||null;$("selected-file").textContent=state.file?`${state.file.name} · ${(state.file.size/1048576).toFixed(2)} MB`:"";};
$("save-profile").onclick=()=>{const profile={name:$("profile-name").value.trim().slice(0,32)};localStorage.setItem("cliply.profile",JSON.stringify(profile));loadProfile();};$("create-token").onclick=()=>createToken().catch(e=>alert(e.message));$("copy-token").onclick=async()=>{await navigator.clipboard.writeText($("new-token-value").value);$("copy-token").textContent="Copied";};$("export-all").onclick=exportAll;$("import-data").onclick=()=>$("import-file").click();$("import-file").onchange=async e=>{try{if(e.target.files[0]){await importAll(e.target.files[0]);alert("Backup imported.");}}catch(err){alert(`Import failed: ${err.message}`);}e.target.value="";};$("clear-data").onclick=async()=>{if(!confirm("Permanently delete all Cliply pastes and tokens from this browser? Export a backup first if you need one."))return;for(const p of await all("pastes"))await del("pastes",p.id);for(const t of await all("tokens"))await del("tokens",t.id);localStorage.removeItem("cliply.profile");$("new-token-panel").classList.add("hidden");loadProfile();await refresh();};
$("copy-link").onclick=async()=>{await navigator.clipboard.writeText($("share-url").value);$("copy-link").textContent="Copied";};$("result-close").onclick=$("done-result").onclick=()=>$("result-modal").classList.add("hidden");
(async()=>{try{state.db=await openDB();loadProfile();await refresh();setMode("text");routeHash();}catch(e){notice(`Local database unavailable: ${e.message}`);}})();
