let fs = require("fs");
let vm2 = require("vm2");
let recast = require("recast");
let b = recast.types.builders;
let n = recast.types.namedTypes;

function findFunc(ast, funcName) {
  for (let i = 0; i < ast.program.body.length; i++) {
    let node = ast.program.body[i];
    if (n.FunctionDeclaration.check(node)) {
      if (node.id.name === funcName) {
        return node;
      }
    }
  }
}

function appendReturn(block, name) {
  let id = b.identifier(name);
  let stmts = block.body;
  stmts = stmts.concat([b.returnStatement(id)]);

  return b.blockStatement(stmts);
}

function sandboxEval(code, srcPath) {
  let failureCount = 0;
  const vm = new vm2.NodeVM({
    sandbox: {
      test: function(_description, expectFn) {
        try {
          expectFn();
        } catch (e) {
          failureCount += 1;
        }
      }
    },
    requireNative: ["module"],
    require: {
      external: true
    }
  });
  vm.run(code, srcPath);
  return failureCount === 0;
}

function parse(code) {
  return recast.parse(code);
}

function evalForOutput(ast, srcPath, funcName, testSrc, testPath) {
  let f = findFunc(ast, funcName);

  let found = null;
  let body = f.body;
  f.params.forEach(param => {
    let name = param.name;
    f.body = appendReturn(body, name);
    let modifiedCode = recast.print(ast).code;

    fs.writeFileSync(srcPath, modifiedCode);

    if (sandboxEval(testSrc, testPath)) {
      found = ast;
      // TODO: early termination.
    }

    // TODO: write the original version back.
  });

  return found;
}

function completeFromTest(srcPath, targetFunc, testPath) {
  let code = fs.readFileSync(srcPath, "utf8");
  let testSrc = fs.readFileSync(testPath, "utf8");

  let ast = parse(code);
  let found = evalForOutput(ast, srcPath, targetFunc, testSrc, testPath);
  if (found === null) {
    // eslint-disable-next-line no-console
    console.log("No completion found that passes this test.");
  } else {
    // eslint-disable-next-line no-console
    console.log("Found!");
    // eslint-disable-next-line no-console
    console.log(recast.print(found).code);
  }
}

completeFromTest("roman_numerals.js", "toNumber", "roman_numerals.test.js");
