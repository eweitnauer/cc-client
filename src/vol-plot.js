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

    vwap_line = d3.svg.line()
      .y(function(d) {
        return y(d.vwap)
      })
      .x(function(d) {
        return x(((+d.time_start)+(+d.time_end))/2)
      });
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
      .attr("height", function (d) { return Math.abs(-y(d.price_start)+y(d.price_end)) })
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
      .attr("height", function (d) { return Math.abs(-y(d.price_start)+y(d.price_end)) })

    box.exit().remove();
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

  // Rescale y-axis if the data is out of range or if the it takes less than
  // 50% of the space. Only scales according to the part of the data that is
  // currently visible.
  plot.scale_y_axis = function(duration) {
    var mins = [], maxs = [];
    var max = d3.max(data_layers, function(layer) {
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