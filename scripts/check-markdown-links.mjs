import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import process, { stderr, stdout } from "node:process";

const repositoryRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const trackedPaths = execFileSync("git", ["ls-files", "-z"], {
  cwd: repositoryRoot,
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);
const trackedPathSet = new Set(trackedPaths);
const markdownPaths = trackedPaths.filter((filePath) => /\.md$/i.test(filePath));
const anchorCache = new Map();
const failures = [];
let checkedLinks = 0;

const maskCode = (markdown) => {
  let fence;

  return markdown
    .replace(/<!--[\s\S]*?-->/g, (comment) => comment.replace(/[^\n]/g, " "))
    .split("\n")
    .map((line) => {
      const marker = line.match(/^ {0,3}(`{3,}|~{3,})/u)?.[1];
      if (fence) {
        if (marker?.[0] === fence.character && marker.length >= fence.length) fence = undefined;
        return " ".repeat(line.length);
      }
      if (marker) {
        fence = { character: marker[0], length: marker.length };
        return " ".repeat(line.length);
      }
      return line.replace(/(`+)(.+?)\1/gu, (code) => " ".repeat(code.length));
    })
    .join("\n");
};

const slugify = (heading) =>
  heading
    .replace(/<[^>]*>/gu, "")
    .replace(/!?(?:\[([^\]]*)\])\([^)]*\)/gu, "$1")
    .replace(/[`*_~]/gu, "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\p{Mark}\s_-]/gu, "")
    .replace(/\s/gu, "-");

const anchorsFor = (markdownPath) => {
  const cached = anchorCache.get(markdownPath);
  if (cached) return cached;

  const markdown = maskCode(readFileSync(resolve(repositoryRoot, markdownPath), "utf8"));
  const anchors = new Set();
  const slugCounts = new Map();

  for (const line of markdown.split("\n")) {
    const heading = line.match(/^ {0,3}#{1,6}(?:\s+|$)(.*?)(?:\s+#+\s*)?$/u)?.[1];
    if (heading !== undefined) {
      const baseSlug = slugify(heading);
      const count = slugCounts.get(baseSlug) ?? 0;
      anchors.add(count === 0 ? baseSlug : `${baseSlug}-${count}`);
      slugCounts.set(baseSlug, count + 1);
    }
    for (const match of line.matchAll(/<(?:a|[^ >]+)[^>]+(?:id|name)=["']([^"']+)["'][^>]*>/giu)) {
      anchors.add(match[1]);
    }
  }

  anchorCache.set(markdownPath, anchors);
  return anchors;
};

const lineAt = (markdown, offset) => markdown.slice(0, offset).split("\n").length;
const decode = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const destinationFrom = (rawDestination) => {
  const destination = rawDestination.trim();
  if (destination.startsWith("<")) return destination.slice(1, destination.indexOf(">"));
  return destination.match(/^(?:\\.|\S)+/u)?.[0] ?? "";
};

const isIgnoredDestination = (destination) =>
  /^(?:https?:|mailto:)/iu.test(destination) ||
  /^[a-z][a-z\d+.-]*:/iu.test(destination) ||
  isAbsolute(destination) ||
  /^[a-z]:[\\/]/iu.test(destination) ||
  destination.startsWith("\\\\");

const isTrackedDirectory = (relativePath) => {
  const prefix = relativePath.endsWith("/") ? relativePath : `${relativePath}/`;
  return trackedPaths.some((trackedPath) => trackedPath.startsWith(prefix));
};

const checkDestination = (sourcePath, markdown, offset, rawDestination) => {
  const destination = destinationFrom(rawDestination);
  if (!destination || isIgnoredDestination(destination)) return;

  checkedLinks += 1;
  const [rawPath, rawFragment] = destination.split("#", 2);
  const targetPath = decode(rawPath.split("?", 1)[0]);
  const sourceDirectory = dirname(resolve(repositoryRoot, sourcePath));
  const targetAbsolute = targetPath
    ? resolve(sourceDirectory, targetPath)
    : resolve(repositoryRoot, sourcePath);
  const targetRelative = relative(repositoryRoot, targetAbsolute).split(sep).join("/");
  const location = `${sourcePath}:${lineAt(markdown, offset)}`;

  if (targetRelative.startsWith("../") || targetRelative === "..") {
    failures.push(`${location}: local link leaves the repository: ${destination}`);
    return;
  }
  if (!existsSync(targetAbsolute)) {
    failures.push(`${location}: local link target does not exist: ${destination}`);
    return;
  }

  const directory = statSync(targetAbsolute).isDirectory();
  if (!trackedPathSet.has(targetRelative) && !(directory && isTrackedDirectory(targetRelative))) {
    failures.push(`${location}: local link target is not tracked by Git: ${destination}`);
    return;
  }
  if (!rawFragment || directory || !/\.md$/iu.test(targetRelative)) return;

  const fragment = decode(rawFragment).replace(/^user-content-/u, "");
  const anchors = anchorsFor(targetRelative);
  if (!anchors.has(fragment) && !anchors.has(fragment.toLowerCase())) {
    failures.push(`${location}: Markdown anchor does not exist: ${destination}`);
  }
};

const inlineDestinations = function* (markdown) {
  for (
    let opening = markdown.indexOf("](");
    opening !== -1;
    opening = markdown.indexOf("](", opening + 2)
  ) {
    let depth = 1;
    let escaped = false;
    for (let cursor = opening + 2; cursor < markdown.length; cursor += 1) {
      const character = markdown[cursor];
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === "(") {
        depth += 1;
      } else if (character === ")" && --depth === 0) {
        yield { destination: markdown.slice(opening + 2, cursor), offset: opening };
        break;
      }
    }
  }
};

for (const sourcePath of markdownPaths) {
  const markdown = readFileSync(resolve(repositoryRoot, sourcePath), "utf8");
  const visibleMarkdown = maskCode(markdown);
  for (const { destination, offset } of inlineDestinations(visibleMarkdown)) {
    checkDestination(sourcePath, markdown, offset, destination);
  }
  for (const match of visibleMarkdown.matchAll(/^ {0,3}\[[^\]]+\]:\s*(.+)$/gmu)) {
    checkDestination(sourcePath, markdown, match.index, match[1]);
  }
}

if (failures.length > 0) {
  stderr.write(`Found ${failures.length} broken local Markdown link(s):\n`);
  for (const failure of failures) stderr.write(`- ${failure}\n`);
  process.exitCode = 1;
} else {
  stdout.write(
    `Checked ${checkedLinks} local link(s) in ${markdownPaths.length} tracked Markdown file(s).`,
  );
  stdout.write("\n");
}
