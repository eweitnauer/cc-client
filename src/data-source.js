function DataSource(path) {
	var strs = path.split('/');
	this.ex = strs[0];
	this.pair = strs[1];
	this.loaded_ivs = { '1min': new IntervalList(), '5min': new IntervalList()
	                  , '30min': new IntervalList(), '4h': new IntervalList()
	                  , '1d': new IntervalList() };
	this.data = { '1min': [], '5min': [], '30min': [], '4h': [], '1d': []};
	this.loading = false; // true while requesting data from the db
	                      // use to avoid several concurrent requests
	this.bisect = d3.bisector(function(d) { return d.time_end }).right;
}

/// Call with, e.g. ([t0, t1], '1min', fn) to get fn called with an array of data.
/// Will request data from server if not cached locally yet.
DataSource.prototype.loadData = function(interval, mode, callback) {
	var ivs = this.loaded_ivs[mode].getMissingIntervals(interval);
	if (ivs.length === 0) callback(this.getDataFromCache(interval, mode));
	var count = ivs.length, self = this;
	var done = function() {
		count -= 1;
		if (count === 0) {
			self.loading = false;
			callback(self.getDataFromCache(interval, mode));
		}
	}
	this.loading = true;
	ivs.forEach(function(iv) { self.queryDataFromServer(iv, mode, done) });
}

/// Returns cached data. Also uses the callback if given.
DataSource.prototype.getDataFromCache = function(interval, mode, callback) {
	//console.log('filtering', this.ex, this.pair , mode, 'data in', interval+'...');
	var data = this.data[mode];
	var start = +(new Date(interval[0]))
	   ,end = +(new Date(interval[1]));
	var idx0 = this.bisect(data, start)
	   ,idx1 = this.bisect(data, end, idx0);
	var d = data.slice(idx0, idx1);
	if (callback) callback(d);
	return d;
}

/// Gets data from the server, inserts it into the cache and calls the callback.
DataSource.prototype.queryDataFromServer = function(interval, mode, callback) {
	var url = 'http://localhost:3000/api/trades/'+this.ex+'/'+this.pair;
	url += "?limit=200&group_by="+mode+"&time="+interval[0]+"&time_end="+interval[1];
	//console.log('requesting data from server:', url);
	var self = this;
	d3.json(url, function(d) {
		if (d.length === 200) {
			throw "more data on the server for this interval -- handle this!"; // FIXME
		} else {
			self.loaded_ivs[mode].insert(interval);
			console.log('got', d.length, 'data points from the server');
			if (!d || d.length === 0) {
				//console.log('got empty data for', url);
			} else {
				self.convertDates(d);
				self.insertData(d, mode);
			}
			callback();
		}
	});
}

DataSource.prototype.convertDates = function(data) {
	for (var i=0; i<data.length; i++) {
	  data[i].time_start = +(new Date(data[i].time_start));
	  data[i].time_end = +(new Date(data[i].time_end));
	}
}

DataSource.prototype.insertData = function(new_data, mode) {
	var nd0 = new_data[0];
	var data = this.data[mode];
	var idx = this.bisect(data, nd0.time_start);
	//console.log( 'inserting', new_data.length
	//	         , 'data element into the', mode, 'data at index', idx);
	this.data[mode] = data.slice(0, idx).concat(new_data).concat(data.slice(idx));
}

function PlotData(options) {
	options = options || {};
	this.label = options.label || '???';
	this.sources = options.sources || []; /// [{active: bool, pair: source}, ...]
	this.mode = options.mode || 'vwap';
	this.group_by = options.group_by || '1min';
}