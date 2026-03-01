#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs/promises');
const path = require('path');

let minify;
let JavaScriptObfuscator;

try {
    ({ minify } = require('terser'));
    JavaScriptObfuscator = require('javascript-obfuscator');
} catch (error) {
    console.error('Missing build dependencies. Install them first:');
    console.error('npm install --save-dev terser javascript-obfuscator');
    process.exit(1);
}

const ROOT_DIR = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT_DIR, 'public');
const OUTPUT_DIR = path.join(ROOT_DIR, 'public-dist');
const JS_SOURCE_DIR = path.join(SOURCE_DIR, 'js');

async function copyDirectory(source, destination) {
    await fs.mkdir(destination, { recursive: true });
    const entries = await fs.readdir(source, { withFileTypes: true });

    await Promise.all(entries.map(async (entry) => {
        const srcPath = path.join(source, entry.name);
        const dstPath = path.join(destination, entry.name);

        if (entry.isDirectory()) {
            await copyDirectory(srcPath, dstPath);
            return;
        }

        await fs.copyFile(srcPath, dstPath);
    }));
}

async function collectJsFiles(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...await collectJsFiles(fullPath));
            continue;
        }

        if (entry.isFile() && entry.name.endsWith('.js')) {
            files.push(fullPath);
        }
    }

    return files;
}

async function minifyAndObfuscate(sourceCode, fileLabel) {
    const minified = await minify(sourceCode, {
        compress: {
            passes: 2
        },
        mangle: true,
        format: {
            comments: false
        }
    });

    if (!minified || !minified.code) {
        throw new Error(`Terser failed for ${fileLabel}`);
    }

    const obfuscated = JavaScriptObfuscator.obfuscate(minified.code, {
        compact: true,
        simplify: true,
        stringArray: true,
        stringArrayThreshold: 0.8,
        identifierNamesGenerator: 'hexadecimal',
        renameGlobals: false,
        deadCodeInjection: false,
        controlFlowFlattening: false
    });

    return obfuscated.getObfuscatedCode();
}

async function buildFrontend() {
    const startedAt = Date.now();
    console.log(`Building frontend from ${SOURCE_DIR}`);

    await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
    await copyDirectory(SOURCE_DIR, OUTPUT_DIR);

    const jsFiles = await collectJsFiles(JS_SOURCE_DIR);
    let transformedCount = 0;

    for (const sourceFilePath of jsFiles) {
        const relativePath = path.relative(SOURCE_DIR, sourceFilePath);
        const outputFilePath = path.join(OUTPUT_DIR, relativePath);
        const inputCode = await fs.readFile(sourceFilePath, 'utf8');
        const outputCode = await minifyAndObfuscate(inputCode, relativePath);
        await fs.writeFile(outputFilePath, outputCode, 'utf8');
        transformedCount += 1;
    }

    const elapsedMs = Date.now() - startedAt;
    console.log(`Frontend build complete.`);
    console.log(`Output: ${OUTPUT_DIR}`);
    console.log(`Transformed JS files: ${transformedCount}`);
    console.log(`Elapsed: ${elapsedMs}ms`);
}

buildFrontend().catch((error) => {
    console.error('Frontend build failed:', error);
    process.exit(1);
});
