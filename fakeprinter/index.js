var keypress = require('keypress');
var debug = require('debug')('fakeprinter');
var spawn = require('child_process').spawn
var ss = require('socket.io-stream');
var fs = require('fs');

//var PORT = process.env.PORT ? process.env.PORT : 5000;
var CLOUD_URL = "https://cloud.doodle3d.com";
var printer = require("./mock/printer")(CLOUD_URL);
var printerID;
var printerKey;
var nspPrinterRoot;
var nspPrinterPrinter;
var nspPrinterWebcam;
var webcamEnabled = false;

var printerKey = '545d34c344204e5e34eb07ceggWuT64If0TNO3nVSbMd';
var printerID = '545d34c344204e5e34eb07ce';

// printer.register(function(err,printerKey,printerID) {
//   console.log(err,printerKey,printerID);
//   process.exit();
// });

// console.log(process.env);

if (process.env['_']=='/opt/local/bin/nodemon') {
  console.log("using nodemon, keyboard interaction disabled");
} else {
  console.log('not using nodemon, keyboard interaction enabled')
  console.log('launcher',process.env['_']);
  // make `process.stdin` begin emitting "keypress" events
  keypress(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  printer.connectTo("/",printerKey,{forceNew:true},function(err,nsp) {
    if(err) throw new Error(err);
    connect();
  });  
  
}

  
function setState(state) {
  console.log(!!nspPrinterRoot,!!nspPrinterRoot,state);
  if (nspPrinterRoot) nspPrinterRoot.emit("printerState", {state: state});
  if (nspPrinterPrinter) nspPrinterPrinter.emit("state", {state: state});
}

process.stdin.on('keypress', function (ch, key) {
  //console.log('got "keypress"', key);
  
  if (!key) return;

  if (key.name == 'p') {
    console.log("emit state=print");
    setState('printing');
  }
  if (key.name == 'q') {
    console.log("emit state=idle");
    setState('idle');
  }
  if (key.name == 'd') {
    console.log("nspPrinterRoot disconnect");
    nspPrinterRoot.disconnect();
    // nspPrinterPrinter.disconnect();
  }

  if (key.name == 'r') {
    console.log("nspPrinterRoot + nspPrinterPrinter reconnect");
    connect();
  }

  if (key.ctrl && key.name == 'c') {
    process.exit();
  }

  // process.stdout.write(key);
});

function connect() {

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
  setTimeout(function() {
    printer.connectTo("/"+printerID+"-webcam",printerKey,{forceNew:true},function(err,nsp) {
      if (err) throw new Error(err);
      nspPrinterWebcam = nsp;

      setInterval(function() {

        console.log('tick cam');
        var snapshot = spawn('imagesnap', ['-'])
        var convert = spawn('convert', ['-', '-quality', '80', '-resize', '640x360', 'JPEG:-']);
        var stream = ss.createStream();
        ss(nspPrinterWebcam).emit('image', stream); 
        snapshot.stdout.pipe(convert.stdin);
        convert.stdout.pipe(stream);
        //snapshot.stdout.pipe(stream);

      },1000);
    });
  },1000);
}


