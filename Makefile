test:
	@NODE_ENV=test ./node_modules/.bin/mocha \
		--reporter spec \
	  --check-leaks \
	  --require should \
	  --recursive

.PHONY: test