/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use strict';

const withDefaults = require('../cursor.webpack.config');
const path = require('path');
const webpack = require('webpack');

const config = withDefaults({
	context: __dirname,
	entry: {
		main: './src/main.ts',
	},
	externals: {
		// Keep Node.js built-in modules as external
		'node:crypto': 'commonjs node:crypto',
		'node:fs': 'commonjs node:fs',
		'node:path': 'commonjs node:path',
		'node:os': 'commonjs node:os',
		'node:util': 'commonjs node:util',
		'node:stream': 'commonjs node:stream',
		'node:child_process': 'commonjs node:child_process',
		'node:http': 'commonjs node:http',
		'node:https': 'commonjs node:https',
		'node:net': 'commonjs node:net',
		'node:tls': 'commonjs node:tls',
		'node:url': 'commonjs node:url',
		'node:zlib': 'commonjs node:zlib',
		'node:events': 'commonjs node:events',
		'node:buffer': 'commonjs node:buffer',
		'node:assert': 'commonjs node:assert',
		'node:process': 'commonjs node:process',
		// Also externalize non-prefixed Node.js modules
		'crypto': 'commonjs crypto',
		'fs': 'commonjs fs',
		'path': 'commonjs path',
		'os': 'commonjs os',
		'util': 'commonjs util',
		'stream': 'commonjs stream',
		'child_process': 'commonjs child_process',
		'http': 'commonjs http',
		'https': 'commonjs https',
		'net': 'commonjs net',
		'tls': 'commonjs tls',
		'url': 'commonjs url',
		'zlib': 'commonjs zlib',
		'events': 'commonjs events',
		'buffer': 'commonjs buffer',
		'assert': 'commonjs assert',
		'process': 'commonjs process',
	},
	node: {
		__dirname: false, // Don't replace __dirname - keep it as-is
		__filename: false,  // Don't replace __filename - keep it as-is
		global: false,
	}
});

// Override the node configuration to ensure it's not changed by the parent config
config.node = {
	__dirname: false,
	__filename: false,
	global: false,
};

// Ensure webpack doesn't replace __dirname with module IDs
config.optimization = config.optimization || {};
config.optimization.moduleIds = 'named';

// Add loaders for assets that Playwright MCP imports
config.module = config.module || {};
config.module.rules = config.module.rules || [];


// Add loaders for various asset types
config.module.rules.push(
	// CSS files - inline them as strings
	{
		test: /\.css$/,
		type: 'asset/source'
	},
	// Font files - inline as base64
	{
		test: /\.(woff|woff2|eot|ttf|otf)$/,
		type: 'asset/inline'
	},
	// Image files - inline as base64
	{
		test: /\.(png|jpg|jpeg|gif|svg)$/,
		type: 'asset/inline'
	},
	// HTML files - inline as strings
	{
		test: /\.html$/,
		type: 'asset/source'
	}
);

// Add plugins to handle dynamic imports and suppress warnings
config.plugins = config.plugins || [];


// Handle the dynamic imports in playwright properly
config.plugins.push(
	// Fix the dynamic require in playwright/lib/util.js
	new webpack.ContextReplacementPlugin(
		/playwright[\\\/]lib/,
		path.resolve(__dirname, 'node_modules/playwright/lib'),
		{
			// This handles the dynamic require(packageJsonPath) call
			'../package.json': '../package.json',
			'./package.json': './package.json'
		}
	),
	// Handle playwright-core dynamic imports in server/registry
	new webpack.ContextReplacementPlugin(
		/playwright-core[\\\/]lib[\\\/]server[\\\/]registry/,
		path.resolve(__dirname, 'node_modules/playwright-core/lib/server/registry'),
		{
			// Handle the dynamic require for browsers.json
			'../../../browsers.json': '../../../browsers.json',
			'browsers.json': 'browsers.json'
		}
	),
	// Handle other playwright-core dynamic imports
	new webpack.ContextReplacementPlugin(
		/playwright-core[\\\/]lib[\\\/]utilsBundleImpl/,
		path.resolve(__dirname, 'node_modules/playwright-core/lib/utilsBundleImpl')
	),
	new webpack.ContextReplacementPlugin(
		/playwright-core[\\\/]lib[\\\/]server/,
		path.resolve(__dirname, 'node_modules/playwright-core/lib/server')
	)
);

module.exports = config;
