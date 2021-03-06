/**
 * User: garcia.wul (garcia.wul@alibaba-inc.com)
 * Date: 2014/08/30
 * Time: 16:12
 * 分析JS代码的依赖
 */

var fs = require('graceful-fs');
var path = require("path");
var util = require("util");
var _ = require("underscore");
var StringUtils = require("underscore.string");
var Base = require("../plugins/base");
var CmdParser = require("../utils/cmd-parser");
var Q = require("q");
var Handlebars = require("handlebars");

/**
 * 构造函数
 * @param options 是一个对象，可以传递的参数有:
 * - idRule: 自定义id的规则函数
 * - alias: 别名
 * - aliasPaths: 路径的别名
 * - rootPath:
 * @constructor
 */
var DependencyUtils = function(options) {
    var self = this;
    Base.call(self, options);
    if (!_.isObject(self.options.alias)) {
        self.options.alias = {};
    }
    if (!_.isObject(self.options.aliasPaths)) {
        self.options.aliasPaths = {};
    }
};
util.inherits(DependencyUtils, Base);

DependencyUtils.prototype.analyseDependencies = function(content, source) {
    var self = this;
    var cmdParser = new CmdParser();
    var ast = cmdParser.getAst(content);
    if (!ast) {
        self.logger.error(Handlebars.compile("parse {{{source}}} failed")({
            source: source
        }));
        return null;
    }
    if (ast.error === true) {
        self.logger.error(
            Handlebars.compile("parse {{{source}}} ast failed: {{{line}}},{{{col}}}")({
            source: source,
            line: ast.line,
            col: ast.col
        }));
        return null;
    }
    var metaAst = cmdParser.parseFirst(ast);
    if (!metaAst) {
        self.logger.error(Handlebars.compile("{{{source}}} is not CMD format")({
            source: source
        }));
    }

    // Step 3: 得到依赖的模块
    var dependencies = metaAst.dependencies;
    // Step 4: 使用alias和aliasPaths来替换dependencies
    _.each(dependencies, function(dependency, index) {
        dependencies[index] = self.replaceByAlias(dependencies[index]);
        dependencies[index] = self.replaceByPaths(dependencies[index]);
    });

    // Step 5: 递归地查找依赖关系
    var newDependencies = [];
    _.each(dependencies, function(dependency) {
        dependency = self.getRealName(dependency, path.normalize(path.join(source, "..")));
        dependency = StringUtils.rstrip(dependency, {source: ".js"});
        newDependencies.push(dependency);
        newDependencies = _.union(newDependencies,
            self.findDependencies(dependency, path.dirname(source))
        );
    });

    return newDependencies;
};

/**
 * 是否是别名
 * @param name
 * @returns {*}
 */
DependencyUtils.prototype.isAlias = function(name) {
    var self = this;
    return _.has(self.options.alias, name);
};

/**
 * 使用别名来替换依赖
 * @param name
 * @returns {*}
 */
DependencyUtils.prototype.replaceByAlias = function(name) {
    var self = this;
    if (self.isAlias(name)) {
        return self.options.alias[name];
    }
    return name;
};

/**
 * 使用路径来替换依赖
 * @param name
 */
DependencyUtils.prototype.replaceByPaths = function(name) {
    var self = this;
    var names = name.split("/");
    if (!names || names.length <= 1) {
        // 没有路径
        return name;
    }
    var newName = [];
    _.each(names.slice(0, names.length - 1), function(item) {
        if (_.has(self.options.aliasPaths, item) &&
            _.isString(self.options.aliasPaths[item])) {
            newName.push(self.options.aliasPaths[item]);
        }
        else {
            newName.push(item);
        }
    });
    newName.push(names[names.length - 1]);
    return newName.join("/");
};

/**
 * 递归的找到依赖的依赖
 */
DependencyUtils.prototype.findDependencies = function(dependency, basePath) {
    var self = this;
    var dependencies = [];
    var realFilePath = path.normalize(path.join(basePath, dependency));
    if (!/\.js$/.test(realFilePath)) {
        realFilePath += ".js";
    }
    if (!fs.existsSync(realFilePath)) {
        realFilePath = null;
        _.some(self.options.paths, function(pathname) {
            var filename = path.join(pathname, dependency);
            if (!/\.js$/.test(filename)) {
                filename += '.js';
            }
            if (fs.existsSync(filename)) {
                realFilePath = filename;
                return true;
            }
            return false;
        });
    }
    if (!realFilePath) {
        return dependencies;
    }
    realFilePath = path.normalize(fs.realpathSync(realFilePath));

    // Step 1: 读取输入文件的内容
    var content = fs.readFileSync(realFilePath, "utf-8");
    // Step 2: 得到抽象语法树
    var cmdParser = new CmdParser();
    var ast = cmdParser.getAst(content);
    if (!ast) {
        self.logger.error("Parse %s failed", realFilePath);
        return dependencies;
    }
    if (ast.error === true) {
        self.logger.error("Parse %s failed: %s,%s", realFilePath, ast.line, ast.col);
        return dependencies;
    }
    var metaAst = cmdParser.parseFirst(ast);
    if (!metaAst) {
        return dependencies;
    }

    // Step 3: 使用alias和aliasPaths来替换dependencies
    _.each(metaAst.dependencies, function(dependency, index) {
        metaAst.dependencies[index] = self.replaceByAlias(metaAst.dependencies[index]);
        metaAst.dependencies[index] = self.replaceByPaths(metaAst.dependencies[index]);
    });
    _.each(metaAst.dependencies, function(dependency) {
        dependency = StringUtils.rstrip(dependency, {source: ".js"});
        dependency = self.getRealName(dependency, path.normalize(path.dirname(realFilePath)));
        if (!dependency) {
            return null;
        }
        dependencies.push(dependency);
        dependencies = _.union(dependencies,
            self.findDependencies(dependency, path.normalize(path.dirname(realFilePath)))
        );
    });
    return dependencies;
};

DependencyUtils.prototype.getRealName = function(dependency, base) {
    var self = this;
    if (dependency.indexOf("../") === 0 || dependency.indexOf("./") === 0) {
        var realName = path.normalize(path.join(base, dependency));
        if (!fs.existsSync(realName) && !/\.js$/.test(realName)) {
            realName += ".js";
        }
        if (!fs.existsSync(realName)) {
            return null;
        }
        return StringUtils.rstrip(StringUtils.lstrip(
            StringUtils.lstrip(self.toUnixPath(realName), {source: self.options.rootPath}),
            {source: "/"}
        ), {source: ".js"});
    }
    else {
        return dependency;
    }
};

module.exports = DependencyUtils;