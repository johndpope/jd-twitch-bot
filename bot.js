'use strict';
const fetch = require('node-fetch');
const tmi = require('tmi.js');
const fs = require('fs');
const Fuse = require('fuse.js');
/*-----------------------------------GUI-----------------------------------*/
// Modules to control application life and create native browser window
const {app, BrowserWindow, ipcMain} = require('electron');

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;

function createWindow () {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false,
    icon: 'assets/bot-icon.png',
    webPreferences: {
      nodeIntegration: true
    }
  });

  // and load the index.html of the app.
  mainWindow.loadFile('index.html');

  // Open the DevTools.
  //mainWindow.webContents.openDevTools()
  mainWindow.webContents.session.clearStorageData();
  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null
  });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed.
app.on('window-all-closed', function () {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) createWindow();
});

// Define configuration options
const list = loadJSON('assets/list.json');
const JD = loadJSON('assets/JD.json');
const cfg = loadJSON('assets/settings.json');
let bot;
let lastUpdated = 0;
let lastTimeout = 0;

// Called every time a message comes in
function onMessageHandler (target, user, msg, self) {
  if (self) return; // Ignore messages from the bot
  if(msg[0]!=='!') return; // Not a command
  // Create obj holding command properties
  const cmd = getCmd(msg);
  // If the command is known, let's execute it
  const hasPermission = lvl=> {
    switch(lvl) 
    { case 0: return true; case 1: return user.subscriber; case 2: return user.mod|user.username==target.substring(1); case 3: return false }
  }
  if (cmd.is('dance')) {
    if(!cmd.msg) return;
    if(hasPermission(cfg.CMD.dance.level)) {
      bot.say(target,addRequest(user['display-name'],user['subscriber'],cmd.msg));
      console.log(`* Executed command ${cmd.name}`);
    }
  }
  else if(cmd.is('current')) {
    if(hasPermission(cfg.CMD.current.level)) {
      if (list.songs.length) 
        return bot.say(target,parseResp(cfg.CMD.current.response,{$user:user['display-name'],$song:list.songs[0].name,$reqBy:list.songs[0].votes[0]}));
      return bot.say(target,parseResp(cfg.CMD.current.response1,{$user:user['display-name']}));
    }
  }
  else if(cmd.is('next')) {
    if(hasPermission(cfg.CMD.next.level)) {
      if(list.songs.length>1)
        return bot.say(target,parseResp(cfg.CMD.next.response,{$user:user['display-name'],$song:list.songs[1].name,$reqBy:list.songs[1].votes[0]}));
      return bot.say(target,parseResp(cfg.CMD.next.response1,{$user:user['display-name']}));
    }
  }
  else if(cmd.is('position')) {
    if(hasPermission(cfg.CMD.position.level)) {
      const idx = list.songs.findIndex(song=>song.votes[0]==user['display-name']);
      if(idx<0) return bot.say(target,parseResp(cfg.CMD.position.response1,{$user:user['display-name'],$song:'none',$pos:0}));
      bot.say(target,parseResp(cfg.CMD.position.response,{$user:user['display-name'],$song:list.songs[idx].name,$pos:idx+1}));
    }
  }
  else if(cmd.is('wrongsong')) {
    if(hasPermission(cfg.CMD.wrongsong.level)) {
      const idx = list.songs.reverse().findIndex(song=>song.votes[0]==user['display-name']);
      if(idx<0) return bot.say(target,parseResp(cfg.CMD.wrongsong.response1,{$user:user['display-name'],$song:'none'}));
      let song = list.songs.splice(idx,1)[0];
      list.users[user['display-name']]--;
      list.songs.reverse();
      mainWindow.webContents.send('ready',list.songs);
      updateList();
      bot.say(target,parseResp(cfg.CMD.wrongsong.response,{$user:user['display-name'],$song:song.name}));
    }
  }
  else if(cmd.is('size')) {
    if(hasPermission(cfg.CMD.size.level))
      bot.say(target,parseResp(cfg.CMD.size.response,{$user:user['display-name'],$size:list.songs.length||'0'}));
  }
  else {
    console.log(`* Unknown command ${cmd.name}`);
  }
}

// Called every time the bot connects to Twitch chat
function onConnectedHandler (addr, port) {
  console.log(`* Connected to ${addr}:${port}`);
  mainWindow.webContents.send('connection','');
}
function onDisconnectedHandler (reason) {
  console.log(`* Disconnected reason: ${reason}`);
  mainWindow.webContents.send('connection',reason);
}

// Add song
function addRequest(user,sub,msg,cheers) {
  const request = searchSong(msg)[0];
  if(!request) return parseResp(cfg.response.addFail,{$user:user,$msg:msg});
  const sort = ()=> {
    list.songs.sort((a,b)=>(a.votes.length+a.bits/cfg.bitRatio)<(b.votes.length+b.bits/cfg.bitRatio));
    mainWindow.webContents.send('sort',list.songs); return true;
  }
  const vars = {$user:user,$song:request.name,$userLimit:sub&&cfg.limit.sub||cfg.limit.viewer,$votes:1,$msg:msg};
  let index = cfg.blacklist.findIndex(song=>song.id==request.id);
  if(index>=0) {
    if(!cfg.blacklist[index].price) return parseResp(cfg.response.bannedSong,vars);
    vars.$price=cfg.blacklist[index].price;
    if(!cheers||cheers<vars.$price) return parseResp(cfg.response.paidSong,vars);
  }
  const getIndex = ()=> list.songs.findIndex(song=>song.id==request.id);
  index = getIndex();
  if (index>=0) {
    if(!cheers) if(list.songs[index].votes.some(vote=>vote===user)) return parseResp(cfg.response.voteFail,vars);
    cheers&&(list.songs[index].bits+=cheers)||list.songs[index].votes.push(user);
    vars.$votes=list.songs[index].votes.length;
    sort(); updateList();
    vars.$pos=getIndex()+1;
    return parseResp(cfg.response.vote,vars);
  }
  else if (list.users[user]) {
    if(!cheers) if(list.users[user]>=(sub&&cfg.limit.sub||cfg.limit.viewer)) return parseResp(cfg.response.limit,vars);
    list.users[user]++;
  }
  else list.users[user] = 1;
  list.songs.push({id:request.id,name:request.name,mode:request.mode,year:request.year,bits:cheers||0,votes:[user]});
  request.routine&&(list.songs[list.songs.length-1].routine=request.routine);
  updateList();
  cheers&&sort()||mainWindow.webContents.send('add-req',list.songs[list.songs.length-1]);
  vars.$pos=getIndex()+1;
  return parseResp(cfg.response.add,vars);
}

function connectBot(callback) {
  fetch('https://api.twitch.tv/kraken?oauth_token='+cfg.bot.oauth.substring(6)).then(r=>r.json()).then(json=>{
    cfg.bot.name = json.token.user_name;
    bot = new tmi.client({
      identity: {
        username: cfg.bot.name,
        password: cfg.bot.oauth
      },
      channels: [
        cfg.bot.channel
      ]
    });
    bot.on('message', onMessageHandler);
    bot.on('connected', onConnectedHandler);
    bot.on('disconnected', onDisconnectedHandler);
    bot.on("cheer", (channel, user, message) => {
      if(user.bits>=cfg.bitRatio) {
        let cmd = message.replace(/(cheer|pogchamp|showlove|pride|heyguys|frankerz|seemsgood|party|kappa|dansgame|elegiggle|trihard|kreygasm|4head|swiftrage|notlikethis|failfish|vohiyo|pjsalt|mrdestructoid|bday|ripcheer|shamrock)(1|5)(0){0,4}( |)/gi,'').trim();
        if(cmd[0]!='!') return;
        cmd = getCmd(cmd);
        if(!cmd.is('dance')) return;
        bot.say(channel,addRequest(user['display-name'],user['subscriber'],cmd.msg,user.bits));
      }
    });
    bot.connect();
    mainWindow.webContents.session.clearStorageData();
    callback&&callback();
  });
}

function packSongs() {
  let garbage = document.getElementById('test').value.split(/(, \d{4}|\)|at launch)\n(?!January|February|March|April|May|June|July|August|September \d|October|November|December)/g);
  garbage = garbage.map(song=>song.substring(0,song.indexOf('\t\n')));
  garbage = garbage.filter(song=>song);
  return garbage = garbage.reduce((acc,song)=>{const arr=song.split('\t'); acc.push({name:arr[0].trim(),artist:arr[1].trim(),year:arr[2].trim(),mode:arr[3].trim(), unltd:false}); return acc},[]);
  //fs.writeFile('listUnltd.json', JSON.stringify(garbage), e=>console.log(e));
}
function loadJSON(file) { return JSON.parse(fs.readFileSync(file, 'utf8')) }
function parseResp(r,vars) { r.match(/\$\w+/g).forEach(k=>r=r.replace(k,vars[k]||k)); return r }
function getCmd(msg) {
  msg = msg.split(/\s+/);
  const cmd = {name: msg[0].toLowerCase(), args: msg.slice(1)};
  cmd.is = name => cmd.name === cfg.CMD[name].name;
  cmd.msg = cmd.args.reduce((str,w)=>str+=w+' ','').trim();
  return cmd
}
function searchSong(str) {
  const options = {
    shouldSort: true,
    tokenize: true,
    threshold: 0.2,
    location: 0,
    distance: 11,
    maxPatternLength: 32,
    minMatchCharLength: 1,
    keys: [
      "name",
      "routine",
      "mode",
      "artist"
    ]
  };
  const fuse = new Fuse(JD,options);
  return fuse.search(str);
}
function updateList() {
  fs.writeFile('assets/list.json',JSON.stringify(list),e=>console.log(e));
}

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
ipcMain.on('ready',(e,r)=>cfg.bot.autoconnect&&connectBot()||e.sender.send('ready',list.songs));
ipcMain.on('win-action',(e,r)=>{
  const win=BrowserWindow.getFocusedWindow();
  if(r==='maximize'&&win.isMaximized()) win.unmaximize();
  else win[r]()
});
ipcMain.on('connection',(e,r)=>{
  if(r=='leave') { bot.disconnect(); return }
  cfg.bot.channel = r[0];
  cfg.bot.oauth = r[1];
  cfg.bot.autoconnect = r[2];
  connectBot(()=>{
    fs.writeFile('assets/settings.json',JSON.stringify(cfg),e=>console.log(e));
    e.sender.send('reply',['',cfg]);
  });
});
ipcMain.on('bot-data',(e,r)=>{
  let response = '';
  if(r!=='sync') {
    cfg.limit.viewer=r[0]; cfg.limit.sub=r[1]; cfg.CMD.dance.name=r[2]
    cfg.response.add=r[3]; cfg.response.vote=r[4]; cfg.response.limit=r[5]; cfg.response.voteFail=r[6]; cfg.response.addFail=r[7];
    cfg.response.bannedSong=r[8]; cfg.response.paidSong=r[9];
    cfg.bitRatio = r[10]; cfg.CMD.dance.level=r[11]; cfg.banPrice=r[12]; cfg.blacklist=r[13];
    cfg.CMD.current.name=r[14]; cfg.CMD.current.level=r[15]; cfg.CMD.current.response=r[16]; cfg.CMD.current.response1=r[17]
    cfg.CMD.next.name=r[18]; cfg.CMD.next.level=r[19]; cfg.CMD.next.response=r[20]; cfg.CMD.next.response1=r[21];
    cfg.CMD.position.name=r[22]; cfg.CMD.position.level=r[23]; cfg.CMD.position.response=r[24]; cfg.CMD.position.response1=r[25];
    cfg.CMD.wrongsong.name=r[26]; cfg.CMD.wrongsong.level=r[27]; cfg.CMD.wrongsong.response=r[28]; cfg.CMD.wrongsong.response1=r[29];
    cfg.CMD.size.name=r[30]; cfg.CMD.size.level=r[31]; cfg.CMD.size.response=r[32];
    fs.writeFile('assets/settings.json',JSON.stringify(cfg),e=>console.log(e));
    response = 'saved';
  }
  e.sender.send('reply',[response,cfg]);
});
ipcMain.on('remove-all',(e,r)=>(list.users={})&&(list.songs=[])&&updateList());
ipcMain.on('next-song',(e,r)=>{
  list.users[list.songs[r].votes[0]]--;
  list.songs.splice(r,1);
  updateList();
});
ipcMain.on('blacklist',(e,r)=>{
  if(r.length==1) return e.sender.send('bl-results',searchSong(r[0]));
  if(r.length==2) {
    const song = list.songs[r[0]];
    list.songs.splice(r[0],1);
    list.users[song.votes[0]]--;
    updateList();
    if(!cfg.blacklist.some(banned=>banned.id==song.id)) {
      cfg.blacklist.push({id:song.id,name:song.name,mode:song.mode,price:parseInt(r[1])});
      cfg.blacklist.sort((a,b)=>a.price<b.price);
      fs.writeFile('assets/settings.json',JSON.stringify(cfg),e=>console.log(e));
      e.sender.send('reply',['blacklist',cfg.blacklist]);
    } return;
  }
  e.sender.send('blacklist',{id:r[0].id,name:r[0].name,mode:r[0].mode,price:parseInt(r[1])});
});
