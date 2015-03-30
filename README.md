# chromeflix
Chrome torrent streaming library.

## Description
This is basically a stripdown of [astro's bitford](https://github.com/astro/bitford) chrome extension.
In our use case we don't want/need the UI, we just need a clean API to start, stream and stop a torrent.

## Idea
My idea with this is to take advantage of the `externally_connectable` property on the [extension manifest](https://developer.chrome.com/extensions/manifest/externally_connectable).
By declaring this property you're basically allowing communication with the chrome extension from certain domains.

This way we can send messages from plain javascript on the openflix site directly to the extension.

### Example
We could have this piece of code running on openflix:

````
// the torrent to download
var torrent = 'http://torcache.net/torrent/640FE84C613C17F663551D218689A64E8AEBEABE.torrent';
// the chrome extension ID
var extId = 'aaabbbccc';
// when using Chrome, we can open a communcation port to the extension
var port = chrome.runtime.connect(extId);
// through this port we can send a message to the extension
port.postMessage({
  // let's say to the extension to start a torrent download
  command: 'start',
  // the torrent URL
  data: {
    torrent: torrent
  }
});
````

And the extension side of this:

````
var port;
// declare a list of available commands
var commands = {
	'start': start,
	'stop': stop,
	'stream': stream
};
// add the listener for external messages
chrome.runtime.onConnectExternal.addListener(connectionHandler);
// handles connections
function connectionHandler(incomingPort) {
	port = incomingPort;
	port.onMessage.addListener(requestHandler);
}
// handles request by the command property and pass the data as argument
var requestHandler = function(req) {
	commands[req.command](req.data);
	// return true for asynch operation
	return true;
};

// start the torrent
function start(req) {
  // the goal is to have this clean API that can communicate back to openflix
  var torrent = new Torrent(req.data);
  torrent
    .start()
    .then(function(torrent) {
      return torrent;
    });
}
````

## Status
Actually some changes have happened here but evolution is slow...

I haven't yet fully understood all of the code that astro did on this and I haven't work before on Chrome extensions, so I'm refactoring a few things here, a few things explode over there and gets a bit painful sometimes.
