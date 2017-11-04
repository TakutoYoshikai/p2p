let express = require("express");
let app = express();
let bodyParser = require("body-parser");
let request = require("request");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

function selectRandomValues(array, c) {
	let count = c;
	if (count > array.length) {
		count = array.length;
		return array;
	}
	let result = [];
	let src = array.filter(function(){ return true;});
	for (var i = 0; i < count; i++) {
		let rand = Math.floor(Math.random() * src.length);
		result.push(src[rand]);
		src.splice(rand, 1);
	}
	result.sort();
	return result;
}

function half(array) {
	let rand = Math.floor(Math.random() * 2);
	return array.filter(function(value, index) {
		return index % 2 == rand;
	});
}

function onlyUnique(value, index, self) { 
	return self.indexOf(value) == index;
}

class P2P {
	init(port) {
		this.peers = [];
		this.port = port;
		this.url = "http://localhost:" + port;
		this.data = null;
	}
	constructor(port) {
		this.init(port);
		this.setupServer();
	}

	setupServer() {
		let self = this;
		app.get("/peers", function(req, res) {
			if (self.peers.length == 0) {
				res.status(404).send();
				return;
			}
			let count = parseInt(req.query.count);
			if (self.peers.length < count) {
				count = self.peers.length;
			}
			res.status(200).json({
				peers: selectRandomValues(self.peers, count)
			});
		});

		app.post("/peer", function(req, res) {
			console.log("post peer");
			let peer = req.body.peer;
			if (self.peers.indexOf(peer) == -1) {
				if (self.peers.length > 20) {
					self.peers = half(self.peers);
				}
				self.peers.push(peer);
				res.status(201).send();
				return;
			}
			res.status(406).send();
		});
		app.get("/data", function(req, res) {
			let data = req.query.data;
			if (self.data == null || self.data != data) {
				self.data = data;
				self.sendData(data);
				res.status(200).send();
				return;
			}
			//ここのステータスコードは適当
			res.status(400).send();
		});

		app.get("/getData", function(req, res) {
			res.status(200).send(self.data);
		});

	}

	sendData(data) {
		let self = this;
		self.peers.forEach(function(peer) {
			request.get({
				url: peer + "/data?data=" + data
			}, function(error, response, body) {
				if (!error && response.statusCode == 200) {
					console.log(self.port + "が " + peer + "に" + data + "を送りました");
				}
			});
		});
	}
	registerSelf(url) {
		let self = this;
		return new Promise(function(resolve, reject) {
			request.post({
				url: url + "/peer",
				json: true,
				headers: {  'Content-Type': 'application/json' },
				body: {
					peer: self.url
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
	getPeers(url, count) {
		let self = this;
		return new Promise(function(resolve, reject) {
			request.get({
				url: url + "/peers?count=" + count,
				json: true
			}, function(error, response, body) {
				if (!error && response.statusCode == 200) {
					let ps = body.peers.filter(function(peer) {
						if (peer == self.url) {
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
	joinNetwork() {
		let defaultUrl = "http://localhost:8000";
		let self = this;
		self.getPeers(defaultUrl, 3)
			.then(function(peers) {
				self.peers = self.peers.concat(peers);
				self.peers = self.peers.filter(onlyUnique);
				peers.forEach(function(peer) {
					self.registerSelf(peer);
					self.getPeers(peer, 3)
						.then(function(peers) {
							self.peers = self.peers.concat(peers);
							self.peers = self.peers.filter(onlyUnique);
							peers.forEach(function(peer) {
								self.registerSelf(peer);
							});
						});
				});
			})
		self.registerSelf(defaultUrl)
			.then(function() {
				self.peers.push(defaultUrl);
			});
	}
	registerSelf(url) {
		let self = this;
		return new Promise(function(resolve, reject) {
			request.post({
				url: url + "/peer",
				json: true,
				headers: {  'Content-Type': 'application/json' },
				body: {
					peer: self.url
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

	start() {
		let self = this;
		app.listen(self.port, function() {
			console.log("serverが起動しました");
			console.log("ポート: " + self.port);
		})
	}
}

let p2p = new P2P(parseInt(process.argv[2]));
p2p.start();

if (p2p.port != 8000) {
	p2p.joinNetwork();
}

