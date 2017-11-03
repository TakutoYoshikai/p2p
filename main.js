let express = require("express");
let app = express();
let bodyParser = require("body-parser");
let request = require("request");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
let peers = [];
let myPort = parseInt(process.argv[2]);
let myUrl = "http://localhost:" + myPort;
let myData = null;

let server = app.listen(myPort, function() {
	console.log("serverが起動しました");
	console.log("ポート: " + myPort);
});


function selectPeers(count) {
	let result = [];
	let src = peers.filter(function(){ return true;});
	for (var i = 0; i < count; i++) {
		let rand = Math.floor(Math.random() * src.length);
		result.push(src[rand]);
		src.splice(rand, 1);
	}
	result.sort();
	return result;
}

app.get("/peers", function(req, res) {
	if (peers.length == 0) {
		res.status(404).send();
		return;
	}
	let count = parseInt(req.query.count);
	if (peers.length < count) {
		count = peers.length;
	}
	res.status(200).json({
		peers: selectPeers(count)
	});
});

app.post("/peer", function(req, res) {
	let peer = req.body.peer;
	if (peers.indexOf(peer) == -1) {
		if (peers.length > 20) {
			peers = half(peers);
		}
		peers.push(peer);
		res.status(201).send();
		return;
	}
	res.status(406).send();
});

app.get("/data", function(req, res) {
	let data = req.query.data;
	if (myData == null || myData != data) {
		myData = data;
		sendData(data);
		res.status(200).send();
		return;
	}
	//ここのステータスコードは適当
	res.status(400).send();
});

app.get("/getData", function(req, res) {
	res.status(200).send(myData);
});

function sendData(data) {
	peers.forEach(function(peer) {
		request.get({
			url: peer + "/data?data=" + data
		}, function(error, response, body) {
			if (!error && response.statusCode == 200) {
				console.log(myUrl + "が " + peer + "に" + data + "を送りました");
			}
		});
	});
}

function getPeers(url, count) {
	return new Promise(function(resolve, reject) {
		request.get({
			url: url + "/peers?count=" + count,
			json: true
		}, function(error, response, body) {
			if (!error && response.statusCode == 200) {
				let ps = body.peers.filter(function(peer) {
					if (peer == myUrl) {
						return false;
					}
					return true;
				});
				if (ps.length == 0) {
					reject();
					return;
				}
				resolve(ps);
				return;
			}
			reject();
		});
	});
}

function registerSelf(url) {
	return new Promise(function(resolve, reject) {
		request.post({
			url: url + "/peer",
			json: true,
			headers: {  'Content-Type': 'application/json' },
			body: {
				peer: myUrl
			}
		}, function(error, response, body) {
			if (!error && response.statusCode == 201) {
				resolve();
				return;
			}
			reject();
		});
	});
}
function onlyUnique(value, index, self) { 
	return self.indexOf(value) == index;
}

function half(array) {
	let rand = Math.floor(Math.random() * 2);
	return array.filter(function(value, index) {
		return index % 2 == rand;
	});
}


function joinNetwork() {
	let url = "http://localhost:8000";
	getPeers(url, 3)
	.then(function(ps) {
		peers = peers.concat(ps);
		peers = peers.filter(onlyUnique);
		ps.forEach(function(peer) {
			registerSelf(peer);
			getPeers(peer, 3)
				.then(function(ps) {
					peers = peers.concat(ps);
					peers = peers.filter(onlyUnique);
					ps.forEach(function(peer) {
						registerSelf(peer);
					});
				});
		});
	})
	registerSelf(url)
	.then(function() {
		peers.push(url);
	});
}

if (myPort != 8000) {
	joinNetwork();
}

