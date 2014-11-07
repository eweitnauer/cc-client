var uid = (function() {
  var b32 = 0x100000000, f = 0xf, b = []
      str = ['0','1','2','3','4','5','6','7','8','9','a','b','c','d','e','f'];
  function uid() {
    var i = 0;
    var r = Math.random()*b32;
    b[i++] = str[r & f];
    b[i++] = str[r>>>4 & f];
    b[i++] = str[r>>>8 & f];
    b[i++] = str[r>>>12 & f];
    b[i++] = str[r>>>16 & f];
    b[i++] = str[r>>>20 & f];
    b[i++] = str[r>>>24 & f];
    b[i++] = str[r>>>28 & f];
    r = Math.random()*b32;
    b[i++] = str[r & f];
    b[i++] = str[r>>>4 & f];
    b[i++] = str[r>>>8 & f];
    b[i++] = str[r>>>12 & f];
    b[i++] = str[r>>>16 & f];
    b[i++] = str[r>>>20 & f];
    b[i++] = str[r>>>24 & f];
    b[i++] = str[r>>>28 & f];
    return "_" + b.join("");
  };
  return uid;
})();
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
function DataSource(path, server_url) {
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
	this.server_url = server_url || 'http://localhost:3000';
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
	var limit = 200;
	var url = this.server_url + '/api/trades/'+this.ex+'/'+this.pair;
	url += "?limit="+limit+"&group_by="+mode+"&time="+interval[0]+"&time_end="+interval[1];
	var self = this;
	console.log('query from server:', interval);
	d3.json(url, function(d) {
		console.log('got', (d && d.length), 'data points from the server');
		if (!d || d.length === 0) {
			callback();
			return;
		}
		self.convertDates(d);
		d.sort(function(a,b) {return -b.time_start+a.time_start});
		self.insertData(d, mode);
		if (d.length === limit) {
			console.info("more data on the server for this interval...");
			self.loaded_ivs[mode].insert([d[0].time_start, interval[1]]);
			self.queryDataFromServer([interval[0], d[0].time_start], mode, callback);
		} else {
			self.loaded_ivs[mode].insert(interval);
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
var VolumePlot = function() {
  var y // y-scale
    , last_dom // for vwap-animation: keep track of the last domain before changing the y-domain
    , x // x-scale
    , id = uid()
    , width = 100
    , height = 100
    //, xAxis
    //, xAxisEl
    , yAxis
    , yAxisEl
    , container
    , content_el
    , clip_rect
    , data_margin = 0.25 // percentage of data point width used as margin
    , color_scale = d3.scale.category10() // id->color
    , data_layers // [{id, data}]
    , initialized = false
    , bisect_end = d3.bisector(function(d) { return d.time_end }).right
    , bisect_start = d3.bisector(function(d) { return d.time_start }).right
    , vis_type = 'volume' // can be 'volume', 'vwap', 'candles'
    , vwap_line; // d3.svg.line

  var plot = function(_container) {
    container = _container;
    plot.init();
    return this;
  }

  plot.x_scale = function(arg) {
    if (arguments.length === 0) return x;
    x = arg;
    if (initialized) plot.update_x(0);
    return this;
  }

  plot.color = function(arg) {
    if (arguments.length === 0) return color_scale;
    color_scale = arg;
    if (initialized) plot.update_x(0);
    return this;
  }

  plot.size = function(arg) {
    if (arguments.length === 0) return [width, height];
    width = arg[0];
    height = arg[1];
    if (initialized) {
      y.range([height, 0]);
      plot.update(0);
      clip_rect.attr({width: width, height: height});
      yAxisEl.attr("transform", "translate("+ width+",0)");
    }
    return this;
  }

  plot.vis_type = function(arg) {
    if (arguments.length === 0) return vis_type;
    vis_type = arg;
    if (initialized) plot.clear();
    return this;
  }

  plot.data_layers = function(arg, duration) {
    if (arguments.length === 0) return data_layers;
    data_layers = arg;
    if (initialized) plot.update(duration);
    return this;
  }

  plot.init = function() {
    initialized = true;

    y = d3.scale.linear()
          .range([height, 0])
          .domain([0, 0]);

    clip_rect = container.append("clipPath").attr("id", "clip_"+id)
      .append("rect")
      .attr({width: width, height: height});

    // xAxis = d3.svg.axis()
    //   .scale(x)
    //   .orient("top")
    //   .outerTickSize(0)
    //   .tickPadding(10);

    // xAxisEl = container.append("g")
    //   .attr("class", "x axis")
    //   .attr("transform", "translate(0,0)");

    yAxis = d3.svg.axis()
      .scale(y)
      .ticks(Math.round(height/20))
      .tickSize(height > 100 ? -width : 0)
      .outerTickSize(0)
      .orient("right");

    yAxisEl = container.append("g")
      .attr("class", "y axis")
      .attr("transform", "translate("+ width+",0)");

    container.append('rect')
      .attr('width', width)
      .attr('height', height)
      .classed('border', true);

    content_el = container.append('g')
      .attr('clip-path', 'url(#clip_'+id+')')
      .append('g');
  }

  plot.update = function(duration) {
    duration = duration || 0;
    plot.update_x_axis(duration);
    plot.scale_y_axis(duration);
    var gs = content_el.selectAll('.layer')
      .data(data_layers, function(layer) { return layer.id });

    gs.enter().append('g').classed('layer', true);
    gs.exit().remove();
    gs.each(function(layer) {
      var g = d3.select(this);
      plot.update_layer(g, layer, duration);
    });
  }

  plot.update_layer = function(container, layer, duration) {
    if (vis_type === 'volume') plot.update_volume_layer(container, layer, duration);
    if (vis_type === 'candles') plot.update_candles_layer(container, layer, duration);
    if (vis_type === 'vwap') plot.update_vwap_layer(container, layer, duration);
  }

  plot.update_volume_layer = function(container, layer, duration) {
    // and create & update the box charts
    var color = color_scale(layer.id);
    var box = container.selectAll(".box");
    box = box.data(layer.data, function(d) { return d._id });

    var w, mar;
    if (layer.data.length > 0) w = x(layer.data[0].time_end) - x(layer.data[0].time_start);
    mar = w*data_margin/2;
    w = w-2*mar;

    var enter = box.enter().append("g")
        .attr("class", "box")
        .attr("transform", function(d) { return "translate(" + x(d.time_start) + ",0)" })
        .style('opacity', 0.00001);
    enter.append("rect")
        .attr("x", mar)
        .attr("width", w)
        .attr("y", function (d) { return y(d.volume) })
        .attr("height", function (d) { return y(0)-y(d.volume) })
        .style('stroke', color)
        .style('fill', color)
        .style('fill-opacity', 0.3);

    box.transition().duration(duration)
      .attr("transform", function(d) { return "translate(" + x(d.time_start) + ",0)" })
      .style('opacity', 1)
      .select('rect')
      .attr("y", function (d) { return y(d.volume) })
      .attr("height", function (d) { return y(0)-y(d.volume) });

    box.exit().remove();
  }

  plot.update_candles_layer = function(container, layer, duration) {
    // and create & update the box charts
    var color = color_scale(layer.id);
    var box = container.selectAll(".box");
    box = box.data(layer.data, function(d) { return d._id });

    var w, mar;
    if (layer.data.length > 0) w = x(layer.data[0].time_end) - x(layer.data[0].time_start);
    mar = w*data_margin/2;
    w = w-2*mar;

    var enter = box.enter().append("g")
        .attr("class", "box")
        .attr("transform", function(d) { return "translate(" + x(d.time_start) + ",0)" })
        .style('opacity', 0.00001);
    enter.append("line")
      .attr("x1", mar+w/2)
      .attr("x2", mar+w/2)
      .attr("y1", function (d) { return y(d.price_min) })
      .attr("y2", function (d) { return y(d.price_max) })
      .style('stroke', 'silver');
    enter.append("rect")
      .attr("x", mar)
      .attr("width", w)
      .attr("y", function (d) { return Math.min(y(d.price_start), y(d.price_end)) })
      .attr("height", function (d) { return Math.max(0.5, Math.abs(-y(d.price_start)+y(d.price_end))) })
      .style('fill', function(d) { return (d.price_start < d.price_end) ? '#64FF64' : '#FF6464' })
      .style('stroke', 'black');

    var ts = box.transition().duration(duration)
      .attr("transform", function(d) { return "translate(" + x(d.time_start) + ",0)" })
      .style('opacity', 1);
    ts.select('line')
      .attr("y1", function (d) { return y(d.price_min) })
      .attr("y2", function (d) { return y(d.price_max) })
    ts.select('rect')
      .attr("y", function (d) { return Math.min(y(d.price_start), y(d.price_end)) })
      .attr("height", function (d) { return Math.max(0.5, Math.abs(-y(d.price_start)+y(d.price_end))) })

    box.exit().remove();
  }

  plot.update_vwap_layer_single_path = function(container, layer, duration) {
    // and create & update the box charts
    var color = color_scale(layer.id);

    var circles = container.selectAll('circle.vwap')
        .data(layer.data, function(d) { return d._id });
    circles.enter()
      .append('circle')
      .classed('vwap', true)
      .style('fill', color)
      .attr('r', 1.5);
    circles.transition().duration(duration)
      .attr('cx', function(d) { return x(((+d.time_start)+(+d.time_end))/2) })
      .attr('cy', function(d) { return y(d.vwap) })
    circles.exit().remove();

    var path = container.selectAll("path.vwap")
        .data([layer.data]);
    path.enter()
        .append('path')
        .classed('vwap', true)
        .style('fill', 'none')
        .attr('d', vwap_line)
        .style('stroke', color);
    // if we had an x-shift, handle it first without animation here (has to be
    // animated through a translate of the path)
    if (duration > 0) {
      var dom = y.domain();
      if (last_dom) y.domain(last_dom);
      path.attr('d', vwap_line);
      y.domain(dom);
    }
    // now animate any y-shift from rescaling
    path.transition().duration(duration)
      .attr('d', vwap_line);
    path.exit().remove();
  }

  plot.set_vwap_line = function(sel) {
    sel
      .style('display', function(d) {
        var dt = d[1].time_start - d[0].time_start;
        var len = d[0].time_end - d[0].time_start;
        return (dt <= 3*len) ? 'auto' : 'none'
      })
      .attr('x1', function(d) { return x(((+d[0].time_start)+(+d[0].time_end))/2) })
      .attr('y1', function(d) { return y(d[0].vwap) })
      .attr('x2', function(d) { return x(((+d[1].time_start)+(+d[1].time_end))/2) })
      .attr('y2', function(d) { return y(d[1].vwap) });
  }

  plot.update_vwap_layer = function(container, layer, duration) {
    // and create & update the box charts
    var color = color_scale(layer.id);

    var circles = container.selectAll('circle.vwap')
        .data(layer.data, function(d) { return d._id });
    circles.enter()
      .append('circle')
      .classed('vwap', true)
      .style('fill', color)
      .attr('r', 1.5);

    var lines = container.selectAll("line.vwap")
        .data(d3.pairs(layer.data), function(d) { return d[0]._id });
    lines.enter()
        .append('line')
        .classed('vwap', true)
        .style('fill', 'none')
        .call(this.set_vwap_line)
        .style('stroke', color);
    // if we had an x-shift, handle it first without animation here (has to be
    // animated through a translate of the path)
    if (duration > 0) {
      var dom = y.domain();
      if (last_dom) y.domain(last_dom);
      lines.call(this.set_vwap_line);
      circles.attr('cx', function(d) { return x(((+d.time_start)+(+d.time_end))/2) })
        .attr('cy', function(d) { return y(d.vwap) })
      y.domain(dom);
    }
    // now animate any y-shift from rescaling
    circles.transition().duration(duration)
      .attr('cx', function(d) { return x(((+d.time_start)+(+d.time_end))/2) })
      .attr('cy', function(d) { return y(d.vwap) })
    circles.exit().remove();
    lines.transition().duration(duration)
      .call(this.set_vwap_line);
    lines.exit().remove();
  }

  // Rescale y-axis if the data is out of range or if the it takes less than
  // 50% of the space. Only scales according to the part of the data that is
  // currently visible.
  plot.scale_y_axis = function(duration) {
    var mins = [], maxs = [];
    var max = d3.max(data_layers, function(layer) {
      console.log(layer);
      //if (!layer.active) return;
      var idx0 = bisect_end(layer.data, x.domain()[0])
         ,idx1 = bisect_start(layer.data, x.domain()[1], idx0)
         ,data = layer.data.filter(function(d, idx) { return idx >= idx0 && idx < idx1});
      if (vis_type === 'volume') {
        maxs.push(d3.max(data, function(d) { return d.volume }));
      } else {
        mins.push(d3.min(data, function(d) { return d.price_min }));
        maxs.push(d3.max(data, function(d) { return d.price_max }));
      }
    });
    if (maxs.length === 0 || maxs[0] === undefined) return false;
    var gmin = (vis_type === 'volume') ? 0 : d3.min(mins) || 0
       ,gmax = d3.max(maxs) || 0
       ,gd = gmax-gmin
       ,dom = y.domain()
       ,prev_gd = dom[1]-dom[0]
       ,lmar = (vis_type === 'volume') ? 0.0 : 0.2
       ,rmar = (vis_type === 'volume') ? 0.1 : 0.2;
    last_dom = dom;
    if (gmin < dom[0] || gmin > dom[0]+lmar*gd ||
        gmax > dom[1] || gmax < dom[1]-rmar*gd) {
      if (gd === 0) y.domain([gmin - prev_gd/2, gmax + prev_gd/2]);
      else y.domain([gmin-gd*lmar/2, gmax+gd*rmar/2]);
      yAxis.scale(y);
      yAxisEl.transition().duration(duration).call(yAxis);
      return true;
    }
    return false;
  }

  plot.update_x_axis = function(duration) {
    //xAxisEl.transition().duration(duration).call(xAxis);
  }

  plot.clear = function() {
    content_el.selectAll('.layer').remove();
  }

  plot.shift_x = function(tx, duration) {
    duration = duration || 0;
    content_el.transition().duration(duration)
      .ease('linear')
      .attr('transform', 'translate('+tx+',0)');
    // xAxisEl.transition().duration(duration)
    //   .ease('linear')
    //   .attr('transform', 'translate('+tx+',0)')
    //   .call(xAxis);
  }

  return plot;
}
var MainPlot = function() {
  var label        // label text of the plot, e.g. "USB / BTC"
     ,container    // html parent element of the plot
     ,label_el     // label element
     ,height=300   // plot height without margin
     ,margin = {top: 10, right: 70, bottom: 10, left: 10, between: 35}
     ,left_col     // left column element
     ,right_col    // right column element
     ,svg          // svg element for the plot
     ,svgg         // g element holding all the content
     ,sources = [] // array of DataSources
     ,time_end = null // show data until this time, can be a number or 'now'
     ,data_margin = 0.75 // request & render more than visible (factor)
     ,auto_advance = true // always show the latest time interval
     ,int_mode = '4h' // can be '1min', '5min', '30min', '4h', '1d'
     ,available_int_modes = ['1min', '5min', '30min', '4h', '1d']
     ,plot_type = 'vwap'
     ,available_plot_types = ['vwap', 'candles']
     ,time_map = { '1min': 1000*60, '5min': 1000*60*5, '30min': 1000*60*30
                 , '4h': 1000*3600*4, '1d': 1000*3600*24 }
     ,candle_width = 10
     ,legend_lines
     ,x = d3.time.scale()
     ,x_axis, x_axis_el
     ,color = d3.scale.category10()
     ,time_formatter = d3.time.format("%b/%d %I:%M:%S %p") // like "Oct/14 04:02:19 PM"
     ,vol_plot
     ,price_plot
     ,ruler_el
     ,ruler_text_el // vertical line marking the time the mouse is at
     ,tx = 0; // vertical shift for dragging
  //   ,resize_timer;

  var plot = function(container_node) {
    container = d3.select(container_node);
    if (!time_end) time_end = Date.now();
    plot.init();
//    d3.select('body').on('resize', scheduleResize);
    return this;
  }

  // var scheduleResize = function() {
  //   if (resizeTimer) clearTimeout(resizeTimer);
  //   resizeTimer = setTimeout(resize, 250);
  // }

  // var plot.resize = function() {

  // }

  var height_top = function() {
    return (height-margin.between) * 0.8;
  }

  var height_bottom = function() {
    return (height-margin.between) * 0.2;
  }

  plot.width = function() {
    return (svg ? svg.node().getBoundingClientRect().width - margin.left - margin.right : 0);
  }

  plot.addDataSource = function(source, active) {
    if (typeof(active) === 'undefined') active = true;
    sources.push(source);
    source.active = active;
    source.idx = sources.length-1;
    return this;
  }

  plot.label = function(arg) {
    if (arguments.length === 0) return label;
    label = arg;
    if (label_el) label_el.text(label);
    return this;
  }

  plot.height = function(arg) {
    if (arguments.length === 0) return height;
    height = arg;
    return this;
  }

  plot.int_mode = function(arg) {
    if (arguments.length === 0) return int_mode;
    int_mode = arg;
    if (svg) {
      plot.clear();
      plot.update();
    }
    return this;
  }

  plot.plot_type = function(arg) {
    if (arguments.length === 0) return plot_type;
    if (arg !== plot_type) {
      if (arg === 'candles') {
        var active_count = 0;
        for (var i=0; i<sources.length; i++) if (sources[i].active) active_count++;
        if (active_count > 1) {
          var count = 0;
          for (var j=0; j<sources.length; j++) {
            if (count > 0) sources[j].active = false;
            if (sources[j].active) count++;
          }
        }
        plot.updateLegend();
      }
      plot_type = arg;
      price_plot.vis_type(arg);
      plot.update(true, false);
    }
    return this;
  }

  plot.time_end = function(arg) {
    if (arguments.length === 0) return time_end;
    time_end = arg;
    return this;
  }


  plot.init = function() {
    initStructure();
    initContent();
  }

  plot.clear = function() {
    price_plot.clear();
    vol_plot.clear();
  }

  plot.update = function(update_prices, update_volumes) {
    if (typeof(update_prices) === 'undefined') update_prices = true;
    if (typeof(update_volumes) === 'undefined') update_volumes = true;
    var interval = getVisibleXInterval();
    var data_interval = getDataXInterval();
    x.domain(interval);

    var layer_data = [], count = 0;

    function callback(id, data) {
      if (id) layer_data.push({id: id, data: data});
      if (++count == sources.length) {
        plot.update_x_axis(250);
        if (update_prices) price_plot.data_layers(layer_data, 250);
        if (update_volumes) vol_plot.data_layers(layer_data, 250);
      }
    }

    sources.forEach(function(source) {
      if (!source.active) callback();
      else source.loadData(data_interval, int_mode, function(data) {
        callback(source.ex, data);
      })
    })
  }

  plot.shiftData = function(dx) {
    var dt = x.invert(dx)-x.invert(0);
    var domain = x.domain();
    var range = x.range();
    //if (domain[0]-dt < 0) dt = domain[0];
    //if (domain[1]-dt > N-1) dt = domain[1]-N+1;
    dx = x(dt)-x(0);
    tx += dx;
    time_end -= dt;
    x.range([x(domain[0]-dt), x(domain[1]-dt)]);
    x.domain([domain[0]-dt, domain[1]-dt]);

    var ts = x_axis_el.transition().duration(0)
      .ease('linear')
      .attr('transform', 'translate('+tx+',0)')
      .call(x_axis);
    ts.selectAll('text')
      .attr('y', -margin.between/2+4);
    ts.selectAll('line')
      .style('stroke-dasharray', [5, margin.between-10-1, 5]);

    vol_plot.shift_x(tx);
    price_plot.shift_x(tx);
  }

  plot.update_x_axis = function(duration) {
    var ts = x_axis_el.transition().duration(duration).call(x_axis)
    ts.selectAll('text')
      .attr('y', -margin.between/2+4);
    ts.selectAll('line')
      .style('stroke-dasharray', [5, margin.between-10-1, 5]);
  }

  function dragmove() {
    ruler_el.attr('display', 'none');
    auto_advance = false;
    var dx = d3.event.dx;
    if (!dx) return;
    //var dt = x.invert(dx)-x.invert(0);
    plot.shiftData(dx);
  }

  function dragend() {
    ruler_el.attr('display', 'auto');
    plot.update();
  }


  function initStructure() {
    var drag = d3.behavior.drag()
      .origin(function(d) { return {x: 0, y: 0} })
      .on("drag", dragmove)
      .on("dragend", dragend);

    right_col = container.append('div') // do this first of fixed-fluid layout
      .classed('right-col-wrapper', true)
      .append('div')
      .classed('right-col', true);
    left_col = container.append('div')
      .classed('left-col', true);
    label_el = left_col.append('h2').text(label);
    var int_sel = left_col.append('div')
      .classed('interval-selection', true)
      .selectAll('div.selector')
      .data(available_int_modes)
      .enter()
      .append('div')
      .classed('selector', true)
      .classed('selected', function(d) { return d === int_mode })
      .text(function(d) { return {'1min': '1 min', '5min': '5 min'
                                 ,'30min': '30 min', '4h': '4 h', '1d': '1 d'}[d] })
      .on('click', function(d) {
        int_sel.classed('selected', false);
        d3.select(this).classed('selected', true);
        plot.int_mode(d);
      });
    var plot_type_sel = left_col.append('div')
      .classed('plot-type-selection', true)
      .selectAll('div.selector')
      .data(available_plot_types)
      .enter()
      .append('div')
      .classed('selector', true)
      .classed('selected', function(d) { return d === plot_type })
      .text(function(d) { return d })
      .on('click', function(d) {
        plot_type_sel.classed('selected', false);
        d3.select(this).classed('selected', true);
        plot.plot_type(d);
      });

    legend_lines = left_col.append('div')
      .classed('legend', true)
      .selectAll('div.legend-item')
      .data(sources)
      .enter()
      .append('div')
      .classed('legend-item', true);
    legend_lines.append('span')
      .classed('label', true)
      .text(function(d) { return d.ex })
      .on('click', plot.toggleSource);
    legend_lines.append('span')
      .classed('marker', true)
      .on('click', plot.toggleSource);
    plot.updateLegend();

    svg = right_col.append('svg')
      .attr({width: '100%', height: height + margin.top + margin.bottom + margin.between});
    svgg = svg
      .append('g')
      .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
    svg.append('rect')
      .style({fill: 'none', stroke: 'none', 'pointer-events': 'all'})
      .attr({width: '100%', height: '100%'})
      .on('mousemove', function() {
        var pos = d3.mouse(svgg.node());
        var t = x.invert(pos[0]-tx);
        ruler_el.attr('transform', 'translate(' + (pos[0]-0.5) + ',0)');
        ruler_text_el.text(time_formatter(t));
      })
      .on('mouseleave', function() {
        ruler_el.attr('display', 'none');
      })
      .on('mouseenter', function() {
        ruler_el.attr('display', 'auto');
      })
      .call(drag);

    x_axis = d3.svg.axis()
      .scale(x)
      .orient("top")
      .outerTickSize(0)
      .tickSize(margin.between)
      .tickPadding(0);
    x_axis_el = svgg.append('g')
     .attr("transform", "translate(0, "+(height_top()+margin.between)+")")
     .append('g')
     .attr("class", "x axis");

    svgg.append('g')
      .classed('price-plot', true);
    svgg.append('g')
      .classed('volume-plot', true)
      .attr("transform", "translate(0, " +(height_top() + margin.between) + ")");
    ruler_el = svgg.append('g')
      .attr('transform', 'translate(0,0)')
      .attr('display', 'none');
    ruler_el.append('line')
      .classed('ruler', true)
      .attr({ y1: 0, y2: height });
    ruler_el.append('rect')
      .attr({fill: 'white', rx: 3, ry: 3, stroke: 'silver', width: 100, height: 16
            , x: -50, y: height_top()+margin.between/2-6});
    ruler_text_el = ruler_el.append('text')
      .classed('ruler-text', true)
      .attr({ x: -46, y: height_top()+margin.between/2+5 });
  }

  plot.toggleSource = function(source) {
    var active_count = 0;
    for (var i=0; i<sources.length; i++) if (sources[i].active) active_count++;
    if (active_count === 1) {
      //if (source.active) return; // keep at least one active
      if (plot_type==='candles') { // keep exactly one active for candle plot
        for (var i=0; i<sources.length; i++) sources[i].active = false;
      }
    }
    source.active = !source.active;
    plot.updateLegend();
    plot.update();
  }

  plot.updateLegend = function() {
    legend_lines.select('.marker')
      .style('background', function(d) {
        return d.active ? color(d.ex) : 'silver'
      });
  }

  function getVisibleXInterval() {
    var t1 = (auto_advance ? Date.now() : time_end);
    time_end = t1;
    return [Math.round(t1 - plot.width()/candle_width*time_map[int_mode]), t1];
  }

  function getDataXInterval() {
    var iv = getVisibleXInterval();
    iv[0] -= data_margin * (iv[1]-iv[0]);
    iv[1] += data_margin * (iv[1]-iv[0]);
    return [iv[0], iv[1]];
  }

  function initContent() {
    x.range([0, plot.width()]);
    color = d3.scale.category10();

    price_plot = VolumePlot()
      .x_scale(x)
      .size([plot.width(), height_top()])
      .color(color)
      .vis_type(plot_type);
    svg.select('.price-plot').call(price_plot);

    vol_plot = VolumePlot()
      .x_scale(x)
      .size([plot.width(), height_bottom()])
      .color(color)
      .vis_type('volume');
    svg.select('.volume-plot').call(vol_plot);

    plot.update();
  }

  return plot;
}
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
