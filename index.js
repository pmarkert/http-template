var    _ = require('underscore'),
	  fs = require('fs'),
	path = require('path'),
	http = require('http'),
	zlib = require('zlib'),
   https = require('https');

module.exports = function(basePath) {
	basePath = path.normalize(basePath);

	//make sure we have the trailing '/'
	basePath += (basePath[basePath.length-1]==='/' ? '' : '/');

	var defaults = {
		https: false,
		autoContentLength: true
	};

	var get_options = function(options) {
		if (options) {
			return _.extend({}, defaults, options); // mix options into defaults, copy to new object
		} else {
			return _.extend({}, defaults); // no options passed, copy defaults
		}
	};

	return function(template, data, options, callback) {

		if (_.isFunction(options) && !callback) {
			callback = options;
			options = null;
		}

		options = get_options(options);

		// load template from file system
		var http_text = _.template(
			fs.readFileSync(basePath + template + '.http', 'utf-8').toString(), data, {
				interpolate: /\{\{(.+?)\}\}/g
			});

		//parse first line
		var lines = http_text.split(/\n/);
		var matches = lines[0].match(/^([A-Za-z]+)\s+([\/0-9A-Za-z_&?=\-%+\.]+)\s+HTTP.+$/);
		var method = matches[1];
		var path = matches[2];
		lines.shift();

		// read all the headers
		var host, body = '', headers = {}, inBody = false;
		_.each(lines, function(line) {
			
			if (line.length > 0) {

				var matches = line.match(/([-A-Za-z]+):\s+(.+)$/);
				if (matches) {

					var k = matches[1];
					var v = matches[2];

					if (k.toUpperCase() === "HOST") {
						host = v;
					}
					headers[k] = v;

				} else {
					inBody = true;
					body += line;
				}
				
			} else {
				if (inBody) {
					body += '\n';	
				}
				return;
			}
		});

		// if enabled, use whatever the resulting body length is
		if (options.autoContentLength) {
			headers['Content-Length'] = body.length;
		}

		// send request
		var proto = options.https ? https : http;
		var req = proto.request({ 
			host: host,
			port: options.https ? '443' : '80',
			path: path, 
			method: method,
			headers: headers }, 
			function(res) {
				var buffers = [];

				// set up pipe for response data, gzip or plain based on respone header
				var stream = res.headers['content-encoding'] && res.headers['content-encoding'].match(/gzip/) ?
					res.pipe(zlib.createGunzip()) : res;

				stream.on('data', function(chunk) {
					buffers.push(chunk);
				}).on('end', function() {
					callback(res, Buffer.concat(buffers).toString());
				});
		});
		req.write(body);
		req.end();
  	};
};
