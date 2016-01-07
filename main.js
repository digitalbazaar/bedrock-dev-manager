'use strict';
var app = require('app');
var BrowserWindow = require('browser-window');
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
require('crash-reporter').start();
var mainWindow = null;
app.on('window-all-closed', function () {
    if (process.platform != 'darwin') {
        app.quit();
    }
});
app.on('ready', function () {
    const ipc = require('electron').ipcMain;
    mainWindow = new BrowserWindow({
        width: 1024, height: 768, autoHideMenuBar: true });
    mainWindow.setMenu(null);
    mainWindow.loadUrl('file://' + __dirname + '/index.html');
    mainWindow.on('closed', function () {
        mainWindow = null;
    });
    mainWindow.webContents.on('did-finish-load', function () {
        gitDiff(function (err, directories) {
            mainWindow.webContents.send('directory-listing', directories);
        });
    });
    ipc.on('refresh-directories', function () {
        gitDiff(function (err, directories) {
            mainWindow.webContents.send('directory-listing', directories);
        });
    });
    ipc.on('open-editor', function (event, dir) {
        let sys = require('sys');
        let exec = require('child_process').exec;
        let child = exec(config.editor + ' ' + path.join(devDir, dir), { cwd: path.join(devDir, dir) }, function (err, stdout, stderr) {
        });
    });
    ipc.on('open-repo', function (event, options) {
        openUrl(`${options.repo}/tree/${options.branch}`);
    });
    ipc.on('pull-repo', function (event, repo) {
        async.series([
            function (callback) {
                pullRepo(repo, function (err, result) {
                    if (err) {
                        return callback(err);
                    }
                    mainWindow.webContents.send('pull-results', result);
                    callback();
                });
            },
            function (callback) {
                gitDiffOne(repo, function (err, result) {
                    if (err) {
                        return callback(err);
                    }
                    mainWindow.webContents.send('update-repo', result);
                    callback();
                });
            }
        ]);
    });
});
function pullRepo(repo, callback) {
    let sys = require('sys');
    let exec = require('child_process').exec;
    let child = exec('git pull', { cwd: path.join(devDir, repo) }, function (err, stdout, stderr) {
        callback(err, stdout);
    });
}
function gitDiffOne(repo, callback) {
    let sys = require('sys');
    let exec = require('child_process').exec;
    let result = { branch: '', repo: repo, behind: true };
    let child = exec('git fetch -q --all && git status -b --porcelain', { cwd: path.join(devDir, repo) }, function (err, stdout, stderr) {
        if (err !== null) {
            console.log('exec error: ' + JSON.stringify(err.message));
            return callback(err);
        }
        if (stdout) {
            var lines = stdout.split('\n');
            result.branch = lines[0];
            if (!result.branch.includes('[behind')) {
                result.behind = false;
            }
            let branchName = result.branch.match(/##(.*?)\.\.\./);
            if (branchName) {
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
        function (callback) {
            getDirs(devDir, callback);
        },
        function (result, callback) {
            async.forEachOf(result, function (directory, key, callback) {
                let cwd = path.join(devDir, directory.name);
                let child = exec('git fetch -q --all && git status -b --porcelain', { cwd: cwd }, function (err, stdout, stderr) {
                    directory.changed = false;
                    if (err !== null) {
                        console.log('exec error in directory ' + cwd + ', error: ' + JSON.stringify(err.message));
                        if (err.message.includes('This operation must be run in a work tree')) {
                            delete result[key];
                            return callback();
                        }
                    }
                    if (stdout) {
                        let lines = stdout.split('\n');
                        directory.branch = lines[0];
                        if (directory.branch.includes('[behind')) {
                            directory.behind = true;
                        }
                        let branchName = directory.branch.match(/##(.*?)\.\.\./);
                        if (branchName) {
                            directory.branch = branchName[1].trim();
                        }
                        // ignore lines that start with '??'; these indicate
                        // that there are untracked files which is different
                        // from uncommitted (we may want to also capture this
                        // status as different from `clean`)
                        lines = lines.filter(line => {
                            return line.indexOf('??') !== 0;
                        });
                        if (lines.length > 2) {
                            directory.changed = true;
                        }
                    }
                    callback();
                });
            }, function (err) {
                callback(err, result);
            });
        },
        function (result, callback) {
            async.forEachOf(result, function (directory, key, callback) {
                let child = exec('git config --get remote.origin.url', { cwd: path.join(devDir, directory.name) }, function (err, stdout, stderr) {
                    if (stdout) {
                        if (stdout.includes('https:')) {
                            directory.repoUrl = stdout.replace(/(\r\n|\n|\r)/gm, "");
                            return callback();
                        }
                        let repoPath = stdout.match(/:(.*?)(\.git|\n)/);
                        directory.repoUrl = baseGitHubUrl + repoPath[1];
                    }
                    callback();
                });
            }, function (err) {
                callback(err, result);
            });
        }
    ], callback);
}
function getDirs(dir, callback) {
    var directories = {};
    fs.readdir(dir, function (err, files) {
        async.each(_.difference(files, devIgnore), function (file, callback) {
            fs.stat(path.join(dir, file), function (err, stats) {
                if (err) {
                    callback(err);
                }
                if (stats.isDirectory()) {
                    directories[file] = {
                        name: file,
                        type: 'dir'
                    };
                }
                callback();
            });
        }, function (err) {
            callback(err, directories);
        });
    });
}
