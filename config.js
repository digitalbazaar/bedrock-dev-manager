var path = require('path');
var config = {};
module.exports.config = config;
// specify the path to the bedrock-dev folder
config.devDir = path.join(__dirname, '..');
// binary name of editor, must be on path
config.editor = 'atom';
