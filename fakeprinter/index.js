var keypress = require('keypress');
var debug = require('debug')('fakeprinter');
var spawn = require('child_process').spawn;
var ss = require('socket.io-stream');
var fs = require('fs');

//var PORT = process.env.PORT ? process.env.PORT : 5000;
//var CLOUD_URL = "https://cloud.doodle3d.com";
var CLOUD_URL = "http://localhost:5001";
var printer = require("./mock/printer")(CLOUD_URL);
var printerID;
var printerKey;
var nspPrinterRoot;
var nspPrinterPrinter;

//var printerKey = '545d34c344204e5e34eb07ceggWuT64If0TNO3nVSbMd';
var printerKey = '545fd2549b049b00003aec98hTVMaddHoEfTWBSuG1IL';
//var printerID = '545d34c344204e5e34eb07ce';
var printerID = '545fd2549b049b00003aec98';

//printer.register(function(err,printerKey,printerID) {
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
  connect();
}

  
function setState(state) {
  console.log(!!nspPrinterRoot,!!nspPrinterRoot,state);
  if (nspPrinterRoot) nspPrinterRoot.emit("printerState", {state: state});
  if (nspPrinterPrinter) nspPrinterPrinter.emit("state", {state: state});
}

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
      console.log("nspPrinterRoot disconnect");
      nspPrinterRoot.disconnect();
      break;
    case 'r':
      console.log("nspPrinterRoot + nspPrinterPrinter reconnect");
      connect();
      break;
    case 'c':
      process.exit();
      break;   
  }
});

function connect() {
  printer.connectTo("/",printerKey,{forceNew:true},function(err,nsp) {
    if(err) throw new Error(err);
    setTimeout(function() {
      
      printer.connectTo("/"+printerID,printerKey,{forceNew:true},function(err,nsp) {
        if(err) throw new Error(err);
        nspPrinterRoot = nsp;

        console.log("fake /"+printerID + " emit printerState & clientSSID");

        // nsp.emit("printerState", {state: "idle"});
        setState('idle');
        nsp.emit("clientSSID",{ssid:"Vechtclub XL F1.19"});
      });  

      printer.connectTo("/"+printerID+"-printer",printerKey,{forceNew:true},function(err,nsp) {
        if (err) throw new Error(err);
        // if (!nsp) throw new Error("Error /"+printerID+"-printer namespace is not ready");

        nspPrinterPrinter = nsp;

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

      printer.connectTo("/"+printerID+"-webcam",printerKey,{forceNew:true},function(err,nsp) {
        if (err) throw new Error(err);
        takeSnapshot();
        function takeSnapshot() {
          console.log('tick cam');
          var snapshot = spawn('imagesnap', ['-'])
          var convert = spawn('convert', ['-', '-quality', '80', '-resize', '640x360', 'JPEG:-']);
          var stream = ss.createStream();
          ss(nsp).emit('image', stream); 
          snapshot.stdout.pipe(convert.stdin);
          convert.stdout.pipe(stream);
          convert.stdout.on("end",function() {
            console.log("convert end");
            setTimeout(takeSnapshot,200);
          });
        }
      });
    },500);
  });  
}