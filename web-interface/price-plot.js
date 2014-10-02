var PricePlot = function() {
  var y // y-scale
    , x // x-scale
    , width, height
    , xAxis
    , xAxisEl
    , yAxis
    , yAxisEl
    , container
    , show_vwap = false
    , show_candles = true
    , show_quantiles = false
    , show_min_max = false
    , vwap_line = null
    , min_max_area = null
    , color_map = null;

  var plot = function(_container, data, _x, _width, _height, colors) {
    container = _container;
    width = _width;
    height = _height;
    x = _x;
    color_map = colors;
    init(data);
    return this;
  }

  plot.show_quantiles = function(val) {
    if (arguments.length === 0) return show_quantiles;
    show_quantiles = val;
    return this;
  }

   plot.show_min_max = function(val) {
    if (arguments.length === 0) return show_min_max;
    show_min_max = val;
    return this;
  }

  plot.show_candles = function(val) {
    if (arguments.length === 0) return show_candles;
    show_candles = val;
    return this;
  }

  plot.show_vwap = function(val) {
    if (arguments.length === 0) return show_vwap;
    show_vwap = val;
    return this;
  }

  var init = function(data_arr) {
    y = d3.scale.linear()
          .range([height, 0]);
    // create y scale
    var gmins = [], gmaxs = [];
    data_arr.forEach(function(data) {
      gmins.push(d3.min(data, function(d) { return d.price_min }));
      gmaxs.push(d3.max(data, function(d) { return d.price_max }));
    })
    var gmin = d3.min(gmins)
       ,gmax = d3.max(gmaxs)
       ,gd = gmax-gmin;
    y.domain([gmin-gd*0.15, gmax+gd*0.15]);

    var axes = container.append('g');

    xAxis = d3.svg.axis()
      .scale(x)
      .orient("bottom")
      //.ticks(d3.time.week, 2)
      //.ticks(10)
      //.tickFormat(d3.time.format('%b/ %d'))
      .outerTickSize(0)
      .tickPadding(10);

    xAxisEl = axes.append("g")
      .attr("class", "x axis")
      .attr("transform", "translate(0," + height + ")")
      .call(xAxis)

    yAxis = d3.svg.axis()
      .scale(y)
      .ticks(6)
      .tickSize(-width)
      .outerTickSize(0)
      .orient("right");

    yAxisEl = axes.append("g")
      .attr("class", "y axis")
      .attr("transform", "translate("+ width+",0)")
      .call(yAxis);

    container.append('rect')
      .attr('width', width)
      .attr('height', height)
      .classed('border', true);

    plot.updateAll(data_arr);
  }

  plot.updateAll = function(datas) {
    var gs = container.selectAll('.layer')
      .data(datas);
    gs.enter().append('g').classed('layer', true);
    gs.exit().remove();
    gs.each(function(data, idx) {
      //var scaled_y = plot.update_axis(data);
      var g = d3.select(this);
      if (show_candles) plot.candles(g, data, idx);
      if (show_min_max) plot.min_max(g, data, idx);
      if (show_quantiles) plot.quantiles(g, data, idx);
      if (show_vwap) plot.vwap(g, data, idx);
    });
  }

  plot.update_axis = function(data) {
    // update y scale and axis
    var gmin = d3.min(data, function(d) { return d.price_min })
       ,gmax = d3.max(data, function(d) { return d.price_max })
       ,gd = (gmax-gmin);

    var delay = 0, scaled_y = false;

    // only rescale y axis if the data is out of range or if the it takes
    // less than 50% of the space
    if ((gd < 0.5*(y.domain()[1]-y.domain()[0])) ||
        (gmin-gd*0.05 < y.domain()[0] || gmax+gd*0.05 > y.domain()[1])) {
      y.domain([gmin-gd*0.15, gmax+gd*0.15]);
      yAxis.scale(y);
      yAxisEl.transition().duration(750).call(yAxis);
      delay = 750;
      scaled_y = true;
    }
    xAxis.scale(x);
    xAxisEl.transition().delay(delay).duration(500).call(xAxis);
    return scaled_y;
  }

  plot.candles = function(g, data, idx, rescale_y) {
    var w = 2/3*(x(data[0].time_end) - x(data[0].time_start));
    var mar = w/4;
  	var box = g.selectAll(".box")
    	  .data(data, function(d) {return d._id});

    var enter = box.enter().append("g")
      	.attr("class", "box")
      	.attr("transform", function(d) { return "translate(" + x(d.time_start) + ",0)"; })
        .style('opacity', 0.000001);

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
      .attr("height", function (d) { return Math.abs(-y(d.price_start)+y(d.price_end)) })
      .style('fill', function(d) { return (d.price_start < d.price_end) ? '#64FF64' : '#FF6464' })
      .style('stroke', 'black');

    t = box.transition()
       .duration(500)
       .delay(rescale_y ? 750 : 0)
       .attr("transform", function(d) { return "translate(" + x(d.time_start) + ",0)" })
       .style('opacity', 1);

    if (rescale_y) {
      t.select('line').delay(0).attr("y1", function (d) { return y(d.price_min) })
                      .attr("y2", function (d) { return y(d.price_max) })
      t.select('rect').delay(0).attr("y", function (d) { return y(d.price_start) })
                               .attr("height", function (d) { return -y(d.price_end)+y(d.price_start) })
    }

    box.exit().remove();

    return this;
  }

  plot.vwap = function(g, data, idx, rescale_y) {
    if (!vwap_line) {
      vwap_line = d3.svg.line()
        .y(function(d) {
          return y(d.vwap)
        })
        .x(function(d) {
          return x(((+d.time_start)+(+d.time_end))/2)
        });
    }
    var path = g.selectAll(".vwap")
        .data([data]);
     if (rescale_y) path.attr('d', vwap_line)
    path.enter()
        .append('path')
        .classed('vwap', true)
        .attr('d', vwap_line)
        .style('fill', 'none');
    path.style('stroke', color_map(idx));
    path.exit().remove();
  }

  plot.min_max = function(g, data, idx, rescale_y) {
    if (!min_max_area) {
      min_max_area = d3.svg.area()
        .y0(function(d) {
          return y(d.price_min)
        })
        .y1(function(d) {
          return y(d.price_max)
        })
        .x(function(d) {
          return x(((+d.time_start)+(+d.time_end))/2)
        });
    }
    var path = g.selectAll(".min-max")
        .data([data]);
    if (rescale_y) path.attr('d', min_max_area);
    path.enter().append('path').classed('min-max', true).attr('d', min_max_area);
    path.exit().remove();
  }

  plot.quantiles = function(g, data, idx, rescale_y) {
    if (!quantiles_area) {
      quantiles_area = d3.svg.area()
        .y0(function(d) {
          return y(d.vwq75)
        })
        .y1(function(d) {
          return y(d.vwq25)
        })
        .x(function(d) {
          return x(((+d.time_start)+(+d.time_end))/2)
        });
    }
    var path = g.selectAll(".quantiles")
        .data([data]);
    if (rescale_y) path.attr('d', quantiles_area);
    path.enter().append('path').classed('quantiles', true).attr('d', quantiles_area);
    path.exit().remove();
  }

  return plot;
}