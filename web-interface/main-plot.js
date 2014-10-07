var MainPlot = function() {
  var label        // label text of the plot, e.g. "USB / BTC"
     ,container    // html parent element of the plot
     ,label_el     // label element
     ,height=200   // plot height without margin
     ,margin = {top: 10, right: 60, bottom: 10, left: 10, between: 35}
     ,left_col     // left column element
     ,right_col    // right column element
     ,svg          // svg element for the plot
     ,sources = [] // array of DataSources
     ,time_end = 'now' // show data until this time, can be a number or 'now'
     ,curr_time_int // [t0, t1]
     ,int_mode = '1min' // can be '1min', '5min', '30min', '4h', '1d'
     ,available_int_modes = ['1min', '5min', '30min', '4h', '1d']
     ,plot_type = 'vwap'
     ,available_plot_types = ['vwap', 'candles']
     ,time_map = { '1min': 1000*60, '5min': 1000*60*5, '30min': 1000*60*30
                 , '4h': 1000*3600*4, '1d': 1000*3600*24 }
     ,candle_width = 10
     ,legend_lines
     ,x = d3.time.scale()
     ,color = d3.scale.category10()
     ,vol_plot
     ,price_plot
  //   ,resize_timer;

  var plot = function(container_node) {
    container = d3.select(container_node);
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
    if (svg) plot.update();
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
      price_plot.show_candles(arg === 'candles');
      price_plot.show_vwap(arg === 'vwap');
      if (svg) plot.update(true, false);
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

  plot.update = function(update_prices, update_volumes) {
    if (typeof(update_prices) === 'undefined') update_prices = true;
    if (typeof(update_volumes) === 'undefined') update_volumes = true;
    var interval = getTargetInterval();
    x.range([8, plot.width()-8])
     .domain(interval);

    var datas = [], count = 0;
    sources.forEach(function(source) {
      source.loadData(interval, int_mode, function(data) {
        datas[source.idx] = source.active ? data : [];
        if (++count == sources.length) {
          if (update_prices) price_plot.updateAll(datas);
          if (update_volumes) vol_plot.updateAll(datas);
        }
      });
    });
  }

  function initStructure() {
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
    svg.append('g')
      .classed('price-plot', true)
      .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
    svg.append('g')
      .classed('volume-plot', true)
      .attr("transform", "translate(" + margin.left + "," +
             (margin.top + height_top() + margin.between) + ")");
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
        return d.active ? color(d.idx) : 'silver'
      });
  }

  function getTargetInterval() {
    var t1 = (time_end === 'now' ? Date.now() : time_end);
    return [Math.round(t1 - plot.width()/candle_width*time_map[int_mode]), t1];
  }

  function initContent() {
    x.range([8, plot.width()-8])
     .domain(getTargetInterval());

    color = d3.scale.category10();

    price_plot = PricePlot().show_vwap(true).show_candles(false);
    price_plot(svg.select('.price-plot'), [], x, plot.width(), height_top(), color);

    vol_plot = VolumePlot();
    vol_plot(svg.select('.volume-plot'), [], x, plot.width(), height_bottom(), color);

    plot.update();
  }

  return plot;
}