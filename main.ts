/// <reference path="typings/node.d.ts" />
'use strict';

interface Directory {
  branch: string,
  name: string,
  behind: boolean,
  changed: boolean,
  repoUrl: string
}

var app = require('app');  // Module to control application life.
var BrowserWindow = require('browser-window');  // Module to create native browser window.
var async = require('async');
var _ = require('lodash');
var fs = require('fs');
var openUrl = require('open');
var path = require('path');
var config = require('./config').config;
var devDir = config.devDir;
var devIgnore = ['node_modules', 'bower_components', 'configs'];
const baseGitHubUrl = 'https://github.com/';

console.log('CONFIG', config);

// Report crashes to our server.
require('crash-reporter').start();

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
var mainWindow = null;

// Quit when all windows are closed.
app.on('window-all-closed', function() {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if(process.platform != 'darwin') {
    app.quit();
  }
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.on('ready', function() {
  const ipc = require('electron').ipcMain;
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1024, height: 768, autoHideMenuBar: true});
  mainWindow.setMenu(null);

  // and load the index.html of the app.
  mainWindow.loadUrl('file://' + __dirname + '/index.html');

  // Open the DevTools.
  // mainWindow.webContents.openDevTools();

  // Emitted when the window is closed.
  mainWindow.on('closed', function() {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null;
  });

  mainWindow.webContents.on('did-finish-load', function() {
    gitDiff(function(err, directories) {
      mainWindow.webContents.send('directory-listing', directories);
    });
  });

  ipc.on('refresh-directories', function() {
    gitDiff(function(err, directories) {
      mainWindow.webContents.send('directory-listing', directories);
    });
  });

  ipc.on('open-editor', function(event, dir) {
    let sys = require('sys');
    let exec = require('child_process').exec;
    let child = exec(
      config.editor + ' ' + path.join(devDir, dir),
      {cwd: path.join(devDir, dir)},
      function(err, stdout, stderr) {
        // do nothing
      });
  });

  ipc.on('open-repo', function(event, options) {
    openUrl(`${options.repo}/tree/${options.branch}`);
  });

  ipc.on('pull-repo', function(event, repo) {
    async.series([
      function(callback) {
        pullRepo(repo, function(err, result) {
          if(err) {
            return callback(err);
          }
          mainWindow.webContents.send('pull-results', result);
          callback();
        });
      },
      function(callback) {
        gitDiffOne(repo, function(err, result) {
          if(err) {
            return callback(err);
          }
          mainWindow.webContents.send('update-repo', result);
          callback();
        });
      }
    ]);
  });
});

function pullRepo(repo: String, callback: Function) {
  let sys = require('sys');
  let exec = require('child_process').exec;
  let child = exec(
    'git pull',
    {cwd: path.join(devDir, repo)},
    function(err: Error, stdout: String, stderr: String) {
      callback(err, stdout);
    });
}

function gitDiffOne(repo: String, callback: Function) {
  let sys = require('sys');
  let exec = require('child_process').exec;
  let result = {branch: '', repo: repo, behind: true};
  let child = exec(
    'git fetch -q --all && git status -b --porcelain',
    {cwd: path.join(devDir, repo)},
    function(err, stdout, stderr) {
      if(err !== null) {
        console.log('exec error: ' + JSON.stringify(err.message));
        return callback(err);
      }
      if(stdout) {
        var lines = stdout.split('\n');
        result.branch = lines[0];
        if(!result.branch.includes('[behind')) {
          result.behind = false;
        }
        let branchName = result.branch.match(/##(.*?)\.\.\./);
        if(branchName) {
          result.branch = branchName[1].trim();
        }
      }
      callback(null, result);
    });
}

function gitDiff(callback) {
  let sys = require('sys');
  let exec = require('child_process').exec;
  async.waterfall([
    function(callback) {
      getDirs(devDir, callback);
    },
    function(result, callback) {
      async.forEachOf(result, function(directory: Directory, key, callback) {
        let child = exec(
          'git fetch -q --all && git status -b --porcelain',
          {cwd: path.join(devDir, directory.name)},
          function(err, stdout, stderr) {
          directory.changed = false;
          if(err !== null) {
            console.log('exec error: ' + JSON.stringify(err.message));
            if(err.message.includes(
              'This operation must be run in a work tree')) {
              delete result[key];
              return callback();
            }
          }
          if(stdout) {
            let lines: Array<string> = stdout.split('\n');
            // console.log('stdout: ' + lines);
            directory.branch = lines[0];
            if(directory.branch.includes('[behind')) {
              directory.behind = true;
            }
            let branchName: Array<string> =
              directory.branch.match(/##(.*?)\.\.\./);
            if(branchName) {
              directory.branch = branchName[1].trim();
            }
            if(lines.length > 2) {
              directory.changed = true;
            }
          }
          callback();
        });
      }, function(err) {
        callback(err, result);
      });
    },
    function(result: Array<Directory>, callback) {
      async.forEachOf(result, function(directory: Directory, key, callback) {
        let child = exec(
          'git config --get remote.origin.url',
          {cwd: path.join(devDir, directory.name)},
          function(err: Error, stdout: string, stderr) {
          if(stdout) {
            if(stdout.includes('https:')) {
              directory.repoUrl = stdout.replace(/(\r\n|\n|\r)/gm,"");
              return callback();
            }
            let repoPath: Array<string> =
              stdout.match(/:(.*?)(\.git|\n)/);
            directory.repoUrl = baseGitHubUrl + repoPath[1];
          }
          callback();
        });
      }, function(err) {
        callback(err, result);
      });
    }
  ], callback);
}

function getDirs(dir, callback) {
  var directories = {};
  fs.readdir(dir, function(err, files) {
    // remove ignored entries
    async.each(_.difference(files, devIgnore), function(file, callback) {
      fs.stat(path.join(dir, file), function(err, stats) {
        if(err) {
          callback(err);
        }
        if(stats.isDirectory()) {
          directories[file] = {
            name: file,
            type: 'dir'
          };
        }
        callback();
      });
    }, function(err) {
      callback(err, directories);
    });
  });
}
