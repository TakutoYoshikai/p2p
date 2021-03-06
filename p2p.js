let express = require("express");
let app = express();
let bodyParser = require("body-parser");
let request = require("request");
let multer = require("multer");
let multiparty = require("multiparty");
let fs = require("fs");
let restler = require("restler");
let exec = require("child_process").exec;
let myPort = 8000;
if (process.argv.length == 3) {
	myPort = parseInt(process.argv[2]);
}
let distributedFileName = [];
let storage = multer.diskStorage({
	destination: function (req, file, cb) {
		cb(null, "./files");
	},
	filename: function(req, file, cb) {
		cb(null, file.originalname);
	},
});
let upload = multer({ storage: storage,
	fileFilter: function(req, file, cb) {
		if (distributedFileName.indexOf(file.originalname) == -1) {
			cb(null, true);
		}
		return cb(null, false);
	}
}).single("file");

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
	init(host, port) {
		this.peers = [];
		this.watchers = [];
		this.port = port;
		this.url = "http://" + host + ":" + port;
		this.data = null;
	}
	constructor(host, port) {
		this.init(host, port);
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

		app.post("/watch", function(req, res) {
			let watcherUrl = req.body.watcher;
			let targetWatchers = self.watchers.filter(function(watcher) {
				if (watcher.address == watcherUrl) {
					return true;
				}
				return false;
			});
			if (targetWatchers.length == 0) {
				if (self.watchers.length >= 10) {
					let removed = selectRandomValues(self.watchers, 1)[0].address;
					self.release(removed);
					self.removeWatcher(removed);
				}
				self.appendWatcher(watcherUrl);
			} else {
				targetWatchers[0].timelimit = 20;
			}
			res.status(200).send();
		});

		app.post("/release", function(req, res) {
			console.log("release");
			let target = req.body.me;
			let index = self.peers.indexOf(target);
			if (index == -1) {
				res.status(400).send();
				return;
			}
			self.peers.splice(index, 1);
			if (self.peers.length > 0 && self.peers.length < 5) {
				self.getPeers(selectRandomValues(self.peers, 1)[0], 5)
					.then(function(peers) {
						peers.forEach(function(peer) {
							self.appendPeer(peer);
						});
					});
			}
			res.status(200).send();
		});

		app.get("/getData", function(req, res) {
			res.status(200).send(self.data);
		});

		app.post("/file", function(req, res) {
			//TODO ここのレスポンスは後で直す
			upload(req, res, function(err) {
				if (err || req.file == null) {
					res.status(400).send();
					return;
				}
				distributedFileName.push(req.file.originalname);
				setTimeout(function(){
					self.broadcastFile(req.file.originalname, self.peers);
				}, 1000);
				console.log(self.port + "がファイルを保存しました");
				res.status(200).send();
			});
		});
	}

	removePeer(target) {
		let self = this;
		this.peers = this.peers.filter(function(peer) {
			if (target == peer) {
				return false;
			}
			return true;
		});
		if (self.peers.length > 0 && self.peers.length < 5) {
			self.getPeers(selectRandomValues(self.peers, 1)[0], 5)
				.then(function(peers) {
					peers.forEach(function(peer) {
						self.appendPeer(peer);
					});
				});
		}
	}

	sendData(data) {
		let self = this;
		self.peers.forEach(function(peer) {
			request.get({
				url: peer + "/data?data=" + data
			}, function(error, response, body) {
				if (!error && response.statusCode == 200) {
					console.log(self.url + "が " + peer + "に" + data + "を送りました");
				}
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
	//自分を見ているノードに自分の事を忘れさせる
	release(url) {
		console.log("call release");
		let self = this;
		return new Promise(function(resolve, reject) {
			request.post({
				url: url + "/release",
				json: true,
				headers: {"Content-Type": "application/json"},
				body: {
					me: self.url
				}
			}, function(error, response, body) {
				if (!error && response.statusCode == 200) {
					resolve();
					return;
				}
				reject();
			});
		});
	}

	appendPeer(peer) {
		if (this.peers.indexOf(peer) == -1) {
			this.peers.push(peer);
		}
	}
	joinNetwork() {
		let defaultUrl = "http://160.16.238.230:8000";
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
					self.appendWatcher(url);
					resolve();
					return;
				}
				reject();
			});
		});
	}
	broadcastFile(fileName) {
		let self = this;
		let path = "./files/" + fileName;
		fs.stat(path, function(err, stats) {
			let file = restler.file(path, null, stats.size, null, "text/plain");
			self.peers.forEach(function(peer) {
				restler.post(peer + "/file", {
					multipart: true,
					data: {
						"file": file
					}
				}).on("complete", function(data) {
				});
			});
		});
	}
	watch(url) {
		let self = this;
		return new Promise(function(resolve, reject) {
			request.post({
				url: url + "/watch",
				json: true,
				headers: {"Content-Type": "application/json"},
				body: {
					watcher: self.url
				}
			}, function(error, response, body) {
				if (!error && response.statusCode == 200) {
					resolve();
					return;
				}
				self.removePeer(url);
				reject();
			});
		});
	}
	appendWatcher(watcherAddress) {
		let self = this;
		let sameAddress = self.watchers.filter(function(watcher) {
			if (watcherAddress == watcher.address) {
				return true;
			}
			return false;
		});
		if (sameAddress.length == 0) {
			self.watchers.push({
				address: watcherAddress,
				timelimit: 20
			});
		}
	}
	removeWatcher(watcherAddress) {
		let self = this;
		self.watchers = self.watchers.filter(function(watcher) {
			if (watcher.address == watcherAddress) {
				return false;
			}
			return true;
		});
	}
	checkWatchers() {
		let self = this;
		self.watchers.forEach(function(watcher) {
			watcher.timelimit--;
			watcher.timelimit--;
			if (watcher.timelimit <= 0) {
				self.removeWatcher(watcher.address);
			}
		});
	}
	start() {
		let self = this;
		app.listen(self.port, function() {
			console.log("Peerが起動しました");
			console.log("ポート: " + self.port);
		});
		setInterval(function() {
			self.peers.forEach(function(peer) {
				self.watch(peer);
			});
		}, 10000);
		setInterval(function() {
			self.checkWatchers();
		}, 2000);
	}
}

exec('curl -s ifconfig.me', (err, stdout, stderr) => {
	if (err) { console.log(err); }
	let host = stdout.replace(/\n/g, "");
	let p2p = new P2P(host, myPort);
	p2p.start();

	if (host != "160.16.238.230") {
			p2p.joinNetwork();
	}
});
