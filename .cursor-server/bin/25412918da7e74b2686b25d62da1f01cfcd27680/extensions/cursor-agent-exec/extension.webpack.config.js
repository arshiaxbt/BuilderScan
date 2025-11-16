/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use strict';

const withDefaults = require('../cursor.webpack.config');
const path = require('path');

module.exports = withDefaults({
	context: __dirname,
	entry: {
		main: './src/main.ts',
	},
	externals: {
		'@vscode/ripgrep': 'commonjs @vscode/ripgrep',
	},
	resolve: {
		fallback: {
			'@anysphere/proto/aiserver/v1/server_config_connect.js': path.resolve(__dirname, '../../src/proto/aiserver/v1/server_config_connectweb.js'),
		},
	}
});
