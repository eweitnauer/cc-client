// Copyright Erik Weitnauer, 2014.
// ../node_modules/.bin/uglifyjs -m 'toplevel' -r 'require,exports' -c --screw-ie8 stats.js -o stats.min.js --preamble '// Copyright Erik Weitnauer 2014.'

var mongoose = require('mongoose');
var DB = require('./db');
var Promise = require('bluebird');

DB.onReady(init);

var ex_pairs = []; // array of {ex: ..., pair: ..., t0: {1, 5, 30, 240, 1440}}
var ilens = [1, 5, 30, 240, 1440];
var limit_trades_per_cycle = 50000;
var unfinished_ex_pairs = []; // do the 1-min & 5-min trade retrieval with a limit
                              // if not finished, put them into this array and iterate

function init() {
	ex_pairs = getExchangePairCombinations();
	init_t0s()
	.then(updateIntervals);
}

/// Returns a promise.
/// t0.x is the time_start of last x-minutes interval
function init_t0s() {
	var queries = [];
	var set_t0 = function(t0, len) {
		return function(data) {
			if (data.length === 1) t0[len] = data[0].time_start;
		}
	}
  ex_pairs.forEach(function(ex_pair) {
  	//DB.dropIntervalCollection(ex_pair.ex, ex_pair.pair);
  	var model_iv = DB.getIntervalModel(ex_pair.ex, ex_pair.pair);
  	for (var len in ex_pair.t0) {
  		var query = model_iv.find()
  		  .where({interval: len})
  		  .sort({time_start: -1})
  		  .limit(1)
  		  .exec()
  		  .then(set_t0(ex_pair.t0, len));
  		queries.push(query);
  	}
  });
  return Promise.all(queries);
}

function updateIntervals() {
	var t0 = Date.now();
	unfinished_ex_pairs = [];
	updateIntervalsFromTrades()
	.then(updateIntervalsFromIntervals)
	.then(function() {
		var t1 = Date.now();
		console.log('['+(new Date()).toISOString()+'] update done for all intervals, which took', ((t1-t0)/1000).toFixed(3), 'seconds');
		console.log('scheduling next update 30 seconds from now')
		setTimeout(updateIntervals, unfinished_ex_pairs.length > 0 ? 0 : 30000);
	}, console.error);
}

/// Returns a promise.
function updateIntervalsFromTrades() {
	var queries = [];
	var call_calc_ints = function(ex_pair) {
		return function(data) {
			console.log('calculating the 1 and 5 min intervals for', ex_pair.ex
						 , ex_pair.pair, 'based on', data.length, 'trades...');
			if (data.length === limit_trades_per_cycle) unfinished_ex_pairs.push(ex_pair);
			return Promise.all(
				[ calcAndSaveIntervals(ex_pair, 1, data)
				, calcAndSaveIntervals(ex_pair, 5, data)]
			)};
	};

	(unfinished_ex_pairs.length > 0 ? unfinished_ex_pairs : ex_pairs)
	.forEach(function(ex_pair) {
		//if (ex_pair.ex !== 'btce' || ex_pair.pair !== 'btc_usd') return;
		var model = DB.getModel(ex_pair.ex, ex_pair.pair);
		var query = model.find();
		var t0_min = Math.min(ex_pair.t0[1], ex_pair.t0[5]);
		if (t0_min) query.where('timestamp').gte(t0_min);
		query = query.sort('timestamp')
			.limit(limit_trades_per_cycle)
		  .exec()
		  .then(call_calc_ints(ex_pair));
		queries.push(query);
	});
	return Promise.all(queries);
}

/// Returns a promise.
function updateIntervalsFromIntervals() {
	if (unfinished_ex_pairs.length > 0) return;
	var queries = [];
	var call_calc_ints = function(ex_pair) {
		return function(data) {
			console.log('calculating the 30, 240 and 1440 min intervals for', ex_pair.ex
						 , ex_pair.pair, 'based on', data.length, '1-min intervals...');
			return Promise.all(
				[ calcAndSaveIntervals(ex_pair, 30, data)
				, calcAndSaveIntervals(ex_pair, 240, data)
				, calcAndSaveIntervals(ex_pair, 1440, data)]
			)};
	}
	ex_pairs.forEach(function(ex_pair) {
		//if (ex_pair.ex !== 'btce' || ex_pair.pair !== 'btc_usd') return;
		var model = DB.getIntervalModel(ex_pair.ex, ex_pair.pair);
		var query = model.find().where({interval: 1});
		var t0_min = Math.min(ex_pair.t0[30], ex_pair.t0[240], ex_pair.t0[1440]);
		if (t0_min) query.where('time_start').gte(t0_min);
		query = query.sort('time_start')
		  .exec()
		  .then(call_calc_ints(ex_pair), console.error);
		queries.push(query);
	});
	return Promise.all(queries);
}

/// data can be an array of trades or intervals.
function calcAndSaveIntervals(ex_pair, len, data) {
	if (data.length === 0) {
		console.log('no data for', len);
		return;
	}
	var model_iv = DB.getIntervalModel(ex_pair.ex, ex_pair.pair);
	var time_field = 'time_start' in data[0] ? 'time_start' : 'timestamp';

	var t0 = ex_pair.t0[len] || data[0][time_field];
	floorTime(t0, len);

	var intervals = calcIntervals(len, data, t0);
	console.log('upserting', intervals.length, len + '-min intervals');
	var queries = [];
	intervals.forEach(function(iv) {
		var query = model_iv.findOneAndUpdate({ time_start: iv.time_start, interval: iv.interval }
		 	                          , iv, { upsert: true });
		queries.push(query.exec());
	});
	return Promise.all(queries).then(function() {
		//console.log('setting t0 for', len, 'from', ex_pair.t0[len], 'to', intervals[intervals.length-1].time_start);
		ex_pair.t0[len] = intervals[intervals.length-1].time_start;
	});
}

function floorTime(t, len) {
	t.setMilliseconds(0);
	t.setSeconds(0);
	if (len === 1) return t;
	if (len === 5) {
		t.setMinutes(Math.floor(t.getMinutes()/5)*5);
	} else if (len === 30) {
		t.setMinutes(Math.floor(t.getMinutes()/30)*30);
	} else if (len === 240) {
		t.setMinutes(0);
		t.setHours(Math.floor(t.getHours()/4)*4);
	} else {
		t.setMinutes(0);
		t.setHours(0);
	}
	return t;
}

function log_fn(err, res) {
	if (err) console.error(err);
}

function create_and_save_fn(model, pair) {
	return function(iv) {
		iv.currency_pair = pair;
		//(new model(iv)).save(log_fn);
		model.findOneAndUpdate({ time_start: iv.time_start, interval: iv.interval }
			, iv
			, { upsert: true }
			, log_fn );
	}
}

function order_by_vwap(a, b) {
	return a.vwap - b.vwap;
}
function order_by_price(a, b) {
	return a.price - b.price;
}

function calcSingleInterval(data) {
	var iv = { volume: 0
		       , trades: 0
		       , price_min: Infinity
		       , price_max: -Infinity
		       , price_start: null
		       , price_end: null
		       , vwap: 0
		       , vwq25: null
		       , vwq75: null
		       };
  var vol = 0
    , iv_mode // are we grouping intervals? (vs. individual trades)
    , N = data.length;
  if (N > 0) {
  	iv_mode = ('volume' in data[0]);
    for (var i=0; i<data.length; i++) {
    	vol += (iv_mode ? data[i].volume : data[i].amount);
    }
  }
  if (N === 0 || vol === 0) {
  	iv.price_min = null;
  	iv.price_max = null;
  	iv.vwap = null;
  	return iv;
  }

  if (iv_mode) {
		iv.price_start = data[0].price_start;
		iv.price_end = data[N-1].price_end;
	} else {
		iv.price_start = data[0].price;
		iv.price_end = data[N-1].price;
		var id = data[0].id;
		for (var i=1; i<N; i++) {
	 		if (data[i].timestamp > data[0].timestamp) break;
	 		if (data[i].id < id) {
	 			id = data[i].id;
	 			iv.price_start = data[i].price;
	 		}
		}
		id = data[N-1].id;
		for (var i=N-2; i>0; i--) {
		  if (data[i].timestamp < data[N-1].timestamp) break;
		  if (data[i].id > id) {
		  	id = data[i].id;
		  	iv.price_end = data[i].price;
		  }
		}
	}

  iv.volume = vol;
	data.sort(iv_mode ? order_by_vwap : order_by_price);
	var qs = [0.25*vol, 0.75*vol], qs_res = [];
	vol = 0;

  for (var i=0; i<N; i++) {
  	var d = data[i];
  	vol += iv_mode ? d.volume : d.amount;
  	while (qs.length > 0 && vol >= qs[0]) {
  		qs.shift();
  		qs_res.push(iv_mode ? d.vwap : d.price);
  	}
  	if (iv_mode) {
  		if (iv.price_min > d.price_min) iv.price_min = d.price_min;
  		if (iv.price_max < d.price_max) iv.price_max = d.price_max;
  		if (d.vwap !== null) iv.vwap += d.vwap * d.volume;
  	  iv.trades += d.trades;
  	} else {
  		if (iv.price_min > d.price) iv.price_min = d.price;
  		if (iv.price_max < d.price) iv.price_max = d.price;
  		iv.vwap += d.amount * d.price;
  		iv.trades++;
  	}
  }

  iv.vwap /= iv.volume;
  iv.vwq25 = qs_res[0];
  iv.vwq75 = qs_res[1];
  if (iv.price_min === Infinity) iv.price_min = null;
  if (iv.price_max === Infinity) iv.price_max = null;
  return iv;
}

/// Interval is in minutes (1, 5, 30, 240 (4 hours), 1440 (1 day))
/// data can be an array of trades or intervals
function calcIntervals(interval_in_min, data, time_start) {
	var ivs = [];
	if (data.length === 0) return ivs;

	var interval = interval_in_min * 60000
	  , iv_t0 = time_start.valueOf()
	  , iv_t1 = time_start.valueOf() + interval
    , idx0=-1, count = 0
    , i=0
    , is_trades = 'timestamp' in data[0];

	do {
		var ttime = is_trades ? data[i].timestamp.valueOf()
		                      : data[i].time_start.valueOf();
		if (ttime-iv_t0 < 0) i++; // ignore trade before time_start
		else if (ttime-iv_t0 >= 0 && ttime-iv_t1 < 0) { // trade in current interval
			if (idx0 === -1) idx0 = i;
			count++;
			i++;
		}
		if (ttime-iv_t1 >= 0 || i===data.length) { // trade after current interval
			if (count > 0) {
				var iv = calcSingleInterval(data.slice(idx0, idx0+count));

					//is_trades ? group_trades(data, idx0, count)
			  	//                 : group_intervals(data, idx0, count);
				iv.time_start = new Date(iv_t0);
				iv.time_end = new Date(iv_t1);
				iv.interval = interval_in_min;
				if (iv.trades > 0 && iv.volume > 0) ivs.push(iv);
			}
			idx0 = -1;
			count = 0;
			iv_t0 += interval;
			iv_t1 += interval;
		}
	} while (i < data.length);

	return ivs;
}

function getExchangePairCombinations() {
	var combs = [];
	var exchanges = DB.getExchanges();
	exchanges.forEach(function(ex) {
		var pairs = DB.getPairsForExchange(ex);
		combs = combs.concat(pairs.map(function(pair) {
			return {ex: ex, pair: pair, t0: {1: 0, 5: 0, 30: 0, 240: 0, 1440: 0}}
		}));
	});
	return combs;
}
