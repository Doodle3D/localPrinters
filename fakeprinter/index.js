var io = require('socket.io-client');
var keypress = require('keypress');
var request = require('request');
var spawn = require('child_process').spawn;
var ss = require('socket.io-stream');
var LocalStorage = require('node-localstorage').LocalStorage;
var localStorage = new LocalStorage('./localStorage');

//var CLOUD_URL = "https://cloud.doodle3d.com";
var CLOUD_URL = "http://localhost:5000";
var APP_NAME = "localprinters-fakeprinter";
var pridNSP;
var printerNSP;
var webcamNSP;
var snapshotTimeout;
var sockets = [];

//var printerKey = '545d34c344204e5e34eb07ceggWuT64If0TNO3nVSbMd';
var printerKey; //= '545fd2549b049b00003aec98hTVMaddHoEfTWBSuG1IL';
//var printerID = '545d34c344204e5e34eb07ce';
var printerID; // = '545fd2549b049b00003aec98';

//register(function(err,printerKey,printerID) {
// console.log(err,printerKey,printerID);
// process.exit();
//});
//return;

if (process.env['_']=='/opt/local/bin/nodemon') {
  console.log("using nodemon, keyboard interaction disabled");
} else {
  console.log('not using nodemon, keyboard interaction enabled')
  console.log('launcher',process.env['_']);
  // make `process.stdin` begin emitting "keypress" events
  keypress(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();  
}
connect();

process.stdin.on('keypress', function (ch, key) {
  //console.log('got "keypress"', key);
  if(!key) return;
  switch(key.name) {
    case 'p':
      console.log("emit state=print");
      setState('printing');
      break;
    case 'q':
    case 'i':
      console.log("emit state=idle");
      setState('idle');
      break;
    case 'd':
      console.log("disconnect");
      for(var i in sockets) {
        sockets[i].disconnect();
      }
      break;
    case 'r':
      console.log("reconnect");
      connect();
      break;
    case 'c':
      process.exit();
      break;   
  }
});

function connect() {
  var appData = localStorage.getItem(APP_NAME);
  console.log("appData: ",appData);
  if(appData === null) return register();
  appData = JSON.parse(appData);
  printerKey = appData.printerKey;
  printerID = appData.printerID;
  connectTo("/",function(err,nsp) {
    if(err) {
      if(err === "Printer unknown") register();
      else throw new Error(err);
    }
    setTimeout(function() {
      connectTo("/"+printerID,function(err,nsp) {
        if(err) throw new Error(err);
        pridNSP = nsp;
        console.log("fake /"+printerID + " emit printerState & clientSSID");
        // nsp.emit("printerState", {state: "idle"});
        setState('idle');
        nsp.emit("clientSSID",{ssid:"Vechtclub XL F1.19"});
      });  
      connectTo("/"+printerID+"-printer",function(err,nsp) {
        if (err) throw new Error(err);
        printerNSP = nsp;
        nsp.on("print",function(data,cb,stream) {
          console.log("onPrint",data,cb,stream);
          setState('printing');
          if (cb) cb(null,"ok");
        });
        nsp.on("stop",function(data,cb,stream) {
          console.log("onStop",data,cb,stream);
          if (cb) cb(null,"ok");
          setState('idle');
        });
      });
      connectTo("/"+printerID+"-webcam",function(err,nsp) {
        if (err) throw new Error(err);
        webcamNSP = nsp;
        takeSnapshot();
      });
    },500);
  });
}

function takeSnapshot() {
  console.log('taking snapshot');
  if(!webcamNSP || !webcamNSP.connected) return;
  var snapshot = spawn('imagesnap', ['-'])
  var convert = spawn('convert', ['-', '-quality', '80', '-resize', '640x360', 'JPEG:-']);
  var stream = ss.createStream();
  ss(webcamNSP).emit('image', stream); 
  snapshot.stdout.pipe(convert.stdin);
  convert.stdout.pipe(stream);
  convert.stdout.on("end",function() {
    console.log("  snapshot was send");
    clearTimeout(snapshotTimeout);
    takeSnapshot();
  });
  clearTimeout(snapshotTimeout);
  snapshotTimeout = setTimeout(takeSnapshot,5000);
}
function setState(state) {
  console.log(!!pridNSP,!!printerNSP,state);
  if (pridNSP) pridNSP.emit("printerState", {state: state});
  if (printerNSP) printerNSP.emit("state", {state: state});
}

function connectTo(nsp,callback) {
  var nspURL = CLOUD_URL+nsp+'?key='+printerKey;
  nspURL += "&type=printer";
  var socket = io.connect(nspURL, {forceNew:true});
  socket.once('connect',function() {
    console.log(nsp+": connected");
    if(callback) callback(null,socket);
  });
  socket.once('error',function(err) {
    console.log(nsp+": error: ",err);
    if(callback) callback(err);
  });
  sockets.push(socket);
  return socket;
}
function register() {
  console.log("register");
  var json = {
    name: APP_NAME,
    features: ["printer","webcam","slice"]
  };
  request.post({url:CLOUD_URL+"/printer/register", json:json}, function(err, httpResponse, body) {
    if(err) throw new Error("printer register error: "+err);
    if(typeof body !== "object") {
      throw new Error("invalid register response: ",body);
    }
    var appData = {
      printerKey:body.key,
      printerID: body.id
    };
    localStorage.setItem(APP_NAME,JSON.stringify(appData));
    connect();
  });
}