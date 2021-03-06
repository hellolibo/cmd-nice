# cmd-nice

> 有一个将JavaScript代码转换成CMD格式

## 为什么要重复造这个轮子?

将Javascript转换成[cmd]格式之前已经有了[spmjs]的[grunt-cmd-transport]，那我为什么还要重复造这个轮子呢?原本我也是fork了一份[grunt-cmd-transport]，但在扩展的时候，总是觉得它包含了太多和[spmjs]相交融的隐形规则。我觉得这种隐形规则应该从[Gruntfile]或者[gulpfile]中去配置。当然，在开发过程中，我大量参考了[grunt-cmd-transport]之前代码，其中一些逻辑也做了简化。

另外，之前[spmjs]也提供了`合并`任务:[grunt-cmd-concat]。在我这个[cmd-nice]中直接也包含`concat`任务。

### 什么是transport?

简单说来，transport就是将js代码，转换成一个理想的cmd格式；而理想的cmd格式，包含id、dependencies等;并且，配合着[seajs-text]，[seajs]还可以加载其他任何类型的文件，因此，我们的`transport`也需要将这些类型的文件进行预编译，即转换成JavaScript文件。

这些文件通常包括：一些模板文件（如handlebars文件）、CSS文件（*.css、*.less、*.scss等）。

## 安装和使用

### 安装

````
npm install cmd-nice
````

### 命令行使用

````
usage: cmd-nice.js [-h] [-v] [--action ACTION] [--config CONFIG]
                   [--configFile CONFIGFILE] --input
                   [INPUTFILES [INPUTFILES ...]]


command line tool for cmd-nice

Optional arguments:
  -h, --help            Show this help message and exit.
  -v, --version         Show program's version number and exit.
  --action ACTION       action type: transport, debug, concat
  --config CONFIG       config for transport/debug/concat
  --configFile CONFIGFILE
                        config file
  --input [INPUTFILES [INPUTFILES ...]]
                        input files
````

### API使用

比如test.js代码如下：
````
define(function(require, exports, module) {
    var $ = require("$");
    $("body").css({
        color: "red"
    });
});
````

现在我们调用API来讲它转换成CMD格式:
````
var fs = require("fs");
var CmdNice = require("cmd-nice");
var transportConfig = {
    useCache: true,
    rootPath: process.cwd(),
    paths: [
        process.cwd()
    ],
    alias: {
        "$": "alinw/jquery/1.8.0/jquery"
    },
    aliasPaths: {},
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

var parser = new CmdNice.Script(transportConfig);
parser.execute({
    content: fs.readFileSync("./test.js", "utf-8"),
    src: fs.realpathSync("./test.js")
}).then(function(code) {
    console.log(code);
});
````

得到结果：
````
define("test", ["alinw/jquery/1.8.0/jquery"], function(require, exports, module) {
    var $ = require("alinw/jquery/1.8.0/jquery");
    $("body").css({
        color: "red"
    })
});
````

[cmd]: https://github.com/seajs/seajs/issues/242
[spmjs]: http://spmjs.io/
[grunt-cmd-transport]: https://github.com/spmjs/grunt-cmd-transport
[Gruntfile]: http://gruntjs.com/sample-gruntfile
[grunt-cmd-concat]: https://github.com/spmjs/grunt-cmd-concat
[cmd-nice]: /
[gulpfile]: https://github.com/gulpjs/gulp/
[seajs-text]: https://github.com/seajs/seajs-text
[seajs]: http://seajs.org/docs/
