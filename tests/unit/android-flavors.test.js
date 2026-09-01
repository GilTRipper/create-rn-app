const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  buildProductFlavorsBlock,
  buildEnvConfigFilesBlock,
} = require("../../src/features/environments/android");

describe("Android env flavors", () => {
  it("always adds production and unique applicationIds", () => {
    const block = buildProductFlavorsBlock(
      ["local", "development", "staging"],
      "com.shop.app"
    );

    assert.ok(block.includes("flavorDimensions"));
    assert.match(block, /production\s*\{[\s\S]*?applicationId "com\.shop\.app"/);
    assert.match(block, /local\s*\{[\s\S]*?applicationId "com\.shop\.app\.local"/);
    assert.match(block, /development\s*\{[\s\S]*?applicationId "com\.shop\.app\.dev"/);
    assert.match(block, /staging\s*\{[\s\S]*?applicationId "com\.shop\.app\.staging"/);

    const ids = [...block.matchAll(/applicationId "([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(ids.length, 4);
  });

  it("maps every flavor to its .env file, including production", () => {
    const block = buildEnvConfigFilesBlock(["local", "staging"]);
    assert.ok(block.includes('localdebug: ".env.local"'));
    assert.ok(block.includes('stagingrelease: ".env.staging"'));
    assert.ok(block.includes('productiondebug: ".env.production"'));
    assert.ok(block.includes('productionrelease: ".env.production"'));
  });
});
