var socketClient = require('socket.io-client');
var request = require('request');
var debug = require('debug')('fakeprinter:mock:printer');

module.exports = Printer;

function Printer(cloudURL) {
  if (!(this instanceof Printer)) return new Printer(cloudURL);

  this.cloudURL = cloudURL;

  this.id = "";
  this.key = "";
  this.name = "Peters-fakeprinter";
  this.features = ["printer","network","debug","update","config","webcam","slicer"];


  this.register = function(callback) {
    var postOptions = {
      url:this.cloudURL+"/printer/register",
      json:{name: this.name, features: this.features}
    };
    request.post(postOptions, function(err, httpResponse, body) {
      if(err) return callback(new Error("printer register error: "+err),null);
      if(typeof body !== "object") {
        return callback(new Error("invalid register response"),null,null);
      }
      this.id = body.id;
      this.key = body.key;
      callback(null,body.key,body.id);
    });
  };
  this.connectTo = function(nspName,key,options,callback) {
    
    if(typeof options === "function") {
      callback = options;
      options = undefined;
    }
    if(options === undefined) {
      options = {};
    }
    
    var nsp = socketClient(this.cloudURL+nspName+"?key="+key+"&type=printer",options);
    nsp.once('connect', function(){
      callback(null,nsp);
      nsp.removeListener('error',onError);
    });
    nsp.on('error', onError);
    function onError(err){
      callback(err,nsp);
    }
  };
}
