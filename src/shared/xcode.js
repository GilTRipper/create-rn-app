const capitalize = str => str.charAt(0).toUpperCase() + str.slice(1);

function getEnvNameForScheme(env) {
  return capitalize(env);
}

function generateXcodeId() {
  return Array.from({ length: 24 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  )
    .join("")
    .toUpperCase();
}

function genId() {
  return Array.from({ length: 24 }, () =>
    Math.floor(Math.random() * 16)
      .toString(16)
      .toUpperCase()
  ).join("");
}

function generateUuid() {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  ).toUpperCase();
}

module.exports = {
  capitalize,
  getEnvNameForScheme,
  generateXcodeId,
  genId,
  generateUuid,
};
