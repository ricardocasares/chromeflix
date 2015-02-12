var port;

chrome.runtime.onConnectExternal.addListener(connectionHandler);
function connectionHandler(incomingPort) {
	port = incomingPort;
	port.onMessage.addListener(requestHandler);
}

var commands = {
	'addTorrent': addTorrent,
	'downloadTorrent': downloadTorrent
};

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


/**
 * API
 */
var torrents = [];

function addTorrent(binary) {
    var torrentMeta = BEnc.parse(binary);
    
    var videoMovieURL = {
    	name: String.fromCharCode.apply(null, torrentMeta.info.name),
    	file: String.fromCharCode.apply(null, torrentMeta.info.files[0].path[0])
    };

    console.log(videoMovieURL);
    port.postMessage({ torrent: videoMovieURL });
    
    /* Calc infoHash */
    var sha1 = new Digest.SHA1();
    var infoParts = BEnc.encodeParts(torrentMeta.info);

    infoParts.forEach(sha1.update.bind(sha1));
    torrentMeta.infoHash = new Uint8Array(sha1.finalize());
    function bin2String(array) {
	  var result = '';
	  for (var i = 0; i < array.length; i++) {
	    result += String.fromCharCode(parseInt(array[i], 2));
	  }
	  return result;
	}

    var torrent = new Torrent(torrentMeta);
    // TODO: infoHash collision?
    torrents.push(torrent);

    if (sessionTx)
	sessionTx("readwrite", 'torrents', function(objectStore) {
	    objectStore.put(binary, bufferToHex(torrentMeta.infoHash));
	});
}

function loadTorrent(file) {
    var reader = new FileReader();
    reader.onload = function() {
	addTorrent(reader.result);
    };
    reader.readAsArrayBuffer(file);
}

function rmTorrent(torrent) {
    torrent.end();
    console.log("filtering");
    torrents = torrents.filter(function(torrent1) {
	return torrent !== torrent1;
    });
    if (sessionTx)
	sessionTx("readwrite", 'torrents', function(objectStore) {
	    objectStore.delete(bufferToHex(torrent.infoHash));
	});
    console.log("removed");
}

/**
 * Session handling
 */
var sessionTx = function() {};

function openSession(cb) {
    var req = indexedDB.open("bitford-session", 2);
    req.onerror = function() {
	console.error("indexedDB", arguments);
    };
    req.onupgradeneeded = function(event) {
	var db = event.target.result;
	db.createObjectStore('torrents');
	db.createObjectStore('settings');
    };
    req.onsuccess = function(event) {
	var db = event.target.result;
	if (!db)
	    throw "No DB";

	cb(db);
    }.bind(this);
}

function restoreSession(cb) {
    sessionTx("readonly", 'torrents', function(objectStore) {
	var req = objectStore.openCursor(
	    IDBKeyRange.lowerBound(""),
	    'next'
	);
	req.onsuccess = function(event) {
	    var cursor = event.target.result;
	    if (cursor) {
		addTorrent(cursor.value);
		cursor.continue();
	    }
	};
	req.onerror = function(e) {
	    console.error("cursor", e);
	};
    }, cb);
}

function loadSessionSettings() {
    if (!sessionTx)
	return;

    sessionTx("readonly", 'settings', function(objectStore) {
	var req1 = objectStore.get("upShaperRate");
	req1.onsuccess = function() {
	    if (typeof req1.result === 'number')
		upShaperRate.rate = req1.result;
	};

	var req2 = objectStore.get("downShaperRate");
	req2.onsuccess = function() {
	    if (typeof req2.result === 'number')
		downShaperRate.rate = req2.result;
	};
    });
}

/* Called when changing shapers */
function saveSessionSettings() {
    if (!sessionTx)
	return;

    sessionTx("readwrite", 'settings', function(objectStore) {
	objectStore.put(upShaperRate.rate, "upShaperRate");
	objectStore.put(downShaperRate.rate, "downShaperRate");
    });
}

openSession(function(db) {
    sessionTx = function(mode, storeName, cb, finalCb) {
	var tx = db.transaction([storeName], mode);
	tx.onerror = function(e) {
	    console.error("store tx", e);
	    if (finalCb)
		finalCb(e);
	};
	tx.oncomplete = function() {
	    if (finalCb)
		finalCb();
	};
	cb(tx.objectStore(storeName));
    };

    loadSessionSettings();
    restoreSession(function() {
	/* reclaim storage */
	reclaimStorage(torrents.map(function(torrent) {
	    return torrent.infoHash;
	}), function(totalReclaimed) {
	    console.log("Reclaimed", totalReclaimed, "bytes of stale data");
	});
    });
});


/* Peer listener */
var peerPort;

tryCreateTCPServer(6881, function(sock) {
    console.log("new peer server sock", sock);
    servePeer(sock, function(peer) {
	for(var i = 0; i < torrents.length; i++) {
	    if (bufferEq(peer.infoHash, torrents[i].infoHash))
		break;
	}
	if (i < torrents.length) {
	    torrents[i].peers.push(peer);
	    peer.torrent = torrents[i];
	} else {
	    console.error("incoming", peer.ip, "unknown torrent", peer.infoHash);
            peer.end();
	}
    });
}, function(err, port) {
    if (port)
	peerPort = port;
});
