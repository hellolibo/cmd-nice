/**
 * User: garcia.wul (garcia.wul@alibaba-inc.com)
 * Date: 2014/05/07
 * Time: 23:39
 *
 */

var UglifyJS = require('uglify-js');
var _ = require("underscore");

var DEFINE_NAME = "define";

var CmdParser = function() {};

/**
 * 解析得到抽象语法树
 */
CmdParser.prototype.getAst = function(code, options) {
    var ast = null;
    try {
        ast = UglifyJS.parse(code, options || {});
    } catch(e) {
        if (e instanceof UglifyJS.JS_Parse_Error) {
            ast = {
                error: true,
                line: e.line,
                col: e.col,
                message: e.message,
                stack: e.stack
            }
        }
    }
    return ast;
};

/**
 * 解析出所有的`define`
 */
CmdParser.prototype.parseAll = function(ast) {
    var self = this;
    var metaResults = [];
    var walker = new UglifyJS.TreeWalker(function(node, descend) {
        if (node instanceof UglifyJS.AST_Call && node.expression.name === DEFINE_NAME) {
            var define = self.getDefine(node);
            if (define) {
                metaResults.push(define);
            }
        }
    });
    ast.walk(walker);
    return metaResults;
};

/**
 * 解析`define`的一切
 * @param ast
 */
CmdParser.prototype.parse = function(ast) {
    var self = this;
    var metaResults = [];
    var walker = new UglifyJS.TreeWalker(function(node, descend) {
        if (node instanceof UglifyJS.AST_Call && node.expression.name === DEFINE_NAME) {
            var define = self.getDefine(node);
            if (define) {
                metaResults.push(define);
            }
            return true; // 只查找一个
        }
    });
    ast.walk(walker);
    return metaResults;
};

/**
 * 调用`parse`来得到第一个define
 * @param ast
 * @returns {*}
 */
CmdParser.prototype.parseFirst = function(ast) {
    var metaResults = this.parse(ast);
    if (_.isArray(metaResults) && metaResults.length > 0) {
        return metaResults[0];
    }
    return null;
};

/**
 * 修改代码中的`define`和依赖，目标是将其修改成AMD格式
 * @param ast
 * @param opt 这里的opt是一个对象，包含以下几个部分:
 * （1）id: 指定id;如果通过这个参数传入了id，那么使用改id;否则使用代码分析出来的id
 * （2）dependencies: 传入之前所分析好的依赖，得是一个数组
 * （3）require: 对`require`中的字符串所在的处理的函数、对象
 */
CmdParser.prototype.modify = function(ast, opt) {
    var self = this;
    var options = {
        id: null,
        dependencies: null,
        require: null
    };
    if (_.isObject(opt)) {
        options = _.extend(options, opt);
    }
    if (!options.id && !options.dependencies) {
        return;
    }

    var requireName = "require";
    var transformer = new UglifyJS.TreeTransformer(function(node, descend) {
        if (node instanceof UglifyJS.AST_Call &&
            node.expression.name === DEFINE_NAME &&
            node.args.length > 0
            ) {
            var metaInfo = self.getDefine(node);
            if (_.isObject(metaInfo) && metaInfo.factory) {
                if (_.isArray( metaInfo.factory.argnames) &&
                    metaInfo.factory.argnames.length > 0) {
                    requireName =  metaInfo.factory.argnames[0].name;
                }
            }

            var args = [];
            // 修改`define`
            var metaResult = self.getDefine(node);
            if (_.isFunction(options.id)) {
                metaResult.id = options.id(metaResult.id);
            }
            else if (_.isString(options.id)) {
                metaResult.id = options.id;
            }
            if (metaResult.id) {
                args.push(new UglifyJS.AST_String({value: metaResult.id}));
            }

            // 修改依赖关系
            if (options.dependencies) {
                var elements = _.map(options.dependencies, function(item) {
                    return new UglifyJS.AST_String({
                        value: item
                    });
                });

                if (metaResult.dependencyNode) {
                    args.push(new UglifyJS.AST_Array({
                        start: metaResult.dependencyNode.start,
                        end: metaResult.dependencyNode.end,
                        elements: elements
                    }));
                }
                else {
                    args.push(new UglifyJS.AST_Array({
                        elements: elements
                    }));
                }
            }
            else {
                args.push(new UglifyJS.AST_Array({
                    elements: []
                }));
            }

            if (metaResult.factory) {
                args.push(metaResult.factory);
            }

            node.args = args;
            return node;
        }
    });
    ast = ast.transform(transformer);
    if (options.require || options.async) {
        ast = self.replaceRequires(ast, requireName, options.require);
    }
    return ast;
};

/**
 * 尽可能地分析出节点中的define中所包含的信息，其中包括：id、依赖、factory函数
 * @param node node必须是instanceof UglifyJS.AST_Call
 * @return 结果是一个对象，包含4个值：id、dependencies、dependencyNode、factory;如果分析不到，则返回null
 */
CmdParser.prototype.getDefine = function(node) {
    var self = this;
    // 代码中定义的id
    var id = null;
    // define中定义的函数
    var factory = null;
    var dependencyNode = null;
    // 所有依赖
    var dependencies = [];

    if (!_.isArray(node.args) || node.args.length <= 0) {
        return null;
    }

    if (node.args.length === 1) {
        // define(function(require, exports, module) {}); 这种情况
        factory = node.args[0];
        if (factory instanceof UglifyJS.AST_Function) {
            dependencies = self.parseDependencies(factory);
        }
    }
    else if (node.args.length === 2) {
        factory = node.args[1];
        var idOrDependencies = node.args[0];
        if (idOrDependencies instanceof UglifyJS.AST_Array) {
            // 类似: define([], function() {});
            _.each(idOrDependencies.elements, function(element) {
                if (element instanceof UglifyJS.AST_String) {
                    dependencies.push(element.getValue());
                }
                dependencyNode = idOrDependencies;
            });
        }
        else if (idOrDependencies instanceof UglifyJS.AST_String) {
            // 类似: define("id", function() {});
            id = idOrDependencies.getValue();
            dependencies = self.parseDependencies(factory);
        }
    }
    else {
        factory = node.args[2];
        var firstChild = node.args[0];
        var secondChild = node.args[1];
        if (firstChild instanceof UglifyJS.AST_String) {
            id = firstChild.getValue();
        }
        if (secondChild instanceof UglifyJS.AST_Array) {
            _.each(secondChild.elements, function (element) {
                if (element instanceof UglifyJS.AST_String) {
                    dependencies.push(element.getValue());
                }
            });
            dependencyNode = secondChild;
        }
        else if ((secondChild instanceof UglifyJS.AST_Null) ||
            (secondChild instanceof UglifyJS.AST_Undefined)) {
            if (factory instanceof UglifyJS.AST_Function) {
                dependencies = self.parseDependencies(factory);
            }
        }
    }

    return {
        id: id,
        dependencies: dependencies,
        dependencyNode: dependencyNode,
        factory: factory
    };
};

/**
 * 解析代码中所有的依赖
 * @param factory
 */
CmdParser.prototype.parseDependencies = function(factory) {
    var self = this;
    var dependencies = [];

    var requireName = null;
    if (_.isArray(factory.argnames) && factory.argnames.length > 0) {
        requireName = factory.argnames[0].name;
    }
    if (!requireName) {
        requireName = "require";
    }
    var walker = new UglifyJS.TreeWalker(function(node, descend) {
        if (node instanceof UglifyJS.AST_Call && node.expression.name === requireName) {
            var args = node.expression.args || node.args;
            if (_.isArray(args) && args.length === 1) {
                var item = args[0];
                // 2014-08-24 garcia.wul 忽略seajs.config中的vars变量
                if ((item instanceof UglifyJS.AST_String) &&
                    !/\{.*?\}/.test(item.getValue())) {
                    dependencies.push(item.getValue());
                }
            }
            return true;
        }
    });
    factory.walk(walker);
    return dependencies;
};

/**
 * 替换`require`中所有的字符串，目标是将其替换成别名对应的字符串
 * 这里的`require`包括两种：require("jquery")
 * 为了扩展性比较强，这个的`require`可以是函数、对象
 * （1）如果是函数，函数原型应该类似:function(value); 形参value将会是是require中的字符串
 * （2）如果是对象，则应该是一个别名的map
 * @param ast
 * @param requireName
 * @param require
 *
 */
CmdParser.prototype.replaceRequires = function(ast, requireName, require) {
    var self = this;

    var makeFunction = function(fn) {
        if (_.isFunction(fn)) {
            return fn;
        }
        else if (_.isObject(fn)) {
            var alias = fn;
            return function(value) {
                if (_.has(alias, value)) {
                    return alias[value];
                }
                return value;
            }
        }
        else {
            return function(value) {
                return value;
            }
        }
    };

    var replaceChild = function(node, fn) {
        var args = node.args[0];
        var children = args instanceof UglifyJS.AST_Array ? args.elements: [args];
        _.each(children, function(child) {
            if (child instanceof UglifyJS.AST_String) {
                child.value = fn(child.getValue());
            }
        });
    };

    var requireFn = makeFunction(require);
    var transformer = new UglifyJS.TreeTransformer(function(node, descend) {
        if (requireFn &&
            node instanceof UglifyJS.AST_Call &&
            node.expression.name === requireName &&
            node.args.length > 0
            ) {
            return replaceChild(node, requireFn);
        }
    });
    return ast.transform(transformer);
};

module.exports = CmdParser;