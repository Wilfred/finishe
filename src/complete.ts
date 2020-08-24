import * as recast from "recast";
import * as fs from "fs";
import * as path from "path";
import * as _ from "lodash";

let vm2 = require("vm2");

let b = recast.types.builders;
let n = recast.types.namedTypes;

function findFunc(ast, funcName: string) {
  for (let i = 0; i < ast.program.body.length; i++) {
    let node = ast.program.body[i];
    if (n.FunctionDeclaration.check(node)) {
      if (node.id.name === funcName) {
        return node;
      }
    }
  }
}

function appendReturn(block, name: string) {
  let id = b.identifier(name);
  let stmts = block.body;
  stmts = stmts.concat([b.returnStatement(id)]);

  return b.blockStatement(stmts);
}

function appendReturnLiteral(block, value) {
  let id = b.literal(value);
  let stmts = block.body;
  stmts = stmts.concat([b.returnStatement(id)]);

  return b.blockStatement(stmts);
}

function withPatchedSrc<T>(newSrc: string, srcPath: string, cb: () => T) {
  srcPath = path.resolve(srcPath);
  let oldSrc = fs.readFileSync(srcPath, "utf8");

  fs.writeFileSync(srcPath, newSrc);
  delete require.cache[srcPath];

  let result = cb();

  fs.writeFileSync(srcPath, oldSrc);
  delete require.cache[srcPath];

  return result;
}

function sandboxEval(srcCode: string, srcPath: string, testCode: string, testPath: string) {
  return withPatchedSrc(srcCode, srcPath, () => {
    let failureCount = 0;
    const vm = new vm2.NodeVM({
      sandbox: {
        test: function (_description, expectFn) {
          try {
            expectFn();
          } catch (e) {
            failureCount += 1;
          }
        },
      },
      requireNative: ["module"],
      require: {
        external: true,
      },
    });
    vm.run(testCode, testPath);
    return failureCount === 0;
  });
}

function parse(code: string): any {
  return recast.parse(code);
}

function evalForOutput(srcPath: string, funcName: string, testPath: string) {
  srcPath = path.resolve(srcPath);

  let src = fs.readFileSync(srcPath, "utf8");
  let srcAst = parse(src);
  let testSrc = fs.readFileSync(testPath, "utf8");

  let f = findFunc(srcAst, funcName);

  let found = null;
  let body = f.body;
  // TODO: see if it works before we change anything

  _.forEach([0, 1, -1, 2], (val) => {
    f.body = appendReturnLiteral(body, val);
    let modifiedCode = recast.print(srcAst).code;

    if (sandboxEval(modifiedCode, srcPath, testSrc, testPath)) {
      found = srcAst;
      return false;
    }
  });

  if (found) {
    return found;
  }

  _.forEach(f.params, (param) => {
    let name = param.name;
    f.body = appendReturn(body, name);
    let modifiedCode = recast.print(srcAst).code;

    if (sandboxEval(modifiedCode, srcPath, testSrc, testPath)) {
      found = srcAst;
      return false;
    }
  });

  return found;
}

function completeFromTest(srcPath: string, targetFunc: string, testPath: string) {
  let found = evalForOutput(srcPath, targetFunc, testPath);
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

completeFromTest(
  "examples/roman_numerals.js",
  "toNumber",
  "examples/roman_numerals.test.js"
);