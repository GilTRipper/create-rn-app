const { mergeThreeWay, isGitAvailable } = require("./three-way");
const { ACTIONS, classifyFile, classifyAll, groupByAction } = require("./classify");

module.exports = {
  mergeThreeWay,
  isGitAvailable,
  ACTIONS,
  classifyFile,
  classifyAll,
  groupByAction,
};
