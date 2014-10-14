#!/usr/bin/env node
/**
 * User: garcia.wul (garcia.wul@alibaba-inc.com)
 * Date: 2014/10/14
 * Time: 10:57
 *
 */

var ArgumentParser = require('argparse').ArgumentParser;
var cardinal = require("cardinal");
var chalk = require("chalk");
var fs = require("fs");
var path = require("path");
var _ = require("underscore");
var Index = require("../index");

var argumentParser = new ArgumentParser({
    version: require("../package.json").version,
    addHelp: true,
    description: "command line tool for cmd-nice"
});
argumentParser.addArgument(["--action"], {
    description: "action type: transport, debug, concat",
    type: "string",
    required: false,
    dest: "action",
    defaultValue: "transport"
});
argumentParser.addArgument(["--config"], {
    description: "config file",
    type: "string",
    required: false,
    dest: "configFile"
});
argumentParser.addArgument(["--input"], {
    description: "input files",
    type: "string",
    required: true,
    dest: "inputFiles",
    nargs: "*"
});

var args = argumentParser.parseArgs();

var alias = {};
var aliasPaths = {};
if (fs.existsSync(args.configFile)) {
    var configContent = fs.readFileSync(args.configFile, "utf-8");
    configContent = eval(configContent);
    alias = configContent.alias;
    aliasPaths = configContent.paths;
}

var transportConfig = {
    useCache: true,
    rootPath: process.cwd(),
    paths: [
        process.cwd()
    ],
    alias: alias,
    aliasPaths: aliasPaths,
    parsers: {
        ".handlebars": Index.HandlebarsTemplate,
        ".json": Index.Json,
        ".less": Index.LessStyle,
        ".scss": Index.SassStyle,
        ".js": Index.Script,
        ".css": Index.Style,
        ".html": Index.Text,
        ".tpl": Index.UnderscoreTemplate
    },
    handlebars: {
        id: 'alinw/handlebars/1.3.0/runtime',
        knownHelpers: [
        ],
        knownHelpersOnly: false
    },
    sassOptions: {},
    lessOptions: {},
    cssOptions: {}
};

var concatConfig = {
    separator: ";",
    useCache: false,
    paths: [
        process.cwd()
    ]
};

var debugConfig = {
    postfix: "-debug"
};

if (args.action === "transport") {
    transport();
}
else if (args.action === "concat") {
    concat();
}
else if (args.action === "debug") {
    debug();
}

function transport() {
    _.each(args.inputFiles, function(fileName) {
        var extName = path.extname(fileName);
        if (!transportConfig.parsers.hasOwnProperty(extName)) {
            return;
        }
        var Parser = transportConfig.parsers[extName];
        var parser = new Parser(transportConfig);
        parser.execute({
            content: fs.readFileSync(fileName, "utf-8"),
            src: fs.realpathSync(fileName)
        }).then(function(code) {
            console.log(chalk.cyan("\n" + fileName + " after transported:\n"));
            console.log(cardinal.highlight(code));
        });
    });
}

function concat() {
    _.each(args.inputFiles, function(fileName) {
        var concat = new Index.Concat(concatConfig);
        concat.execute({
            content: fs.readFileSync(fileName, "utf-8"),
            src: fs.realpathSync(fileName)
        }).then(function(code) {
            console.log(chalk.cyan("\n" + fileName + " after concatted:\n"));
            console.log(cardinal.highlight(code));
        });
    });
}

function debug() {
    _.each(args.inputFiles, function(fileName) {
        var debug = new Index.Debug(debugConfig);
        debug.execute({
            content: fs.readFileSync(fileName, "utf-8"),
            src: fs.realpathSync(fileName)
        }).then(function(code) {
            console.log(chalk.cyan("\n" + fileName + "'s debug code:\n"));
            console.log(cardinal.highlight(code));
        });
    });
}