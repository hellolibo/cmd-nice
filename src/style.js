/**
 * User: garcia.wul (garcia.wul@alibaba-inc.com)
 * Date: 2014/05/23
 * Time: 13:36
 *
 */

var fs = require('graceful-fs');
var path = require("path");
var util = require("util");

var _ = require("underscore");
var StringUtils = require("underscore.string");
var Handlebars = require("handlebars");
var CleanCSS = require("clean-css");
var cleanCss = new CleanCSS({
    keepSpecialComments: 0
});

var Base = require("./base");
var CssConcat = require("./utils/css-concat");
var Q = require("q");

var amdTemplate = Handlebars.compile([
    'define("{{{id}}}", [], function(require, exports, module) {',
    "   seajs.importStyle('{{{code}}}')",
    '});'
].join(""));

var Style = function(options) {
    var self = this;
    self.options = {
        cssOptions: {
            paths: []
        }
    };
    Base.call(self, options);
    self.cssConcat = new CssConcat(self.options.cssOptions);
};
util.inherits(Style, Base);

Style.prototype.execute = function(inputFile) {
    var self = this;
    var deferred = Q.defer();
    // Step 1: 读取输入文件的内容
    var content = inputFile.content;
    var source = inputFile.src;

    // Step 2: 压缩CSS文件
    self.cssConcat.concat(content, source).then(function(extendedCss) {
        content = extendedCss;
        content = cleanCss.minify(content);
        content = _.map(content.split(/\r\n|\r|\n/), function(line) {
            return line.replace(/\\/g, '\\\\');
        }).join("\n").replace(/\'/g, '\\\'');

        // Step 3: 先分析得到文件的id
        var id = StringUtils.lstrip(StringUtils.lstrip(self.toUnixPath(source),
            {source: self.options.rootPath}), {source: "/"}
        );
        if (_.isFunction(self.options.idRule)) {
            id = self.options.idRule.call(self, id);
        }

        // Step 4: 得到AMD格式的代码
        var code = amdTemplate({
            id: id,
            code: content
        });
        code = self.beautify(code, "js");
        deferred.resolve(code);
    });
    return deferred.promise;
};

module.exports = Style;