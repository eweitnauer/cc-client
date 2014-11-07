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
