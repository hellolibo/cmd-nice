/**
 * User: garcia.wul (garcia.wul@alibaba-inc.com)
 * Date: 2014/05/26
 * Time: 17:41
 * 对transport后的文件生成debug文件
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
 * @param options 是一个对象，所包含的字段有:
 * * postfix: 默认"-debug"，生成debug文件的文件名命名，比如a.js变成a-debug.js
 * @constructor
 */
var Debug = function(options) {
    var self = this;
    self.options = {
        postfix: "-debug"
    };
    Base.call(self, options);
};
util.inherits(Debug, Base);

Debug.prototype.execute = function(inputFile) {
    var self = this;
    var deferred = Q.defer();
    // Step 1: 读取输入文件的内容
    var content = inputFile.content;
    var source = inputFile.src;

    // Step 2: 得到抽象语法树
    var cmdParser = new CmdParser();
    var ast = cmdParser.getAst(content);
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

    var metaAst = cmdParser.parseFirst(ast);
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
    var id = metaAst.id;
    var idExtName = path.extname(id);
    if (!idExtName) {
        idExtName = ".js";
        id += idExtName;
    }
    id = id.replace(new RegExp(idExtName + "$"), self.options.postfix + idExtName);
    id = StringUtils.rstrip(id, {source: ".js"});

    var dependencies = metaAst.dependencies;
    var newDependencies = [];
    var newDependenciesMap = {};
    _.each(dependencies, function(dependency) {
        var name = dependency;
        var dependencyExtName = path.extname(name);
        if (!dependencyExtName) {
            dependencyExtName = ".js";
            dependency += dependencyExtName;
        }

        dependency = dependency.replace(new RegExp(dependencyExtName + "$"), self.options.postfix + dependencyExtName);
        dependency = StringUtils.rstrip(dependency, {source: ".js"});
        newDependenciesMap[name] = dependency;
        newDependencies.push(dependency);
    });

    var modified = cmdParser.modify(ast, {
        id: id,
        dependencies: newDependencies,
        require: newDependenciesMap
    });
    var code = modified.print_to_string();
    code = self.beautify(code, "js");
    process.nextTick(function() {
        deferred.resolve(code);
    });
    return deferred.promise;
};

module.exports = Debug;
