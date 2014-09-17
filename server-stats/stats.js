var mongoose = require('mongoose');
var DB = require('./db');
var Promise = require('bluebird');

//var exchange = 'btce';
//var pair = 'btc_usd';

DB.onReady(init);


/** TODO:

To make the updating efficient, we need to do the following:

- for each interval, get the last data point (has time_start or timestamp T)
- get all intervals / trades of the representation with one level lower
  granularity from floor(T, interval)
- calculate & update based on the retrieved data

*/


// TODO:
// for old trade data, do this day-wise:
//
//   * for each day, get all trades, then calculate these minute intervals:
//   * 1, 5, 30, 240 (4 hours), 1440 (1 day) and save them to a database
//   * we should use the existing smaller intervals to calculate the bigger ones
//
// for new trade data, build the groups as soon as they are complete
// (minute blocks every minute, 5 min blocks every 5 minutes, etc.)

function init() {
	var exchanges = DB.getExchanges();
	exchanges.forEach(function(ex) {
		var pairs = DB.getPairsForExchange(ex);
		pairs.forEach(function(pair) {
			if (ex !== 'bitfinex' || pair !== 'btcusd') return;
			var model = DB.getModel(ex, pair);
			var model_iv = DB.getIntervalModel(ex, pair);

			console.log(ex, pair);
			var query = model_iv.find().where({interval: 1})
			        .sort({time_start: -1}).limit(1).exec();
			query.then(function(last_iv) {
				var query2 = model.find();
			  if (last_iv.length > 0) {
			  	var t0 = last_iv[0].time_start;
			  	t0.setHours(0);
					t0.setMinutes(0);
					t0.setSeconds(0);
					t0.setMilliseconds(0);
			  	query2.where('timestamp').gte(t0);
			  }
			  return query2.sort('timestamp').exec();
			})
			.then(function(trades) {
				console.log(trades.length);
				compute(ex, pair, trades);
			})
		  .then(null, console.error);
		});
	});
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

function compute(ex, pair, data) {
	//if (ex !== 'bitfinex' || pair !== 'btcusd') return;
	console.log(ex, pair, data.length);
	if (data.length === 0) return;
	var day = data[0].timestamp;
	day.setHours(0);
	day.setMinutes(0);
	day.setSeconds(0);
	day.setMilliseconds(0);
	//DB.dropIntervalCollection(ex, pair);
	var model = DB.getIntervalModel(ex, pair);
	var create_and_save = create_and_save_fn(model, pair);
	var ints = [1, 5, 30, 240, 1440];
	var src_data_sets = [data];
	var grouped_data, src_data;
	for (var i=0; i<ints.length; i++) {
		var max_count = (data[data.length-1].timestamp-data[0].timestamp)/ints[i]/1000/60;
		console.log('max number of intervals: ', max_count);
		// var idx = 0;
		// while ( idx < src_data_sets.length-1
		//      && src_data_sets[idx+1].length > 30 * max_count) idx++;
		src_data = src_data_sets[i];
		console.log('computing', ints[i] + '-minute intervals based on', src_data.length
			         ,(i === 0 ? 'trades' : ints[i-1] + '-minute intervals'));
		grouped_data = calc_intervals(ints[i], src_data, day);
		src_data_sets.push(grouped_data);
		console.log('saving', grouped_data.length, ints[i] + '-minute intervals');
		//console.log(grouped_data);
		grouped_data.forEach(create_and_save);
	}
}

function order_by_vwap(a, b) {
	return a.vwap - b.vwap;
}
function order_by_price(a, b) {
	return a.price - b.price;
}
function sum(a, b) {
	return a+b;
}

function group_data(data) {
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

	iv.price_start = data[0][iv_mode ? 'price_start' : 'price'];
  iv.price_end = data[N-1][iv_mode ? 'price_end' : 'price'];

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
function calc_intervals(interval_in_min, data, time_start) {
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
		if (ttime-iv_t0 < 0) i++; // ignore trade before start_time
		else if (ttime-iv_t0 >= 0 && ttime-iv_t1 < 0) { // trade in current interval
			if (idx0 === -1) idx0 = i;
			count++;
			i++;
		}
		if (ttime-iv_t1 >= 0 || i===data.length) { // trade after current interval
			if (count > 0) {
				var iv = group_data(data.slice(idx0, idx0+count));

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