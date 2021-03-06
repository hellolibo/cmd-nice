/**
 * User: garcia.wul (garcia.wul@alibaba-inc.com)
 * Date: 2014/05/22
 * Time: 22:16
 * 将*.handlebars文件转成js代码
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
    'define("{{{id}}}", ["{{{handlebars.id}}}"], function(require, exports, module) {',
    '   var Handlebars = require("{{{handlebars.id}}}");',
    '   var template = Handlebars.template;',
    '   module.exports = template({{{content}}});',
    '});'
].join(""));

var HandlebarsTemplate = function(options) {
    var self = this;
    Base.call(self, options);
};

util.inherits(HandlebarsTemplate, Base);

HandlebarsTemplate.prototype.execute = function(inputFile) {
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
    var complied = Handlebars.precompile(content, {
        knownHelpers: self.options.handlebars.knownHelpers
    });

    // Step 4: 得到AMD格式的代码
    var code = amdTemplate({
        id: id,
        handlebars: self.options.handlebars,
        content: complied
    });
    code = self.beautify(code, "js");
    process.nextTick(function() {
        deferred.resolve(code);
    });
    return deferred.promise;
};

module.exports = HandlebarsTemplate;