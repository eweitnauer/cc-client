/// An array of [t0, t1] pairs.
function IntervalList() {
	this.ivs = [];
}

if (typeof(exports) !== 'undefined') exports.IntervalList = IntervalList;

IntervalList.prototype.overlap = function(iv1, iv2) {
	return iv1[0] < iv2[1] && iv2[0] < iv1[1];
}

IntervalList.prototype.overlapOrTouch = function(iv1, iv2) {
	return iv1[0] <= iv2[1] && iv2[0] <= iv1[1];
}

IntervalList.prototype.getMissingIntervals = function(interval) {
	var res = [];
	var qiv = interval.slice();
	for (var i=0; i<this.ivs.length; i++) {
		var iv = this.ivs[i];
	  if (!this.overlap(iv, qiv)) {
	  	if (iv[0] > qiv[1]) break;
	  	else continue;
	  }
	  if (qiv[0] < iv[0]) res.push([qiv[0], iv[0]]);
	  qiv[0] = iv[1];
	}
	if (qiv[1] > qiv[0]) res.push(qiv);
	return res;
}

IntervalList.prototype.insert = function(ov) {
	var idx0 = -1, idx1 = -1, left = 0;
	for (var i=0; i<this.ivs.length; i++) {
		var iv = this.ivs[i];
		if (iv[1] < ov[0]) left++;
		if (this.overlapOrTouch(iv, ov)) {
			idx0 = (idx0 === -1 ? i : idx0);
			idx1 = i;
		} else {
			if (idx0 !== -1) break;
		}
	}
	var start = (idx0 === -1 ? ov[0] : Math.min(ov[0], this.ivs[idx0][0]))
	  , end = (idx1 === -1 ? ov[1] : Math.max(ov[1], this.ivs[idx1][1]));
	if (idx0 === -1) this.ivs.splice(left, 0, [start, end])
	else this.ivs.splice(idx0, idx1-idx0+1, [start, end]);
}
