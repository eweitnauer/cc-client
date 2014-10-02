var IntervalList = require('../interval-list.js').IntervalList;
describe('IntervalList', function() {
	describe('.getMissingIntervals', function() {
		it('should should return the passed interval if the list is empty', function() {
			var ti = new IntervalList();
			var res = ti.getMissingIntervals([10, 20]);
			res.should.eql([[10, 20]]);
  	});
  	it('should should return the passed interval if there is no overlap', function() {
			var ti = new IntervalList();
			ti.ivs.push([0, 20]);
			ti.ivs.push([30, 35]);
			ti.getMissingIntervals([-10, 0]).should.eql([[-10, 0]]);
			ti.getMissingIntervals([20, 30]).should.eql([[20, 30]]);
			ti.getMissingIntervals([50, 100]).should.eql([[50, 100]]);
  	});
  	it('should should return the no interval if passed interval is contained', function() {
			var ti = new IntervalList();
			ti.ivs.push([0, 20]);
			ti.getMissingIntervals([0, 20]).should.be.empty;
			ti.getMissingIntervals([10, 11]).should.be.empty;
  	});
  	it('should should return the correct interval for partial overlaps', function() {
			var ti = new IntervalList();
			ti.ivs.push([0, 2]);
			ti.ivs.push([5, 11]);
			ti.ivs.push([12, 13]);
			ti.getMissingIntervals([-1, 6]).should.eql([[-1, 0], [2, 5]]);
			ti.getMissingIntervals([1, 12]).should.eql([[2, 5], [11, 12]]);
			ti.getMissingIntervals([-1, 14]).should.eql([[-1, 0], [2, 5], [11, 12], [13, 14]]);
  	});
  });

	describe('.insert', function() {
		it('should insert the interval if the list is empty', function() {
			var ti = new IntervalList();
			ti.insert([10,20]);
			ti.ivs.should.eql([[10, 20]]);
		});
		it('should insert the interval at the right position if it does not touch or' +
		   ' overlap', function() {
			var ti = new IntervalList();
			ti.ivs.push([0, 20]);
			ti.ivs.push([30, 35]);
			ti.insert([21,29]);
			ti.ivs.should.eql([[0, 20], [21, 29], [30, 35]]);

			ti = new IntervalList();
			ti.ivs.push([0, 20]);
			ti.insert([-10,-5]);
			ti.ivs.should.eql([[-10, -5], [0, 20]]);

			ti = new IntervalList();
			ti.ivs.push([0, 20]);
			ti.insert([21,30]);
			ti.ivs.should.eql([[0, 20], [21, 30]]);
		});
		it('should insert & merge the interval when touching or overlapping', function() {
			var ti = new IntervalList();
			ti.ivs.push([0, 2]);
			ti.ivs.push([5, 11]);
			ti.ivs.push([12, 13]);
			ti.insert([1,12]);
			ti.ivs.should.eql([[0, 13]]);

			ti = new IntervalList();
			ti.ivs.push([0, 2]);
			ti.ivs.push([5, 11]);
			ti.ivs.push([12, 13]);
			ti.insert([-1,6]);
			ti.ivs.should.eql([[-1, 11], [12, 13]]);
		});
	});
});