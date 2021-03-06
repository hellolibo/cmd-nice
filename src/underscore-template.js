/**
 * User: garcia.wul (garcia.wul@alibaba-inc.com)
 * Date: 2014/05/23
 * Time: 13:20
 * 将underscore的模板转换为js代码，并且是AMD格式的
 */

var fs = require('graceful-fs');
var path = require("path");
var util = require("util");

var _ = require("underscore");
var StringUtils = require("underscore.string");
var Handlebars = require("handlebars");
var Base = require("./base");
var Q = require("q");

var amdTemplate = Handlebars.compile([
    'define("{{{id}}}", [], function(require, exports, module) {',
    '   module.exports = {{{code}}}',
    '});'
].join(""));

var UnderscoreTemplate = function(options) {
    var self = this;
    Base.call(self, options);
};
util.inherits(UnderscoreTemplate, Base);

UnderscoreTemplate.prototype.execute = function(inputFile) {
    var self = this;
    var deferred = Q.defer();
    // Step 1: 读取输入文件的内容
    var content = inputFile.content;
    var source = inputFile.src;

    // Step 2: 先分析得到文件的id
    var id = StringUtils.lstrip(StringUtils.lstrip(self.toUnixPath(source),
        {source: self.options.rootPath}), {source: "/"}
    );
    if (_.isFunction(self.options.idRule)) {
        id = self.options.idRule.call(self, id);
    }

    // Step 3: 进行预编译
    // TODO 2014-05-23 garcia.wul underscore template的编译还支持settings
    var complied = _.template(content);

    // Step 4: 得到AMD格式的代码
    var code = amdTemplate({
        id: id,
        code: complied.source
    });
    code = self.beautify(code, "js");
    process.nextTick(function() {
        deferred.resolve(code);
    });
    return deferred.promise;
};

module.exports = UnderscoreTemplate;