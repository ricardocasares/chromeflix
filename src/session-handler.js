
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