/**
 * User: garcia.wul (garcia.wul@alibaba-inc.com)
 * Date: 2014/05/27
 * Time: 17:04
 *
 */

var fs = require('graceful-fs');
var path = require("path");

var _ = require("underscore");
var StringUtils = require("underscore.string");
var cssParse = require('css-parse');
var stringify = require('css-stringify');
var isUrl = require("is-url");
var cssjoin = require('cssjoin');
var Q = require("q");

var CssConcat = function(options) {
    var self = this;
    self.options = {
        paths: []
    };
    if (_.isObject(options)) {
        self.options = _.extend(self.options, options);
    }
};

CssConcat.prototype.concat = function(source, file) {
    var self = this;
    // 2014-08-28 garcia.wul 使用(cssjoin)[https://github.com/suisho/cssjoin]来做合并
    var deferred = Q.defer();
    self.joinCss(file).then(function(extendedCss) {
        deferred.resolve(extendedCss);
    }).fail(function(error) {
        var parsed = cssParse(source);
        if (_.isObject(parsed) && _.isObject(parsed.stylesheet) &&
            _.isArray(parsed.stylesheet.rules)) {
            parsed.stylesheet.rules = self.parseImports(parsed.stylesheet.rules, file);
        }
        deferred.resolve(stringify(parsed));
    });
    return deferred.promise;
};

CssConcat.prototype.joinCss = function(file) {
    var self = this;
    var deferred = Q.defer();
    cssjoin(file, function(error, extendedCss) {
        if (error) {
            deferred.reject(error);
        }
        else {
            deferred.resolve(extendedCss);
        }
    });

    return deferred.promise;
};

CssConcat.prototype.parseImports = function(rules, file) {
    var self = this;
    var results = [];
    var urlPattern = /url\([\'|\"](.*?)[\'|\"]\)/;
    var urlPattern2 = /url\((.*?)\)/;
    _.each(rules, function(rule) {
        if (rule.type !== "import" || isUrl(rule.import) ||
            rule.import.indexOf("//") === 0) {
            results.push(rule);
            return;
        }
        var url = null;
        if (urlPattern.test(rule.import)) {
            url = urlPattern.exec(rule.import)[1];
        }
        else if (urlPattern2.test(rule.import)) {
            url = urlPattern2.exec(rule.import)[1]
        }
        else {
            url = rule.import;
        }
        url = StringUtils.strip(url);
        url = StringUtils.strip(url, {source: '"'});
        url = StringUtils.strip(url, {source: "'"});
        url = StringUtils.strip(url, {source: '"'});
        var newFile = null;
        if (url.indexOf("../") === 0 || url.indexOf("./") === 0) {
            newFile = self.findFileBySelf(url, file);
        }
        if (!newFile) {
            newFile = self.findFileByPaths(url);
        }
        if (!newFile || !fs.existsSync(newFile)) {
            results.push(rule);
            return;
        }
        var content = fs.readFileSync(newFile, "utf-8");
        var parsed = cssParse(content);
        if (_.isObject(parsed) && _.isObject(parsed.stylesheet) &&
            _.isArray(parsed.stylesheet.rules)) {
            _.each(self.parseImports(parsed.stylesheet.rules, path.normalize(newFile)), function(result) {
                results.push(result);
            });
        }
        else {
            results.push(rule);
        }
    });
    return results;
};

CssConcat.prototype.findFileBySelf = function(url, file) {
    var dirName = path.dirname(file);
    var newFile = path.join(dirName, url);
    if (fs.existsSync(newFile)) {
        return newFile;
    }
    return null;
};

CssConcat.prototype.findFileByPaths = function(url) {
    var self = this;
    var newFile = null;
    _.each(self.options.paths, function(p) {
        var tmp = path.join(p, url);
        if (newFile) {
            return;
        }
        if (fs.existsSync(tmp)) {
            newFile = tmp;
        }
    });
    return newFile;
};

module.exports = CssConcat;


