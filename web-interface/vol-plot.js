var VolumePlot = function() {
  var y // y-scale
    , x // x-scale
    , width, height
    , xAxis
    , xAxisEl
    , yAxis
    , yAxisEl
    , container
    , color_map;

  var plot = function(_container, data, _x, _width, _height, colors) {
    container = _container;
    width = _width;
    height = _height;
    x = _x;
    color_map = colors;
    init(data);
    return this;
  }

  var init = function(datas) {
    // create y scale
    y = d3.scale.linear()
          .range([height, 0]);
    var max = d3.max(datas, function(data) { return d3.max(data, function(d) { return d.volume }) });
    y.domain([0, max*1.05]);
    var axes = container.append('g');

    // now create & update the axes
    // xAxis = d3.svg.axis()
    //   .scale(x)
    //   .orient("top")
    //   .outerTickSize(0)
    //   .tickPadding(10);

    // xAxisEl = axes.append("g")
    //   .attr("class", "x axis")
    //   .attr("transform", "translate(0,0)")
    //   .call(xAxis);

    yAxis = d3.svg.axis()
      .scale(y)
      .ticks(2)
      .tickSize(0)
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

    plot.updateAll(datas);
  }

  plot.updateAll = function(datas) {
    var gs = container.selectAll('.layer')
      .data(datas);
    gs.enter().append('g').classed('layer', true);
    gs.exit().remove();
    gs.each(function(data, idx) {
      var g = d3.select(this);
      plot.update(g, data, idx);
    });

    plot.orderAll();
  }

  plot.orderAll = function() {
    container.selectAll('.box')
      .sort(function(d1, d2) { return d2.volume - d1.volume });
  }

  plot.update = function(container, data, idx) {
    var max = d3.max(data, function(d) { return d.volume });

    var delay = 0, scaled_y = false;

    // only rescale y axis if the data is out of range or if the it takes
    // less than 50% of the space
    if ((max < 0.5*y.domain()[1]) ||
        (max*1.05 > y.domain()[1])) {
      y.domain([0, max*1.05]);
      yAxis.scale(y);
      yAxisEl.transition().duration(750).call(yAxis);
      delay = 750;
      scaled_y = true;
    }

    // xAxis.scale(x);
    // xAxisEl.transition().duration(500).call(xAxis);

    // and create & update the box charts
    var w = 2/3*(x(data[0].time_end) - x(data[0].time_start));
    var mar = w/4;
    var box = container.selectAll(".box")
        .data(data, function(d) {return d._id});

    var enter = box.enter().append("g")
        .attr("class", "box")
        .attr("transform", function(d) { return "translate(" + x(d.time_start) + ",0)" })
        .style('opacity', 0.00001);
    enter.append("rect")
        .attr("x", mar)
        .attr("width", w)
        .attr("y", function (d) { return y(d.volume) })
        .attr("height", function (d) { return y(0)-y(d.volume) })
        .style('stroke', color_map(idx))
        .style('fill', color_map(idx))
        .style('fill-opacity', 0.3);

    var t = box.transition()
       .duration(500)
       .delay(delay)
       .attr("transform", function(d) { return "translate(" + x(d.time_start) + ",0)"; })
       .style('opacity', 1);

    if (scaled_y) {
      t.select('rect').delay(0)
       .attr("y", function (d) { return y(d.volume) })
      .attr("height", function (d) { return y(0)-y(d.volume) });
    }

    box.exit().remove();
  }

  return plot;
}