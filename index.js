'use strict';
const {ipcRenderer, remote} = require('electron');
const {Menu, MenuItem} = remote;

document.onreadystatechange = ()=> document.readyState==='interactive'&&I();
function I() {
  document.getElementById('win-close').onclick = ()=>{ipcRenderer.send('win-action','close')};
  document.getElementById('win-min').onclick = ()=>{ipcRenderer.send('win-action','minimize')};
  document.getElementById('win-max').onclick = ()=>{ipcRenderer.send('win-action','maximize')};
  ipcRenderer.send('bot-data','sync');
  ipcRenderer.send('ready',1);

  const setInput = (id)=> {
  	let input = document.getElementById(id);
  	let req = {
  		text: input.querySelector('input'),
  		slide: input.querySelector('[type=range]'),
  		spin: Object.values(input.querySelectorAll('.custom-btn'))
  	}
  	let interval = [0,0];
  	req.text.value = req.slide.value = 0;
  	req.text.oninput = ()=>req.slide.value=req.text.value;
  	req.slide.oninput = ()=>req.text.value=req.slide.value;
  	req.spin[0].onclick = ()=>req.slide.value=++req.text.value; 
  	req.spin[1].onclick = ()=>(req.text.value=--req.slide.value)<0&&(req.text.value=0);
  	req.spin[0].onmousedown = ()=>interval[0]=setInterval(req.spin[0].onclick,99);
  	req.spin[1].onmousedown = ()=>interval[1]=setInterval(req.spin[1].onclick,99);
  	req.spin[0].onmouseup = ()=>clearInterval(interval[0]);
  	req.spin[1].onmouseup = ()=>clearInterval(interval[1]);
  	req.setAll = val=>req.text.value = req.slide.value = val;
  	return req;
  }
  const box = {
  	settings: document.getElementById('box-settings'),
  	connect: document.getElementById('box-connect'),
  	auth:document.getElementById('box-auth')
  };
  const setBox = (name,sync)=> {
  	const id = name.substring(1);
  	const toFront = ()=> Object.keys(box).forEach(key=>key==id&&(box[key].style.zIndex=1)||(box[key].style.zIndex=0));
  	document.querySelector(name).onclick = ()=>(box[id].hidden=false)||sync&&ipcRenderer.send('bot-data','sync')||toFront();
  	box[id].querySelector('.close').onclick = ()=>box[id].hidden=true;
  }
  const note = document.getElementById('notification');
  const showNote = msg=> (note.innerText=msg)&&(note.style.bottom='2%')&&
  	setTimeout(()=>note.style.bottom='-15%', 3000)&&note.style;

  const reqViewer = setInput('v-req');
  const reqSub = setInput('s-req');
  const bitRatio = setInput('vote-cost');
  const cmdReq = document.getElementById('cmd-req');
  const table = document.querySelector('tbody');
  const bot = { channel:document.getElementById('bot-name'),name:'',oauth:document.getElementById('oauth') };
  const re = { add:document.getElementById('re-add'),vote:document.getElementById('re-vote'),limit:document.getElementById('re-limit'),
							 voteFail:document.getElementById('re-f-vote'),addFail:document.getElementById('re-f-add'), 
							 bannedSong:document.getElementById('re-banned'),paidSong:document.getElementById('re-paid') };
	const settingsTabs = [document.getElementById('tab1'),document.getElementById('tab2'),document.getElementById('tab3')];
	const settingsPages = [document.getElementById('page1'),document.getElementById('page2'),document.getElementById('page3')];
  const webview = document.querySelector('webview');
  const profile = document.getElementById('profile');
  const autoconnect = document.querySelector('[type=checkbox]');
	const cmdLvls = document.getElementById('lvl-dance');
  const banName = document.getElementById('ban-name');
  const banPrice = setInput('ban-price');
  const banBtn = document.getElementById('ban');
  const banTable = document.getElementById('page2').querySelector('tbody');
  const cmds = Object.values(document.getElementsByClassName('cmd-btn'));
  const menu = document.getElementById('context-menu');
  const blResults = document.getElementById('bl-results');
  let blacklist = [];
  let blSel = 0;
  const cmdsRe = [];
  Object.values(document.getElementById('page3').querySelectorAll('[placeholder=Name]')).forEach(e=>cmdsRe.push([e]));
  Object.values(document.getElementById('page3').querySelectorAll('select')).forEach((e,i)=>cmdsRe[i].push(e));
  Object.values(document.getElementById('page3').querySelectorAll('[placeholder=Response]')).forEach((e,i)=>cmdsRe[i].push(e));
  cmdsRe[0].push(document.getElementById('page3').querySelector('[placeholder="Fail Response"]'));
  cmdsRe[1].push(document.getElementById('page3').querySelectorAll('[placeholder="Fail Response"]')[1]);
  cmdsRe[2].push(document.getElementById('page3').querySelectorAll('[placeholder="Fail Response"]')[2]);
  cmdsRe[3].push(document.getElementById('page3').querySelectorAll('[placeholder="Fail Response"]')[3]);
  
  ipcRenderer.on('ready',(e,r)=>table.innerHTML=r.reduce((html,song,i)=>html+='<tr>'+toCells(song,i+1)+'</tr>','') );
  ipcRenderer.on('reply',(e,r)=>{
  	if(r[0]=='blacklist') return (blacklist=r[1])&&updateBlacklist();
  	reqViewer.setAll(r[1].limit.viewer); reqSub.setAll(r[1].limit.sub); bitRatio.setAll(r[1].bitRatio);
  	cmdReq.value = r[1].CMD.dance.name; cmdLvls.selectedIndex = r[1].CMD.dance.level;
  	bot.channel.value	= r[1].bot.channel; bot.oauth.value = r[1].bot.oauth; bot.name = r[1].bot.name;
  	re.add.value=r[1].response.add; re.vote.value=r[1].response.vote; re.limit.value=r[1].response.limit; 
  	re.voteFail.value=r[1].response.voteFail; re.addFail.value=r[1].response.addFail; re.bannedSong.value=r[1].response.bannedSong;
  	re.paidSong.value=r[1].response.paidSong;
  	cmdsRe[0][0].value=r[1].CMD.current.name; cmdsRe[0][1].selectedIndex=r[1].CMD.current.level; cmdsRe[0][2].value=r[1].CMD.current.response;
  	cmdsRe[0][3].value=r[1].CMD.current.response1;
  	cmdsRe[1][0].value=r[1].CMD.next.name; cmdsRe[1][1].selectedIndex=r[1].CMD.next.level; cmdsRe[1][2].value=r[1].CMD.next.response;
  	cmdsRe[1][3].value=r[1].CMD.next.response1;
  	cmdsRe[2][0].value=r[1].CMD.position.name; cmdsRe[2][1].selectedIndex=r[1].CMD.position.level; cmdsRe[2][2].value=r[1].CMD.position.response;
  	cmdsRe[2][3].value=r[1].CMD.position.response1;
    cmdsRe[3][0].value=r[1].CMD.wrongsong.name; cmdsRe[3][1].selectedIndex=r[1].CMD.wrongsong.level; cmdsRe[3][2].value=r[1].CMD.wrongsong.response;
    cmdsRe[3][3].value=r[1].CMD.wrongsong.response1;
  	cmdsRe[4][0].value=r[1].CMD.size.name; cmdsRe[4][1].selectedIndex=r[1].CMD.size.level; cmdsRe[4][2].value=r[1].CMD.size.response;
  	autoconnect.checked=r[1].bot.autoconnect; blSel=blResults.innerHTML=banName.value=''; banPrice.setAll(r[1].banPrice); 
  	blacklist = r[1].blacklist; updateBlacklist();
  	r[0]&&(showNote('Saved').color='#117700')&&(box.settings.hidden = true);
  	webview.loadURL('https://id.twitch.tv/oauth2/authorize?response_type=token&client_id=q6batx0epp608isickayubi39itsckt&redirect_uri=https://twitchapps.com/tmi/&scope=chat:read+chat:edit+channel:moderate+whispers:read+whispers:edit');
  });
  ipcRenderer.on('add-req',(e,song)=>{
  	const row = document.createElement('tr');
  	table.appendChild(row);
  	row.insertAdjacentHTML('beforeend',toCells(song,row.rowIndex));
  });
  ipcRenderer.on('sort',(e,songs)=>{
  	table.innerHTML=songs.reduce((html,song,i)=>html+='<tr>'+toCells(song,i+1)+'</tr>','');
  });
  ipcRenderer.on('connection',(e,r)=>{
  	if(!r) {
  		document.getElementById('connect').hidden = box.connect.hidden = true;
  		profile.hidden = false;
  		profile.innerText = bot.name;
  		showNote('Bot connected').color='#117700';
  	} else {
  		profile.hidden = true;
  		document.getElementById('connect').hidden = false;
  		showNote(r).color='#770011';
  	}
  });
  ipcRenderer.on('blacklist',(e,r)=>{
  	blacklist.push(r);
  	blacklist.sort((a,b)=>a.price<b.price);
  	updateBlacklist();
  });
  ipcRenderer.on('bl-results',(e,r)=>{
  	r=r.filter(match=>!blacklist.some(song=>song.id==match.id));
  	if(!r.length) return (blSel=blResults.innerHTML='');
  	blSel=r[0];
  	blResults.innerHTML = 'Search results: '+r.length+r.reduce((html,match)=>html+='<div class="search-result">'+match.name+' ['+match.mode+']'+(match.routine&&(' ['+match.routine+']')||'')+' - '+match.artist+'</div>','');
  	blResults.querySelector('.search-result').classList.add('selected');
  	const results = Object.values(blResults.children)
  	results.forEach((res,i)=>res.onclick=e=>results.forEach(re=>re.classList.remove('selected'))||res.classList.add('selected')||(blSel=r[i]));
  });

  let targetRow; const blPrice = document.getElementById('price');
  blPrice.value = banPrice.text.value;
  document.onclick = e=> menu.hidden=true;
  table.oncontextmenu = e=> { 
  	e.preventDefault(); menu.style.top=e.clientY+'px'; menu.style.left=e.clientX+'px'; blPrice.value=banPrice.text.value; menu.hidden=false; 
  	targetRow=e.target.parentElement.rowIndex-1;
  }
  document.getElementById('remove-song').onclick = e=> removeSong(targetRow);
  document.getElementById('remove-all').onclick = e=> (table.innerHTML='')||ipcRenderer.send('remove-all',1);
  document.getElementById('ban-song').onclick = e=> !ipcRenderer.send('blacklist',[targetRow,blPrice.value||'0'])&&!table.deleteRow(targetRow)&&!updateRowIndex();
  blPrice.onclick=e=>e.stopPropagation();
  blPrice.onkeyup = e=> e.isComposed||e.code=='Enter'&&document.getElementById('ban-song').click();
  document.getElementById('next').onclick = ()=> table.rows.length&&removeSong(0);

  setBox('.settings',true);
  box.settings.querySelector('.save').onclick = ()=>ipcRenderer.send('bot-data', [reqViewer.text.value,reqSub.text.value,cmdReq.value,re.add.value,re.vote.value,re.limit.value,re.voteFail.value,re.addFail.value,re.bannedSong.value,re.paidSong.value,bitRatio.text.value,cmdLvls.selectedIndex,banPrice.text.value,blacklist,cmdsRe[0][0].value,cmdsRe[0][1].selectedIndex,cmdsRe[0][2].value,cmdsRe[0][3].value,cmdsRe[1][0].value,cmdsRe[1][1].selectedIndex,cmdsRe[1][2].value,cmdsRe[1][3].value,cmdsRe[2][0].value,cmdsRe[2][1].selectedIndex,cmdsRe[2][2].value,cmdsRe[2][3].value,cmdsRe[3][0].value,cmdsRe[3][1].selectedIndex,cmdsRe[3][2].value,cmdsRe[3][3].value,cmdsRe[4][0].value,cmdsRe[4][1].selectedIndex,cmdsRe[4][2].value]);
  settingsTabs.forEach((tab,id)=>tab.onclick=()=>{for(let i=0;i<settingsTabs.length;i++)settingsTabs[i].classList.remove('selected')||(settingsPages[i].hidden=true); tab.classList.add('selected'); settingsPages[id].hidden=false});
  banBtn.onclick = ()=> blSel&&!ipcRenderer.send('blacklist',[blSel,banPrice.text.value||'0',blacklist])&&!ipcRenderer.send('blacklist',[banName.value])||(banName.value='');
  banName.onkeyup = e=> ipcRenderer.send('blacklist',[banName.value])||banPrice.text.onkeyup(e);
  banPrice.text.onkeyup = e=> e.isComposed||e.code=='Enter'&&banBtn.click();
  cmds.forEach(cmd=>cmd.onclick=()=>{const opts=cmd.firstElementChild; opts.hidden^=1; opts.onclick=e=>e.stopPropagation()});

  setBox('#connect',true);
  profile.onmouseenter = ()=> profile.innerText='DISCONNECT'
  profile.onmouseleave = ()=> profile.innerText=bot.name;
  profile.onclick = ()=> { ipcRenderer.send('connection','leave') }
  box.connect.querySelector('.save').onclick = ()=> bot.channel.value&&bot.oauth.value&&ipcRenderer.send('connection', [bot.channel.value,bot.oauth.value,autoconnect.checked]);

  setBox('#auth');
  box.auth.querySelector('.save').onclick = ()=>{
  	const url = webview.getURL();
  	if(url.substring(8,18)=='twitchapps') {
  		bot.oauth.value = 'oauth:'+url.substring(41,url.indexOf('&'));
  		showNote('Token copied succesfully').color='#117700';
  		box.auth.hidden=true;
  		return;
  	}
  	showNote('Needs Authorization').color='#770011';
  }
	function removeSong(idx) { !table.deleteRow(idx)&&!updateRowIndex()&&ipcRenderer.send('next-song',idx) }
	function updateRowIndex() { Object.values(table.rows).forEach(row=>row.firstChild.innerText=row.rowIndex) }
	function updateBlacklist(){
		const banSong = song=>{ return '<tr><td>'+song.name+'</td><td>'+song.mode+'</td><td>'+shortNum(song.price)+'</td></tr>' }
  	banTable.innerHTML=blacklist.reduce((html,song)=>html+=banSong(song),'');
  	Object.values(banTable.rows).forEach(row=>row.onclick=()=>blacklist.splice(row.rowIndex-1,1)&&banTable.deleteRow(row.rowIndex-1));
	}
}
function shortNum(number) {
  var SI_POSTFIXES = ["", "k", "M", "G", "T", "P", "E"];
  var tier = Math.log10(Math.abs(number)) / 3 | 0;
  if(tier == 0) return number;
  var postfix = SI_POSTFIXES[tier];
  var scale = Math.pow(10, tier * 3);
  var scaled = number / scale;
  var formatted = scaled.toFixed(1) + '';
  if (/\.0$/.test(formatted))
    formatted = formatted.substr(0, formatted.length - 2);
  return formatted + postfix;
}
function toCells(s,idx) {
	const td = str=> '<td>'+str+'</td>';
	const tdrk = (str,style)=> "<td class='dark-gold'>"+str+'</td>';
	return tdrk(idx)+td(s.votes[0])+td(s.name)+td(s.mode)+td(s.year)+tdrk(shortNum(s.bits))+tdrk(shortNum(s.votes.length));
}