let fs = require("fs");
let text = fs.readFileSync("log5.log").toString();

let strings = text.split(",");
let numbers = strings.map(function(str) {
	return parseInt(str);
});
let result = [];
for (var i = 0; i < 50; i++) {
	result.push(0);
}

numbers.forEach(function(number) {
	result[number] = result[number] + 1;
});

console.log("最高" + result.reduce(function(res, val) {
	if (res > val) {
		return val;
	}
	return res;
}, 100000));
console.log("最低" + result.reduce(function(res, val) {
	if (res < val) {
		return val;
	}
	return res;
}, 0));

let total = result.reduce(function(res, val) {
	return res + val;
}, 0);

let average = total / result.length;
let v = result.map(function(n) {
	return Math.pow(n - average, 2);
}).reduce(function(res, val) {
	return res + val;
}, 0) / result.length;

console.log("平均: " + average);
console.log("分散: " + v);
console.log("標準偏差: " + Math.sqrt(v));
