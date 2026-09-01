function mockInquirerQueue(queue) {
  const inquirer = require("inquirer");
  const original = inquirer.prompt;
  const seen = [];

  inquirer.prompt = async questions => {
    const list = Array.isArray(questions) ? questions : [questions];
    seen.push(
      list.map(question => ({
        name: question.name,
        message: String(question.message || ""),
      }))
    );
    const next = queue.shift();
    if (next === undefined) {
      throw new Error(
        `Unexpected prompt: ${list.map(question => question.name).join(", ")}`
      );
    }
    return typeof next === "function" ? next(list) : next;
  };

  return {
    seen,
    restore() {
      inquirer.prompt = original;
    },
  };
}

function promptedNames(seen) {
  return seen.flatMap(group => group.map(question => question.name));
}

module.exports = { mockInquirerQueue, promptedNames };
