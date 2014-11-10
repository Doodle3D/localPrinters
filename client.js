var CLOUD_URL = "https://cloud.doodle3d.com";
//var CLOUD_URL = "http://localhost:5000";
var userKey;
var container = document.querySelector("#printers");
var rootSocket;
//var socketHash = {};
init();
function init() {
  var appData = localStorage.getItem("localPrinters");
  console.log("appData: ",appData);
  if(appData === null) return register();
  appData = JSON.parse(appData);
  userKey = appData.userKey;
  rootSocket = connectTo("/");
  rootSocket.once("connect",function() {
    connectTo("/localprinters",function(err,nsp) {
      nsp.on("appeared",function(printerData) {
        console.log("localprinters appeared: ",printerData.id,printerData.name);
        addPrinter(printerData);
      });
      nsp.on("disappeared",function(printerData) {
        console.log("localprinters disappeared: ",printerData.id,printerData.name);
        removePrinter(printerData);
      });
    });
  });
  rootSocket.on('error',function(err) {
    if(err === "User unknown") register();
  });
}
function register() {
  console.log("register user");
  request.post(CLOUD_URL+"/user/register", function(err, httpResponse, body) {
    if(err) throw new Error("printer register error: "+err);
    if(typeof body !== "object") {
      body = JSON.parse(body);
    }
    console.log("user registered");
    localStorage.setItem("localPrinters",JSON.stringify({userKey:body.key}));
    init();
  });
}

var counter = 0;
function addPrinter(printerData) {
  //{id, name, features, online}
  
  if(getPrinter(printerData)) return;
  console.log("addPrinter: ",printerData.id,printerData.name);
  
  var printerElement = document.createElement("div");
  container.appendChild(printerElement);
  printerElement.id = "printer-"+printerData.id;
  printerElement.setAttribute("class","printer");

  var nameElement = document.createElement("p");
  printerElement.appendChild(nameElement);
  nameElement.textContent = printerData.name;
  
  var webcamElement = document.createElement("img");
  printerElement.appendChild(webcamElement);
  
  var dataElement = document.createElement("pre");
  printerElement.appendChild(dataElement);
  
  var ignores = ["features","name"];
  var printerDataHM = JSON.parse(JSON.stringify(printerData));
  printerDataHM.prid = {};
  for(var i in ignores) {
    delete printerDataHM[ignores[i]];
  }
  connectTo("/"+printerData.id,function(err,nsp) {
    var count = counter++;
    
    createAnyEvents(nsp);
    nsp.on("any",function(eventType,data) {
      console.log(printerData.id+": "+count+": event: ",eventType,data);
      //printerData
      printerDataHM.prid[eventType] = data;
      dataElement.textContent = YAML.stringify(printerDataHM,4);
    });
  });
  
  connectTo("/"+printerData.id+"-webcam",function(err,nsp) {
    var imageCounter = 0;
    ss(nsp).on('image', function(stream) {
      var imageIndex = imageCounter++;
      console.log(printerData.id+": "+imageIndex+": on image");
      var binaryString = "";
      stream.on('data', function(data) {
        console.log(printerData.id+": "+imageIndex+": on data");
        for(var i=0;i<data.length;i++) {
            binaryString+=String.fromCharCode(data[i]);
        }
      });
      stream.on('end', function() {
        console.log(printerData.id+": "+imageIndex+": on end");
        webcamElement.setAttribute("src","data:image/jpg;base64,"+window.btoa(binaryString));
        binaryString = "";
      });
    });
  });
}
function removePrinter(printerData) {
  var img = getPrinter(printerData);
  if(!img) return;
  console.log("removePrinter: ",printerData.id,printerData.name);
  
  container.removeChild(img);
}
function getPrinter(printerData) {
  return document.querySelector("#printers #printer-"+printerData.id);
}

function connectTo(nsp,callback) {
  console.log(nsp+": connecting");
  //if(socketHash[nsp]) return socket;
  //console.log(nsp+": really connecting");
  var nspURL = CLOUD_URL+nsp+'?key='+userKey;
  //var socket = io(nspURL, {forceNew:true});
  //socketHash[nsp] = socket;
  var socket = io(nspURL);
  if(!socket.connected) {
    socket.once('connect',function() {
      console.log(nsp+": connected");
      if(callback) callback(null,socket);
    });
    socket.once('error',function(err) {
      console.log(nsp+": error: ",err);
      if(callback) callback(err);
    });
  }
  return socket;
}
function createAnyEvents(socket) {
  var streamEvent = ss.Socket.event;
  // socket.io socket
  if(socket.onevent !== undefined) {
    var originalOnEvent = socket.onevent;
    socket.onevent = function() {
      // emit regular event
      originalOnEvent.apply(socket, arguments);
      var data = arguments[0].data;
      // ignore any and internal socket.io-stream events
      if(data[0] === 'any' || data[0].indexOf(streamEvent) === 0) return;
      // Note: turn this event into a 'any' event
      // We add the event type as first argument, the regular arguments 
      // (data and callback) become the subsequent arguments
      data.unshift('any');
      // emit 'any' event
      originalOnEvent.apply(socket, arguments);
    };
  } else if(socket.sio && socket.$emit) {
    // listen for stream events on original socket.io socket
    socket.sio.on(streamEvent,function() {
      var args = Array.prototype.slice.call(arguments);
      // Chanding original event to any event, 
      // adding original event type as argument
      // from: eventType, pos, streamID, data, callback
      // to: any, pos, eventType, streamID, data, callback
      // Adding original eventType after pos:
      args.splice(2,0,args[0]); 
      // Changing event type to any:
      args[0] = 'any'; 
      // Increment pos (streamID position) to 1 
      // (because we added eventType in front of it)
      //args[1] = [1]; 
      for(var i in args[1]) args[1][i]++;
      socket.$emit.apply(socket,args);
    });
  } else {
    debug("Error: Can't create 'any' event");
  }
}