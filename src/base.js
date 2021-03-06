/**
 * User: garcia.wul (garcia.wul@alibaba-inc.com)
 * Date: 2014/05/22
 * Time: 22:38
 *
 */

var fs = require('graceful-fs');
var path = require("path");

var _ = require("underscore");
var Log = require("log");
var beautify = require('js-beautify');
var shutils = require("shutils");
var filesystem = shutils.filesystem;
var chalk = require("chalk");
var moment = require("moment");
var Handlebars = require("handlebars");
var fmt = require('util').format;

var logMessageTemplate = Handlebars.compile(
    "[{{{level}}} {{{now}}}] {{{message}}}\n"
);
Log.prototype.log = function(levelStr, args) {
    var now = new moment().format("YYYY-MM-DD hh:mm:ss");
    var color = function (levelStr, text) {
        if (Log[levelStr] <= 3) {
            return chalk.red(text);
        }
        else if (Log[levelStr] <= 4) {
            return chalk.cyan(text);
        }
        else if (Log[levelStr] <= 6) {
            return chalk.green(text);
        }
        return chalk.yellow(text);
    };

    if (Log[levelStr] <= this.level) {
        var msg = fmt.apply(null, args);
        this.stream.write(logMessageTemplate({
            level: color(levelStr, levelStr),
            now: color(levelStr, now),
            message: color(levelStr, msg)
        }));
    }
};

var Base = function(options) {
    var self = this;
    if (!self.options) {
        self.options = options;
    }
    else {
        self.options = _.extend(self.options, options);
    }
    if (_.isString(self.options.rootPath) && fs.existsSync(self.options.rootPath)) {
        self.options.rootPath = self.toUnixPath(self.options.rootPath);
    }
    self.logger = new Log(self.options.logLevel || "WARNING");
};

/**
 * 美化js代码
 * @param code 代码
 * @param type js/css/html,默认js
 * @returns {*}
 */
Base.prototype.beautify = function(code, type) {
    if (typeof type === "undefined") {
        var type = "js";
    }

    var beautifyOptions = {
        "indent_size": 4,
        "indent_char": " ",
        "indent_level": 0,
        "indent_with_tabs": false,
        "preserve_newlines": true,
        "max_preserve_newlines": 10,
        "jslint_happy": false,
        "brace_style": "collapse",
        "keep_array_indentation": false,
        "keep_function_indentation": false,
        "space_before_conditional": true,
        "break_chained_methods": false,
        "eval_code": false,
        "unescape_strings": false,
        "wrap_line_length": 0
    };

    var beautifier = null;
    if (type === "js") {
        beautifier = beautify.js_beautify;
    }
    else if (type === "css") {
        beautifier = beautify.css_beautify;
    }
    else if (type === "html") {
        beautifier = beautify.html_beautify;
    }
    if (beautifier) {
        return beautifier(code, beautifyOptions);
    }
    return code;
};

/**
 * 用于当解析源文件错误时，原样地输出文件
 * @param inputFile
 */
Base.prototype.dumpFileBySource = function(inputFile) {
    var self = this;
    var content = fs.readFileSync(inputFile.src, "utf-8");
    self.dumpFile(inputFile.dest, self.beautify(content, "js"));
};

/**
 * 写文件
 * @param filename
 * @param content
 */
Base.prototype.dumpFile = function(filename, content) {
    var dirName = path.dirname(filename);
    if (!fs.existsSync(filename)) {
        filesystem.makedirsSync(dirName);
    }

    fs.writeFileSync(filename, content, "utf-8");
};

/**
 * 将windows路径格式转换成unix类型的路径
 * @param pathname
 */
Base.prototype.toUnixPath = function(pathname) {
    return pathname.replace(/\\/g, '/');
};

module.exports = Base;