## Bedrock Development Manager
Would you like to know what branch your bedrock modules are on and if you've
got uncommited code, or if you're behind origin?

Now you can!  With Bedrock Development Manager.

## Setup

Download an Electron release [here](https://github.com/atom/electron/releases/).  And put the `electron` binary on your path.  Symlinks are OK.

Clone this repo into your `bedrock-dev` folder:
```
cd bedrock-dev
git clone git@github.com:digitalbazaar/bedrock-dev-manager.git
cd bedrock-dev-manager
npm install
npm start
```

## Configure
You may specify a path to your bedrock-dev environment and setup your editor
by modifying [config.js](https://github.com/digitalbazaar/bedrock-dev-manager/blob/master/config.js).

## Usage
Click the refresh button in the upper right hand corner whenever you'd like to
check for updates.
* pencil: open the repo in your editor (only tested with atom)
* github logo: open the repo in your browser to your current branch
* indicators: will appear when you need to commit or your behind master (or both)
* filter repos: using the drop down in the upper right hand corner
