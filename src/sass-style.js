/**
 * User: garcia.wul (garcia.wul@alibaba-inc.com)
 * Date: 2014/05/26
 * Time: 11:42
 * 将*.scss文件转换成css文件，并且进行一个transport
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
var Sass = require("./contributes/sass/sass");

var Base = require("./base");
var CssConcat = require("./utils/css-concat");
var Q = require("q");

var amdTemplate = Handlebars.compile([
    'define("{{{id}}}", [], function(require, exports, module) {',
    "   seajs.importStyle('{{{code}}}')",
    '});'
].join(""));

/**
 *
 * @param options
 * - sassOptions: sass编译的参数,具体参考:https://github.com/andrew/node-sass#options
 * - cssOptions
 * @constructor
 */
var SassStyle = function(options) {
    var self = this;
    Base.call(self, options);
    self.sassOptions = options.sassOptions;
    self.cssConcat = new CssConcat(options.cssOptions || {});
};
util.inherits(SassStyle, Base);

SassStyle.prototype.execute = function(inputFile) {
    var self = this;
    var deferred = Q.defer();
    // Step 1: 读取输入文件的内容
    var content = inputFile.content;
    var source = inputFile.src;

    // Step 2: 编译*.sass文件
    Sass.options(self.sassOptions);
    content = Sass.compile(content);

    // Step 3: 压缩CSS文件
    content = cleanCss.minify(content);
    content = _.map(content.split(/\r\n|\r|\n/), function(line) {
        return line.replace(/\\/g, '\\\\');
    }).join("\n").replace(/\'/g, '\\\'');

    // Step 4: 先分析得到文件的id
    var id = StringUtils.lstrip(StringUtils.lstrip(self.toUnixPath(source),
        {source: self.options.rootPath}), {source: "/"}
    );
    if (_.isFunction(self.options.idRule)) {
        id = self.options.idRule.call(self, id);
    }

    // Step 5: 得到AMD格式的代码
    var code = amdTemplate({
        id: id,
        code: content
    });
    code = self.beautify(code, "js");
    process.nextTick(function() {
        deferred.resolve(code);
    });
    return deferred.promise;
};

module.exports = SassStyle;