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

/// Returns cached data.
DataSource.prototype.getDataFromCache = function(interval, mode) {
	console.log('filtering', mode, 'data in', interval+'...');
	var data = this.data[mode];
	var start = (new Date(interval[0])).toISOString()
	   ,end = (new Date(interval[1])).toISOString();
	return data.filter(function(d) {
		return d.time_start >= start && d.time_end <= end;
	});
}

/// Gets data from the server, inserts it into the cache and calls the callback.
DataSource.prototype.queryDataFromServer = function(interval, mode, callback) {
	var url = 'http://localhost:3000/api/trades/'+this.ex+'/'+this.pair;
	url += "?limit=1000&group_by="+mode+"&time="+interval[0]+"&time_end="+interval[1];
	console.log('requesting data from server:', url);
	var self = this;
	d3.json(url, function(d) {
		self.insertData(d, mode);
		self.loaded_ivs[mode].insert(interval);
		callback();
	});
}

DataSource.prototype.insertData = function(new_data, mode) {
	if (!new_data || new_data.length === 0) {
		console.log('got empty data');
		return;
	}
	var nd0 = new_data[0];
	var data = this.data[mode];
	var idx = 0;
	for (var i=0; i<data.length; i++) {
		if (data[i].time_end <= nd0.time_start) break;
		idx++;
	}
	console.log( 'inserting', new_data.length
		         , 'data element into the', mode, 'data at index', idx);
	this.data[mode] = data.slice(0, idx).concat(new_data).concat(data.slice(idx));
	//this.loaded_ivs[mode].insert([ new_data[0].time_start
	//	                           , new_data[new_data.length-1].time_end]);
}

function PlotData(options) {
	options = options || {};
	this.label = options.label || '???';
	this.sources = options.sources || []; /// [{active: bool, pair: source}, ...]
	this.mode = options.mode || 'vwap';
	this.group_by = options.group_by || '1min';
}

//PlotData.prototype.load()

function getPlotData() {
	return [
		new PlotData({label: 'USD / BTC', sources:
			[ { source: new DataSource('bitfinex/btcusd'), active: true }
		  , { source: new DataSource('btce/btc_usd'), active: true }]})
	, new PlotData({label: 'BTC / LTC', sources:
			[ { source: new DataSource('btce/btc_ltc'), active: true }]})
	];
}

/// Pass ex, pair and querystring options in options.
function loadData(options, user_data, callback) {
	var url = 'http://localhost:3000/api/trades/'+options.ex+'/'+options.pair;
	var qs = [];
	for (var key in options) {
		if (key !== 'ex' && key !== 'pair') qs.push(key+'='+options[key]);
	}
	qs.push('limit=1000');
	if (qs.length > 0) url += '?' + qs.join('&');
	console.log(url);
	d3.json(url, function(d) { callback(d, user_data) });
}