var port;
var torrent;
var torrents = [];
/**
 * available commands
 * @type {Object}
 */
var commands = {
	'downloadTorrent': downloadTorrent,
	'removeTorrent': removeTorrent,
	'getTorrent': getTorrent
};

chrome.runtime.onConnectExternal.addListener(connectionHandler);
function connectionHandler(incomingPort) {
	port = incomingPort;
	port.onMessage.addListener(requestHandler);
}

var requestHandler = function(req) {
	commands[req.command](req.data);
	return true;
};

function downloadTorrent(req) {
	var xhr = new XMLHttpRequest();
	var proxy = 'https://cors-anywhere.herokuapp.com/';
	xhr.open('GET', proxy + req.torrent);
 	xhr.responseType = 'arraybuffer';
 	xhr.onload = function(e) {
		if (this.status == 200) {
			var torrent = new Uint8Array(xhr.response);
			addTorrent(torrent);
		}
	};
	xhr.send(null);
}

function getTorrent() {
	if(torrent) {
		return torrent;
	}
}

function removeTorrent() {
	if(torrent) {
		torrent.end();
		if (sessionTx) {
			sessionTx("readwrite", 'torrents', function(objectStore) {
			    objectStore.delete(bufferToHex(torrent.infoHash));
			});	
		}
	}
}

function addTorrent(binary) {
    var torrentMeta = BEnc.parse(binary);
    
    var torrentData = {
    	name: String.fromCharCode.apply(null, torrentMeta.info.name),
    	file: String.fromCharCode.apply(null, torrentMeta.info.files[0].path[0])
    };

    port.postMessage({ command: 'torrentActive', data: {torrent: torrentData } });
    
    /* Calc infoHash */
    var sha1 = new Digest.SHA1();
    var infoParts = BEnc.encodeParts(torrentMeta.info);

    infoParts.forEach(sha1.update.bind(sha1));
    torrentMeta.infoHash = new Uint8Array(sha1.finalize());
   
    torrent = new Torrent(torrentMeta);

    torrents.push(torrent);

    if (sessionTx)
	sessionTx("readwrite", 'torrents', function(objectStore) {
	    objectStore.put(binary, bufferToHex(torrentMeta.infoHash));
	});
}

/* Peer listener */
var peerPort;

tryCreateTCPServer(6881, function(sock) {
    servePeer(sock, servePeer);
}, setPeerPort);

function setPeerPort(err, port) {
	if(port) {
		peerPort = port;
	}
}

function servePeer(peer) {
	for(var i = 0; i < torrents.length; i++) {
	    if (bufferEq(peer.infoHash, torrents[i].infoHash))
		break;
	}
	if (i < torrents.length) {
	    torrent.peers.push(peer);
	    peer.torrent = torrent;
	} else {
	    console.error("incoming", peer.ip, "unknown torrent", peer.infoHash);
        peer.end();
	}
}
