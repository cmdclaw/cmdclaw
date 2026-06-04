import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

type Mode = "dry-run" | "write";

const mode = (process.argv.includes("--write") ? "write" : "dry-run") satisfies Mode;
const rootDir = process.cwd();
const sourceRoot = path.join(rootDir, "src");
const includeRoots = ["routes", "components"].map((segment) => path.join(sourceRoot, segment));
const excludedPathSegments = new Set(["legal", "admin", "internal", "api", "prototype"]);
const outputReportPath = path.join(rootDir, "tmp", "gt-codemod-report.json");
mkdirSync(path.dirname(outputReportPath), { recursive: true });

const translatableAttributeNames = new Set([
  "aria-label",
  "emptyMessage",
  "label",
  "placeholder",
  "title",
]);

const translatableCalleeNames = new Set(["alert", "confirm"]);

const translatableToastMethods = new Set(["success", "error", "warning", "info", "message"]);
const sourceFileCache = new Map<string, ts.SourceFile>();

type FileReport = {
  file: string;
  jsxTextWrapped: number;
  attributesWrapped: number;
  callsWrapped: number;
  importAdded: boolean;
  skipped: Array<{ reason: string; text: string; line: number }>;
};

const reports: FileReport[] = [];

function isTargetFile(filePath: string) {
  if (!/\.(tsx|ts)$/.test(filePath)) {
    return false;
  }
  if (/\.test\.(tsx|ts)$/.test(filePath)) {
    return false;
  }
  const relative = path.relative(sourceRoot, filePath);
  const segments = relative.split(path.sep);
  if (segments[0] === "routes" && excludedPathSegments.has(segments[1] ?? "")) {
    return false;
  }
  return true;
}

function listFiles(dir: string, files: string[] = []) {
  if (!existsSync(dir)) {
    return files;
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listFiles(fullPath, files);
    } else if (isTargetFile(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

function getSourceFile(filePath: string) {
  const cached = sourceFileCache.get(filePath);
  if (cached) {
    return cached;
  }
  const source = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  sourceFileCache.set(filePath, sourceFile);
  return sourceFile;
}

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function isHumanText(text: string) {
  const normalized = normalizeText(text);
  if (normalized.length < 2 || !/[A-Za-z]/.test(normalized)) {
    return false;
  }
  if (/^(https?:|mailto:|\/|\.\/|\.\.\/|@\/|#|[a-z]+:)/.test(normalized)) {
    return false;
  }
  if (/^[A-Z0-9_]+$/.test(normalized)) {
    return false;
  }
  if (/^[.#[\](){},:;_\-\s]+$/.test(normalized)) {
    return false;
  }
  if (
    /^(className|data-|aria-|lucide|cmd|px-|text-|bg-|border-|hover:|focus:|var\(|--|\[&|w-|h-|flex|grid|block|hidden|absolute|relative|fixed|sticky|inline|rounded|shadow|opacity|translate|scale|rotate|origin|transition|duration|ease|space-|gap-|p-|m-|z-)/.test(
      normalized,
    )
  ) {
    return false;
  }
  return true;
}

function hasImport(sourceFile: ts.SourceFile, importedName: string, moduleName = "gt-react") {
  return sourceFile.statements.some((statement) => {
    if (!ts.isImportDeclaration(statement)) {
      return false;
    }
    if (
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== moduleName
    ) {
      return false;
    }
    const clause = statement.importClause;
    if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings)) {
      return false;
    }
    return clause.namedBindings.elements.some((element) => element.name.text === importedName);
  });
}

function addImport(source: string, sourceFile: ts.SourceFile, importedName: string) {
  if (hasImport(sourceFile, importedName)) {
    return source;
  }

  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === "gt-react" &&
      statement.importClause?.namedBindings &&
      ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      const namedImports = statement.importClause.namedBindings;
      const insertAt = namedImports.elements.end;
      const prefix = namedImports.elements.length > 0 ? ", " : "";
      return `${source.slice(0, insertAt)}${prefix}${importedName}${source.slice(insertAt)}`;
    }
  }

  const firstNonImport = sourceFile.statements.find(
    (statement) => !ts.isImportDeclaration(statement),
  );
  const insertAt = firstNonImport?.getFullStart() ?? 0;
  return `${source.slice(0, insertAt)}import { ${importedName} } from "gt-react";\n${source.slice(insertAt)}`;
}

function isInsideT(node: ts.Node) {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (
      ts.isJsxElement(current) &&
      ts.isIdentifier(current.openingElement.tagName) &&
      current.openingElement.tagName.text === "T"
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function isInsideImportOrType(node: ts.Node) {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (
      ts.isImportDeclaration(current) ||
      ts.isImportSpecifier(current) ||
      ts.isTypeNode(current) ||
      ts.isInterfaceDeclaration(current) ||
      ts.isTypeAliasDeclaration(current)
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function isInsideJsxAttributeInitializer(node: ts.Node) {
  return ts.isJsxAttribute(node.parent) && node.parent.initializer === node;
}

function nearestFunctionLike(node: ts.Node) {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current) ||
      ts.isMethodDeclaration(current)
    ) {
      return current;
    }
    current = current.parent;
  }
  return undefined;
}

function functionHasUseGT(sourceFile: ts.SourceFile, fn: ts.Node) {
  let found = false;
  const visit = (node: ts.Node) => {
    if (found) {
      return;
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "t" &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      ts.isIdentifier(node.initializer.expression) &&
      node.initializer.expression.text === "useGT"
    ) {
      found = true;
      return;
    }
    if (
      node !== fn &&
      (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node))
    ) {
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(fn);
  return found;
}

function findHookInsertPosition(fn: ts.Node) {
  if (
    !(
      ts.isFunctionDeclaration(fn) ||
      ts.isFunctionExpression(fn) ||
      ts.isArrowFunction(fn) ||
      ts.isMethodDeclaration(fn)
    ) ||
    !fn.body ||
    !ts.isBlock(fn.body)
  ) {
    return undefined;
  }
  const firstStatement = fn.body.statements[0];
  return firstStatement ? firstStatement.getFullStart() : fn.body.getStart() + 1;
}

function callNeedsTranslation(node: ts.CallExpression) {
  if (ts.isPropertyAccessExpression(node.expression)) {
    const expression = node.expression;
    if (
      ts.isIdentifier(expression.expression) &&
      expression.expression.text === "toast" &&
      translatableToastMethods.has(expression.name.text)
    ) {
      return true;
    }
  }
  return ts.isIdentifier(node.expression) && translatableCalleeNames.has(node.expression.text);
}

type Replacement = { start: number; end: number; text: string };
type HookInsert = { position: number; text: string };

function lineOf(sourceFile: ts.SourceFile, position: number) {
  return sourceFile.getLineAndCharacterOfPosition(position).line + 1;
}

function transformFile(filePath: string): FileReport | null {
  const sourceFile = getSourceFile(filePath);
  const source = sourceFile.getFullText();
  const replacements: Replacement[] = [];
  const hookInserts = new Map<number, HookInsert>();
  const report: FileReport = {
    file: path.relative(rootDir, filePath),
    jsxTextWrapped: 0,
    attributesWrapped: 0,
    callsWrapped: 0,
    importAdded: false,
    skipped: [],
  };

  const ensureHook = (node: ts.Node, text: string) => {
    const fn = nearestFunctionLike(node);
    if (!fn) {
      report.skipped.push({
        reason: "no-function-for-useGT",
        text,
        line: lineOf(sourceFile, node.getStart()),
      });
      return false;
    }
    if (functionHasUseGT(sourceFile, fn)) {
      return true;
    }
    const position = findHookInsertPosition(fn);
    if (position === undefined) {
      report.skipped.push({
        reason: "function-has-no-block-body",
        text,
        line: lineOf(sourceFile, node.getStart()),
      });
      return false;
    }
    hookInserts.set(position, { position, text: "\n  const t = useGT();\n" });
    return true;
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && !isInsideT(node)) {
      const raw = node.getFullText(sourceFile);
      const normalized = normalizeText(raw);
      if (isHumanText(normalized)) {
        const leading = raw.match(/^\s*/)?.[0] ?? "";
        const trailing = raw.match(/\s*$/)?.[0] ?? "";
        replacements.push({
          start: node.getFullStart(),
          end: node.getEnd(),
          text: `${leading}<T>${normalized}</T>${trailing}`,
        });
        report.jsxTextWrapped += 1;
      }
    }

    if (
      ts.isJsxAttribute(node) &&
      ts.isIdentifier(node.name) &&
      translatableAttributeNames.has(node.name.text) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer) &&
      isHumanText(node.initializer.text)
    ) {
      if (ensureHook(node, node.initializer.text)) {
        replacements.push({
          start: node.initializer.getFullStart(),
          end: node.initializer.getEnd(),
          text: `{t(${JSON.stringify(node.initializer.text)})}`,
        });
        report.attributesWrapped += 1;
      }
    }

    if (
      ts.isCallExpression(node) &&
      callNeedsTranslation(node) &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0]) &&
      isHumanText(node.arguments[0].text)
    ) {
      const firstArg = node.arguments[0];
      if (ensureHook(node, firstArg.text)) {
        replacements.push({
          start: firstArg.getFullStart(),
          end: firstArg.getEnd(),
          text: `t(${JSON.stringify(firstArg.text)})`,
        });
        report.callsWrapped += 1;
      }
    }

    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      !isInsideImportOrType(node) &&
      !isInsideJsxAttributeInitializer(node) &&
      !ts.isCallExpression(node.parent) &&
      isHumanText(node.text) &&
      node.text.length > 80
    ) {
      report.skipped.push({
        reason: "long-string-manual-review",
        text: node.text.slice(0, 180),
        line: lineOf(sourceFile, node.getStart()),
      });
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  if (replacements.length === 0 && hookInserts.size === 0) {
    reports.push(report);
    return null;
  }

  let nextSource = source;
  const allReplacements = [
    ...replacements,
    ...Array.from(hookInserts.values()).map((insert: HookInsert) => ({
      start: insert.position,
      end: insert.position,
      text: insert.text,
    })),
  ].toSorted((a, b) => b.start - a.start);

  for (const replacement of allReplacements) {
    nextSource = `${nextSource.slice(0, replacement.start)}${replacement.text}${nextSource.slice(replacement.end)}`;
  }

  const needsT = report.jsxTextWrapped > 0 && !hasImport(sourceFile, "T");
  const needsUseGT =
    (report.attributesWrapped > 0 || report.callsWrapped > 0) && !hasImport(sourceFile, "useGT");
  if (needsT) {
    nextSource = addImport(nextSource, sourceFile, "T");
    report.importAdded = true;
  }
  if (needsUseGT) {
    const refreshedSourceFile = ts.createSourceFile(
      filePath,
      nextSource,
      ts.ScriptTarget.Latest,
      true,
      filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    nextSource = addImport(nextSource, refreshedSourceFile, "useGT");
    report.importAdded = true;
  }

  if (mode === "write") {
    writeFileSync(filePath, nextSource);
  }
  reports.push(report);
  return report;
}

for (const filePath of includeRoots.flatMap((dir) => listFiles(dir))) {
  transformFile(filePath);
}

const changedReports = reports.filter(
  (report) =>
    report.jsxTextWrapped ||
    report.attributesWrapped ||
    report.callsWrapped ||
    report.skipped.length,
);

writeFileSync(outputReportPath, `${JSON.stringify(changedReports, null, 2)}\n`);

const summary = changedReports.reduce(
  (acc, report) => {
    acc.files += report.jsxTextWrapped || report.attributesWrapped || report.callsWrapped ? 1 : 0;
    acc.jsxTextWrapped += report.jsxTextWrapped;
    acc.attributesWrapped += report.attributesWrapped;
    acc.callsWrapped += report.callsWrapped;
    acc.skipped += report.skipped.length;
    return acc;
  },
  { files: 0, jsxTextWrapped: 0, attributesWrapped: 0, callsWrapped: 0, skipped: 0 },
);

console.log(
  JSON.stringify({ mode, report: path.relative(rootDir, outputReportPath), ...summary }, null, 2),
);
