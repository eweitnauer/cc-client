CCClient = {};
CCClient.init = function(server_url) {
	plots = [];

	pair2source = {}; // normalized currency pair names -> [DataSource]
	pair_sources = []; // [{pair_name: string, sources: [DataSource]}]

	queryExchanges(initializePlots);

	function queryExchanges(callback) {
		var url = server_url+'/api/trades/';
		d3.json(url, function(exchanges) {
			for (var exchange in exchanges) {
				var pairs = exchanges[exchange];
				for (var i=0; i<pairs.length; i++) {
					//if (pairs[i] !== 'btc_usd') continue;
				  addServerPair(pairs[i], exchange);
				}
			}

			for (var name in pair2source) {
				var sources = pair2source[name].map(function(pair_ex) {
					return new DataSource(pair_ex.ex+'/'+pair_ex.pair, server_url);
				});
				pair_sources.push({sources: sources, name: name});
			}
			sortPairSources(function() {
				plots.push(MainPlot().pairSources(pair_sources));
				callback();
			});
		});
	}

	function sortPairSources(callback) {
		var N = 0;
		pair_sources.forEach(function(pair_source) { N += pair_source.sources.length });

		function collectResults(pair_sources, ds, count) {
			if (pair_sources.tradesCount) pair_sources.tradesCount += count;
			else pair_sources.tradesCount = count;
			if (--N === 0) {
				pair_sources.sort(function(p1, p2) { return p2.tradesCount - p1.tradesCount });
				callback();
			}
		}

		pair_sources.forEach(function(pair_source) {
			pair_source.sources.forEach(function(ds) {
			  ds.queryTradeCountFromServer(function(count) {
			  	collectResults(pair_sources, ds, count);
			  });
			});
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
		if ((name in pair2source) || !(sname in pair2source)) pair_name = name;
		else pair_name = sname;
		pair2source[pair_name] = pair2source[pair_name] || [];
		pair2source[pair_name].push({ex: ex, pair: pair});
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
