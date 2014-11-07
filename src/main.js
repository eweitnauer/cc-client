CCClient = {};
CCClient.init = function(server_url) {
	var plots = [];

	var server_pairs = {}; // normalized pair names -> { ex, pair }

	queryExchanges(initializePlots);

	function queryExchanges(callback) {
		var url = server_url+'/api/trades/';
		d3.json(url, function(exchanges) {
			for (var exchange in exchanges) {
				var pairs = exchanges[exchange];
				for (var i=0; i<pairs.length; i++) {
					if (pairs[i] !== 'btc_usd') continue;
				  addServerPair(pairs[i], exchange);
				}
			}
			console.log(server_pairs);
			for (var key in server_pairs) {
				var plot = MainPlot().label(key);
				for (var i=0; i<server_pairs[key].length; i++) {
					var sp = server_pairs[key][i];
					plot.addDataSource(new DataSource(sp.ex+'/'+sp.pair, server_url), true);
				}
				plots.push(plot);
			}
			callback();
		});
	}

	function normalizePairName(pair) {
		var parts;
		if (pair.indexOf('_') === -1) {
			parts = [pair.substring(0,3), pair.substring(3)];
		} else parts = pair.split('_');
		return parts[0].toUpperCase() + " / " + parts[1].toUpperCase();
	}

	function normalizePairNameSwapped(pair) {
		var parts = normalizePairName(pair).split(' / ');
		return parts[1] + ' / ' + parts[0];
	}

	addServerPair = function(pair, ex) {
		var name = normalizePairName(pair);
		var sname = normalizePairNameSwapped(pair);
		var pair_name;
		if ((name in server_pairs) || !(sname in server_pairs)) pair_name = name;
		else pair_name = sname;
		server_pairs[pair_name] = server_pairs[pair_name] || [];
		server_pairs[pair_name].push({ex: ex, pair: pair});
	}

	function initializePlots() {
		var els = d3.select('body').selectAll("div.plot")
		   					 .data(plots);
		var row = els.enter()
		   .append('div')
		   .classed('plot', true)
		   .each(function(d) { d(this) });

		setInterval(update, 60000);
	}

	function update() {
		plots.forEach(function(plot) { plot.update() });
	}
}
