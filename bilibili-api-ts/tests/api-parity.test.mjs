import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDir, "..");
const sourceDir = path.join(projectRoot, "vendor", "api");
const generatedDir = path.join(projectRoot, "src", "data", "api");

function toExportName(fileName) {
    const baseName = fileName.replace(/\.json$/, "");
    const camelCase = baseName
        .split(/[-_]/)
        .filter(Boolean)
        .map((part, index) =>
            index === 0
                ? part
                : part.charAt(0).toUpperCase() + part.slice(1),
        )
        .join("");

    return `${camelCase}Data`;
}

const jsonFiles = (await readdir(sourceDir))
    .filter((fileName) => fileName.endsWith(".json"))
    .sort();

for (const fileName of jsonFiles) {
    const key = fileName.replace(/\.json$/, "");
    const exportName = toExportName(fileName);

    test(`${key} matches Python JSON`, async () => {
        const sourceText = await readFile(path.join(sourceDir, fileName), "utf8");
        const generatedText = await readFile(
            path.join(generatedDir, `${key}.ts`),
            "utf8",
        );

        const prefix = `export const ${exportName} = `;
        assert.ok(
            generatedText.startsWith(prefix),
            `${key}.ts should start with "${prefix}"`,
        );

        const jsonText = generatedText
            .slice(prefix.length)
            .replace(/\s+as const;\s*$/, "");

        assert.deepStrictEqual(
            JSON.parse(jsonText),
            JSON.parse(sourceText),
            `${key}.ts must preserve the Python JSON exactly`,
        );
    });
}

test("index.ts maps every original file name to its export", async () => {
    const indexText = await readFile(path.join(generatedDir, "index.ts"), "utf8");
    const entries = new Map();

    for (const match of indexText.matchAll(
        /^\s*"([^"]+)":\s*([A-Za-z0-9_$]+),\s*$/gm,
    )) {
        entries.set(match[1], match[2]);
    }

    assert.equal(
        entries.size,
        jsonFiles.length,
        "index.ts should contain one entry per JSON file",
    );

    for (const fileName of jsonFiles) {
        const key = fileName.replace(/\.json$/, "");
        assert.equal(
            entries.get(key),
            toExportName(fileName),
            `index.ts should map "${key}" to ${toExportName(fileName)}`,
        );
    }
});
