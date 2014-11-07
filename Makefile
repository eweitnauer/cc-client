JS_COMPILER = ./node_modules/.bin/uglifyjs

all: cc-client.min.js

.INTERMEDIATE cc-client.js: \
src/tools.js \
	src/interval-list.js \
	src/data-source.js \
	src/vol-plot.js \
	src/main-plot.js \
	src/main.js

%.min.js: %.js Makefile
	@rm -f $@
	$(JS_COMPILER) -m --preamble '// Copyright Erik Weitnauer 2014.' < $< > $@
	@chmod a-w $@

cc-client.js: Makefile
	@rm -f $@
	cat $(filter %.js,$^) > $@
	@chmod a-w $@

test:
	@NODE_ENV=test ./node_modules/.bin/mocha \
		--reporter spec \
	  --check-leaks \
	  --require should \
	  --recursive

.PHONY: test
