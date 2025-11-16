/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use strict';

const withDefaults = require('../cursor.webpack.config');
const path = require('path');

const config = withDefaults({
	context: __dirname,
	entry: {
		extension: './src/extension.ts',
	},
	module: {
		exprContextCritical: false,
	},
	externals: {
		'bufferutil': 'commonjs bufferutil',
		'utf-8-validate': 'commonjs utf-8-validate',
		'canvas': 'commonjs canvas',
	},
	ignoreWarnings: [/Critical dependency: the request of a dependency is an expression/],
});

// Add bufbuild paths to resolve
config.resolve = config.resolve || {};
config.resolve.alias = config.resolve.alias || {};
config.resolve.alias['external/bufbuild/protobuf.js'] = path.resolve(__dirname, '../../src/external/bufbuild/protobuf/index');
config.resolve.alias['external/bufbuild/connect.js'] = path.resolve(__dirname, './node_modules/@connectrpc/connect');

module.exports = config;

