/*
 * Integration tests for caching
 */

/* eslint-env jasmine */
'use strict';

var path = require('path');
var webpack = require('webpack');
var rimraf = require('rimraf');
var WebpackRecompilationSimulator = require('webpack-recompilation-simulator');
var HtmlWebpackPlugin = require('../index.js');
var webpackMajorVersion = require('webpack/package.json').version.split('.')[0];

var OUTPUT_DIR = path.join(__dirname, '../dist');

jasmine.getEnv().defaultTimeoutInterval = 30000;
process.traceDeprecation = true;

function setUpCompiler (htmlWebpackPlugin) {
  spyOn(htmlWebpackPlugin, 'evaluateCompilationResult').and.callThrough();
  var webpackConfig = {
    stats: {all: true},
    // Caching works only in development
    mode: 'development',
    entry: path.join(__dirname, 'fixtures/index.js'),
    output: {
      path: OUTPUT_DIR,
      filename: 'index_bundle.js'
    },
    plugins: [htmlWebpackPlugin]
  };
  if (Number(webpackMajorVersion) >= 4) {
    webpackConfig.mode = 'development';
  }
  var compiler = new WebpackRecompilationSimulator(webpack(webpackConfig));
  return compiler;
}

function getCompiledModules (statsJson) {
  const builtModules = statsJson.modules.filter(function (webpackModule) {
    return webpackModule.built;
  }).map((webpackModule) => {
    return module.userRequest;
  });
  statsJson.children.forEach((childCompilationStats) => {
    const builtChildModules = getCompiledModules(childCompilationStats);
    Array.prototype.push.apply(builtModules, builtChildModules);
  });
  return builtModules;
}

function getCompiledModuleCount (statsJson) {
  return getCompiledModules(statsJson).length;
}

function expectNoErrors (stats) {
  const errors = {
    main: stats.compilation.errors,
    childCompilation: []
  };
  stats.compilation.children.forEach((child) => {
    Array.prototype.push.apply(errors.childCompilation, child.errors);
  });
  expect(errors.main).toEqual([]);
  expect(errors.childCompilation).toEqual([]);
}

describe('HtmlWebpackPluginCaching', function () {
  beforeEach(function (done) {
    rimraf(OUTPUT_DIR, done);
  });

  it('should compile nothing if no file was changed', function (done) {
    var template = path.join(__dirname, 'fixtures/plain.html');
    var htmlWebpackPlugin = new HtmlWebpackPlugin({
      template: template
    });
    var childCompilerHash;
    var compiler = setUpCompiler(htmlWebpackPlugin);
    compiler.addTestFile(path.join(__dirname, 'fixtures/index.js'));
    compiler.run()
      // Change the template file and compile again
      .then(function () {
        childCompilerHash = htmlWebpackPlugin.childCompilerHash;
        return compiler.run();
      })
      .then(function (stats) {
        // Expect no errors:
        expectNoErrors(stats);
        // Verify that no file was built
        expect(getCompiledModules(stats.toJson()))
          .toEqual([]);
        // Verify that the html was processed only during the inital build
        expect(htmlWebpackPlugin.evaluateCompilationResult.calls.count())
          .toBe(1);
        // Verify that the child compilation was executed twice
        expect(htmlWebpackPlugin.childCompilerHash)
          .toBe(childCompilerHash);
      })
      .then(done);
  });

  it('should not compile the webpack html file if only a javascript file was changed', function (done) {
    var htmlWebpackPlugin = new HtmlWebpackPlugin();
    var compiler = setUpCompiler(htmlWebpackPlugin);
    var childCompilerHash;
    compiler.addTestFile(path.join(__dirname, 'fixtures/index.js'));
    compiler.run()
      // Change a js file and compile again
      .then(function () {
        childCompilerHash = htmlWebpackPlugin.childCompilerHash;
        compiler.simulateFileChange(path.join(__dirname, 'fixtures/index.js'), {footer: '//1'});
        return compiler.run();
      })
      .then(function (stats) {
        // Expect no errors:
        expectNoErrors(stats);
        // Verify that only one file was built
        expect(getCompiledModuleCount(stats.toJson()))
          .toBe(1);
        // Verify that the html was processed only during the inital build
        expect(htmlWebpackPlugin.evaluateCompilationResult.calls.count())
          .toBe(1);
        // Verify that the child compilation was executed only once
        expect(htmlWebpackPlugin.childCompilerHash)
          .toBe(childCompilerHash);
      })
      .then(done);
  });

  it('should compile the webpack html file even if only a javascript file was changed if caching is disabled', function (done) {
    var htmlWebpackPlugin = new HtmlWebpackPlugin({
      cache: false
    });
    var childCompilerHash;
    var compiler = setUpCompiler(htmlWebpackPlugin);
    compiler.addTestFile(path.join(__dirname, 'fixtures/index.js'));
    compiler.run()
      // Change a js file and compile again
      .then(function () {
        childCompilerHash = htmlWebpackPlugin.childCompilerHash;
        compiler.simulateFileChange(path.join(__dirname, 'fixtures/index.js'), {footer: '//1'});
        return compiler.run();
      })
      .then(function (stats) {
        // Expect no errors:
        expectNoErrors(stats);
        // Verify that only one file was built
        expect(getCompiledModuleCount(stats.toJson()))
          .toBe(1);
        // Verify that the html was processed on every run
        expect(htmlWebpackPlugin.evaluateCompilationResult.calls.count())
          .toBe(2);
        // Verify that the child compilation was executed only once
        expect(htmlWebpackPlugin.childCompilerHash)
          .toBe(childCompilerHash);
      })
      .then(done);
  });

  it('should compile the webpack html if the template file was changed', function (done) {
    var template = path.join(__dirname, 'fixtures/plain.html');
    var htmlWebpackPlugin = new HtmlWebpackPlugin({
      template: template
    });
    var childCompilerHash;
    var compiler = setUpCompiler(htmlWebpackPlugin);
    compiler.addTestFile(template);
    compiler.run()
      // Change the template file and compile again
      .then(function () {
        childCompilerHash = htmlWebpackPlugin.childCompilerHash;
        compiler.simulateFileChange(template, {footer: '<!-- 1 -->'});
        return compiler.run();
      })
      .then(function (stats) {
        // Expect no errors:
        expectNoErrors(stats);
        // Verify that only one file was built
        expect(getCompiledModuleCount(stats.toJson()))
          .toBe(1);
        // Verify that the html was processed twice
        expect(htmlWebpackPlugin.evaluateCompilationResult.calls.count())
          .toBe(2);
        // Verify that the child compilation was executed twice
        expect(htmlWebpackPlugin.childCompilerHash)
          .not.toBe(childCompilerHash);
      })
      .then(done);
  });
});
