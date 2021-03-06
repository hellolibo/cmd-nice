/**
 * User: garcia.wul (garcia.wul@alibaba-inc.com)
 * Date: 2014/05/26
 * Time: 16:29
 * 对transport后的文件进行合并
 */

var fs = require('graceful-fs');
var path = require("path");
var util = require("util");

var _ = require("underscore");
var StringUtils = require("underscore.string");
var Handlebars = require("handlebars");

var Base = require("./base");
var CmdParser = require("./utils/cmd-parser");
var Q = require("q");

/**
 * 构造函数
 * @param options 所包含的字段有：
 * * filters: 是否使用过滤功能，默认false; 可以传入一个数组，来过滤相应的后缀名; 也可以是一个函数，来自定义过滤;
 * * include: 打包策略; relative/all/self
 * * separator: 合并文件的分隔，默认;
 * @constructor
 */
var Concat = function(options) {
    var self = this;
    self.options = {};
    Base.call(self, options);
    // 保存id和内容的对应
    self.idCache = {};
    self.astCache = {};
    self.dependenciesCache = {};
};
util.inherits(Concat, Base);

Concat.prototype.execute = function(inputFile) {
    var self = this;
    var deferred = Q.defer();
    var content = inputFile.content;
    var source = inputFile.src;

    // Step 2: 得到抽象语法树
    var cmdParser = new CmdParser();
    var ast = null;
    var metaAst = null;
    if (self.options.useCache && _.has(self.astCache, source) &&
        self.astCache[source].ast
        ) {
        ast = self.astCache[source].ast;
    }
    else {
        ast = cmdParser.getAst(content);
        if (!ast) {
            process.nextTick(function() {
                deferred.reject({
                    message: Handlebars.compile("parse {{{source}}} failed")({
                        source: source
                    }),
                    level: "error"
                });
            });
            return deferred.promise;
        }
        if (ast.error === true) {
            process.nextTick(function() {
                deferred.reject({
                    message: Handlebars.compile("parse {{{source}}} ast failed: {{{line}}},{{{col}}}")({
                        source: source,
                        line: ast.line,
                        col: ast.col
                    }),
                    level: "error"
                });
            });
            return deferred.promise;
        }
    }

    if (self.options.useCache && _.has(self.astCache, source) &&
        self.astCache[source].metaAst
        ) {
        metaAst = self.astCache[source].metaAst;
    }
    else {
        metaAst = cmdParser.parseFirst(ast);
        if (metaAst && self.options.useCache) {
            self.astCache[source] = {
                ast: ast,
                metaAst: metaAst
            };
        }
    }

    if (!metaAst) {
        process.nextTick(function() {
            deferred.reject({
                level: "warn",
                message: Handlebars.compile("{{{source}}} is not CMD format")({
                    source: source
                })
            });
        });
        return deferred.promise;
    }

    // Step 3: 得到依赖的模块
    var dependencies = metaAst.dependencies;
    var contents = [];
    if (self.options.useCache && self.dependenciesCache.hasOwnProperty(source)) {
        contents = self.dependenciesCache[source];
    }
    else {
        contents = [content];
        _.each(dependencies, function(dependency) {
            if (_.isFunction(self.options.idExtractor)) {
                dependency = self.options.idExtractor(dependency);
            }
            var dependencyContent = null;
            if (_.has(self.idCache, dependency)) {
                dependencyContent = self.readContentFromCache(dependency);
            }
            else if (dependency.indexOf("../") === 0 || dependency.indexOf("./") === 0) {
                dependencyContent = self.readContentForRelativePath(dependency,
                    path.dirname(source)
                );
            }
            else {
                dependencyContent = self.readContentFromLocal(dependency);
            }
            if (!dependencyContent) {
                return;
            }
            contents.push(dependencyContent);
        });
        if (self.options.useCache) {
            self.dependenciesCache[source] = contents;
        }
        // fix 佛山发现的依赖库被合并了两次的bug 2014-07-16
        self.idCache[metaAst.id] = content;
    }
    contents = _.map(contents, function(content) {
        return StringUtils.rstrip(content, {source: ";"});
    });
    contents = contents.join((self.options.separator || ";") + "\n");
    contents = StringUtils.rstrip(contents, {source: ";"}) + (self.options.separator || ";");
    process.nextTick(function() {
        deferred.resolve(contents);
    });
    return deferred.promise;
};

Concat.prototype.readContentFromCache = function(id) {
    var self = this;
    return self.idCache[id];
};

Concat.prototype.readContentForRelativePath = function(id, dirName) {
    var self = this;
    var newPath = path.normalize(path.join(dirName, id));
    if (!/\.js$/.test(newPath)) {
        newPath += ".js";
    }
    if (!fs.existsSync(newPath)) {
        return;
    }
    var content = fs.readFileSync(newPath, "utf-8");
    var cmdParser = new CmdParser();
    var ast = cmdParser.getAst(content);
    if (!ast || ast.error) {
        return content;
    }
    var metaAst = cmdParser.parseFirst(ast);
    if (!metaAst) {
        return content;
    }
    self.idCache[metaAst.id] = content;
    return content;
};

Concat.prototype.readContentFromLocal = function(id) {
    var self = this;
    var file = null;
    _.some(self.options.paths, function(p) {
        var newFile = path.join(p, id);
        if (!/\.js$/.test(newFile)) {
            newFile += ".js";
        }
        if (fs.existsSync(newFile)) {
            var stat = fs.statSync(newFile);
            if (stat.isFile()) {
                file = newFile;
                return true;
            }
        }
        return false;
    });
    if (!file) {
        return null;
    }
    file = path.normalize(fs.realpathSync(file));
    var content = fs.readFileSync(file, "utf-8");
    var metaAst = null;
    if (self.options.useCache && self.astCache.hasOwnProperty(file) &&
        self.astCache[file].metaAst
        ) {
        metaAst = self.astCache[file].metaAst;
    }
    else {
        var cmdParser = new CmdParser();
        var ast = cmdParser.getAst(content);
        if (!ast || ast.error) {
            return content;
        }
        metaAst = cmdParser.parseFirst(ast);
        if (metaAst && self.options.useCache) {
            self.astCache[file] = {
                ast: ast,
                metaAst: metaAst
            };
        }
    }

    if (!metaAst) {
        return content;
    }

    self.idCache[metaAst.id] = content;
    return content;
};

module.exports = Concat;