(function(){
const $=id=>document.getElementById(id),cfg=window.BARONMODS_SUPABASE;let client=null,user=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const msg=(el,s,k)=>{el.textContent=s;el.className='admin-message '+(k||'');};
const ready=()=>cfg&&cfg.url.startsWith('https://')&&cfg.anonKey&&!cfg.anonKey.includes('YOUR_SUPABASE');
function slugify(s){return s.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,100);}
function cleanName(s){return s.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g,'-').slice(-120);}
function showOut(){ $('auth-panel').hidden=false;$('dashboard').hidden=true; }
async function checkAdmin(){
 const r=await client.auth.getUser();if(r.error||!r.data.user){user=null;showOut();return;}
 const u=r.data.user;const a=await client.from('admin_users').select('user_id').eq('user_id',u.id).maybeSingle();
 if(a.error||!a.data){user=null;showOut();msg($('auth-message'),'This account is not approved as a Baronmods admin. Add its UUID to admin_users using the setup guide.','error');return;}
 user=u;$('auth-panel').hidden=true;$('dashboard').hidden=false;$('admin-identity').textContent='Signed in as '+u.email;await loadMods();
}
async function loadMods(){
 const host=$('admin-mod-list');host.textContent='Loading…';const r=await client.from('mods').select('id,name,slug,published,mod_versions(id,version,published)').order('created_at',{ascending:false});
 if(r.error){host.textContent='Could not load records: '+r.error.message;return;}if(!r.data.length){host.textContent='No mods yet. Publish your first mod above.';return;}
 host.innerHTML=r.data.map(m=>'<div class="admin-mod-row"><span>'+esc(m.name)+' · '+(m.published?'Published':'Draft')+' · '+(m.mod_versions||[]).length+' version(s)</span><button type="button" data-id="'+esc(m.id)+'" data-pub="'+m.published+'">'+(m.published?'Unpublish':'Publish')+'</button></div>').join('');
 host.querySelectorAll('[data-id]').forEach(b=>b.addEventListener('click',async()=>{const pub=b.dataset.pub!=='true';const u=await client.from('mods').update({published:pub,updated_at:new Date().toISOString()}).eq('id',b.dataset.id);if(u.error){msg($('upload-message'),'Could not update visibility: '+u.error.message,'error');return;}msg($('upload-message'),pub?'Mod published.':'Mod unpublished.','success');await loadMods();}));
}
async function publish(){
 if(!user){msg($('upload-message'),'Sign in as an approved admin first.','error');return;}
 const name=$('mod-name').value.trim(),slug=slugify($('mod-slug').value||name),summary=$('mod-summary').value.trim(),description=$('mod-description').value.trim(),category=$('mod-category').value,file=$('mod-file').files[0],icon=$('mod-icon').files[0],version=$('version').value.trim(),loader=$('loader').value,changelog=$('changelog').value.trim(),minecraft=$('minecraft-versions').value.split(',').map(s=>s.trim()).filter(Boolean).slice(0,30),pub=$('publish-now').checked;
 if(!name||!slug||!summary||!file||!version){msg($('upload-message'),'Fill in required fields and choose a .jar or .zip file.','error');return;}
 const ext=(file.name.split('.').pop()||'').toLowerCase();if(!['jar','zip'].includes(ext)){msg($('upload-message'),'Only .jar and .zip files are accepted.','error');return;}
 if(file.size>100*1024*1024){msg($('upload-message'),'File exceeds 100 MB.','error');return;}
 if(icon&&(!/^image\/(png|jpeg|webp|svg\+xml)$/.test(icon.type)||icon.size>10*1024*1024)){msg($('upload-message'),'Icon must be PNG, JPG, WEBP, or SVG under 10 MB.','error');return;}
 const button=$('publish-mod');button.disabled=true;button.textContent='Uploading…';let modId=null,filePath=null,iconPath=null;
 try{
  const m=await client.from('mods').insert({slug,name,summary,description,category,published:false,created_by:user.id}).select('id').single();if(m.error)throw m.error;modId=m.data.id;
  filePath=modId+'/'+Date.now()+'-'+cleanName(file.name);const up=await client.storage.from('mod-files').upload(filePath,file,{upsert:false,contentType:file.type||'application/octet-stream'});if(up.error)throw up.error;
  if(icon){iconPath=modId+'/'+Date.now()+'-'+cleanName(icon.name);const iu=await client.storage.from('mod-images').upload(iconPath,icon,{upsert:false,contentType:icon.type});if(iu.error)throw iu.error;}
  const v=await client.from('mod_versions').insert({mod_id:modId,version,minecraft_versions:minecraft,loader,changelog,file_path:filePath,file_name:file.name,file_size:file.size,published:pub,created_by:user.id});if(v.error)throw v.error;
  const upd=await client.from('mods').update({icon_path:iconPath,published:pub,updated_at:new Date().toISOString()}).eq('id',modId);if(upd.error)throw upd.error;
  msg($('upload-message'),pub?'Mod uploaded and published.':'Mod uploaded as a draft.','success');['mod-name','mod-slug','mod-summary','mod-description','version','minecraft-versions','changelog','mod-file','mod-icon'].forEach(id=>$(id).value='');$('mod-slug').dataset.edited='';await loadMods();
 }catch(e){console.error(e);if(modId){try{await client.from('mods').delete().eq('id',modId);}catch(_){} }if(filePath){try{await client.storage.from('mod-files').remove([filePath]);}catch(_){}}if(iconPath){try{await client.storage.from('mod-images').remove([iconPath]);}catch(_){}}msg($('upload-message'),'Upload failed: '+(e.message||'unknown error')+'. Check SQL setup, admin approval, and Storage policies.','error');}
 finally{button.disabled=false;button.textContent='Upload and publish ↗';}
}
async function init(){
 if(!ready()){msg($('auth-message'),'Supabase is not configured. Set the project URL and publishable/anon key in supabase-config.js.','error');$('sign-in').disabled=true;$('publish-mod').disabled=true;return;}
 client=window.supabase.createClient(cfg.url,cfg.anonKey);
 $('sign-in').addEventListener('click',async()=>{const email=$('email').value.trim(),password=$('password').value;if(!email||!password){msg($('auth-message'),'Enter your email and password.','error');return;}msg($('auth-message'),'Signing in…');const r=await client.auth.signInWithPassword({email,password});if(r.error){msg($('auth-message'),r.error.message,'error');return;}await checkAdmin();});
 $('sign-out').addEventListener('click',async()=>{await client.auth.signOut();user=null;showOut();msg($('auth-message'),'Signed out.','');});
 $('publish-mod').addEventListener('click',publish);
 $('mod-name').addEventListener('input',()=>{if(!$('mod-slug').dataset.edited)$('mod-slug').value=slugify($('mod-name').value);});
 $('mod-slug').addEventListener('input',()=>{$('mod-slug').dataset.edited='true';$('mod-slug').value=slugify($('mod-slug').value);});
 await checkAdmin();
}
init();
})();