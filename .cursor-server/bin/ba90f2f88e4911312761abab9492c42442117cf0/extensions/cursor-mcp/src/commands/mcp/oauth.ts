import { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import { OAuthClientInformation, OAuthTokens, OAuthClientInformationSchema, OAuthTokensSchema } from '@modelcontextprotocol/sdk/shared/auth.js';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { McpLogger } from '../../utils/logger.js';

/** Get a server-specific logger instance */
function getLogger(identifier: string) {
	return McpLogger.getLogger(identifier);
}

/**
If you're developing on dev and need to get cursor-dev callbacks to go to dev instead of prod, quit prod then run this
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -kill -r -domain local -domain system -domain user
 */

/**
 * Get the URL protocol from the product configuration (e.g., "cursor", "cursor-nightly", "cursor-dev")
 */
function getUrlProtocol(): string {
	try {
		const productJsonPath = path.join(vscode.env.appRoot, 'product.json');
		const productJson = JSON.parse(fs.readFileSync(productJsonPath, 'utf8'));
		return productJson.urlProtocol || 'cursor';
	} catch (error) {
		McpLogger.warn('Failed to read urlProtocol from product.json, using cursor as fallback:', error);
		return 'cursor';
	}
}

const SESSION_KEYS = {
	CODE_VERIFIER: "mcp_code_verifier",
	SERVER_URL: "mcp_server_url",
	TOKENS: "mcp_tokens",
	CLIENT_INFORMATION: "mcp_client_information",
} as const;

// Generate server-specific session storage keys using identifier
export const getServerSpecificKey = (
	baseKey: string,
	identifier: string, // Use identifier instead of serverUrl
): string => {
	// Keep a prefix for clarity, although identifier should be unique
	return `[${identifier}] ${baseKey}`;
};

export type MCPOAuthNeedsAuthCallback = (authorizationUrl: URL) => void;

export class MCPOAuthClientProvider implements OAuthClientProvider {
	constructor(private context: vscode.ExtensionContext, private serverUrl: string, private identifier: string, private readonly needsAuthCallback: MCPOAuthNeedsAuthCallback) { }

	// {protocol}://anysphere.cursor-mcp/oauth/<identifier>/callback (e.g., cursor://, cursor-nightly://, cursor-dev://)
	get redirectUrl() {
		const extensionId = 'anysphere.cursor-mcp'; // must match the extension's publisher/name
		const protocol = getUrlProtocol();
		const url = `${protocol}://${extensionId}/oauth/${encodeURIComponent(this.identifier)}/callback`;
		getLogger(this.identifier).info("Using redirect URL", { url });
		return url;
	}

	get clientMetadata() {
		return {
			redirect_uris: [this.redirectUrl],
			token_endpoint_auth_method: "none",
			grant_types: ["authorization_code", "refresh_token"],
			response_types: ["code"],
			client_name: "Cursor",
		};
	}

	async clientInformation(): Promise<OAuthClientInformation | undefined> {
		const key = getServerSpecificKey(
			SESSION_KEYS.CLIENT_INFORMATION,
			this.identifier,
		);
		const value = await this.context.secrets.get(key);
		if (!value) {
			getLogger(this.identifier).info("No stored client information found");
			return undefined;
		}

		try {
			const info = await OAuthClientInformationSchema.parseAsync(JSON.parse(value));
			// If the stored client information does not contain our current redirect
			// URI, something changed (e.g. we updated the extension ID or path).
			const redirects: string[] | undefined = (info as any).redirect_uris;
			if (redirects && !redirects.includes(this.redirectUrl)) {
				getLogger(this.identifier).warn("Stored OAuth client information is out of date – re-registering");
				await this.context.secrets.delete(key);
				return undefined;
			}
			return info;
		} catch (error) {
			getLogger(this.identifier).error("Failed to parse client information from secrets", error);
			// Clear potentially corrupted data
			await this.context.secrets.delete(key);
			return undefined;
		}
	}

	async saveClientInformation(clientInformation: OAuthClientInformation): Promise<void> {
		const key = getServerSpecificKey(
			SESSION_KEYS.CLIENT_INFORMATION,
			this.identifier,
		);
		getLogger(this.identifier).info("Saving client information", {
			redirects: (clientInformation as any)?.redirect_uris?.length ?? 0,
			clientIdPresent: Boolean((clientInformation as any)?.client_id),
		});
		await this.context.secrets.store(key, JSON.stringify(clientInformation));
	}

	async tokens(): Promise<OAuthTokens | undefined> {
		const key = getServerSpecificKey(SESSION_KEYS.TOKENS, this.identifier);
		const tokens = await this.context.secrets.get(key);
		if (!tokens) {
			getLogger(this.identifier).info("No stored tokens found");
			return undefined;
		}

		try {
			return await OAuthTokensSchema.parseAsync(JSON.parse(tokens));
		} catch (error) {
			getLogger(this.identifier).error("Failed to parse tokens from secrets", error);
			// Clear potentially corrupted data
			await this.context.secrets.delete(key);
			return undefined;
		}
	}

	async saveTokens(tokens: OAuthTokens): Promise<void> {
		const key = getServerSpecificKey(SESSION_KEYS.TOKENS, this.identifier);
		getLogger(this.identifier).info("Saving tokens", {
			accessTokenLen: tokens?.access_token ? String(tokens.access_token).length : 0,
			refreshPresent: Boolean(tokens?.refresh_token),
			expiresIn: tokens?.expires_in ?? null,
		});
		await this.context.secrets.store(key, JSON.stringify(tokens));
	}

	async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
		getLogger(this.identifier).info("Redirect to authorization requested", { url: authorizationUrl.href });
		// Persist the server URL so that when the deep-link comes back we can look
		// up which OAuth flow it belongs to.
		await this.context.globalState.update(
			getServerSpecificKey(SESSION_KEYS.SERVER_URL, this.identifier),
			this.serverUrl,
		);
		getLogger(this.identifier).info("Stored server URL for OAuth flow");
		this.needsAuthCallback(authorizationUrl);
	}

	async saveCodeVerifier(codeVerifier: string): Promise<void> {
		const key = getServerSpecificKey(
			SESSION_KEYS.CODE_VERIFIER,
			this.identifier,
		);
		getLogger(this.identifier).info("Saving PKCE code verifier", { verifierLen: codeVerifier.length });
		await this.context.globalState.update(key, codeVerifier);
	}

	async codeVerifier(): Promise<string> {
		// Use identifier for key
		const key = getServerSpecificKey(
			SESSION_KEYS.CODE_VERIFIER,
			this.identifier,
		);
		const verifier = this.context.globalState.get<string>(key);
		if (!verifier) {
			getLogger(this.identifier).error(`No code verifier saved for session`);
			throw new Error(`No code verifier saved for session`);
		}

		return verifier;
	}

	async clear(): Promise<void> {
		const clientInfoKey = getServerSpecificKey(SESSION_KEYS.CLIENT_INFORMATION, this.identifier);
		const tokensKey = getServerSpecificKey(SESSION_KEYS.TOKENS, this.identifier);
		const codeVerifierKey = getServerSpecificKey(SESSION_KEYS.CODE_VERIFIER, this.identifier);
		const serverUrlKey = getServerSpecificKey(SESSION_KEYS.SERVER_URL, this.identifier);

		getLogger(this.identifier).info("Clearing stored OAuth data");
		await this.context.secrets.delete(clientInfoKey);
		await this.context.secrets.delete(tokensKey);
		await this.context.globalState.update(codeVerifierKey, undefined);
		await this.context.globalState.update(serverUrlKey, undefined);
	}

	async invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier'): Promise<void> {
		getLogger(this.identifier).info(`Invalidating credentials: ${scope}`);

		const tokensKey = getServerSpecificKey(SESSION_KEYS.TOKENS, this.identifier);
		const clientInfoKey = getServerSpecificKey(SESSION_KEYS.CLIENT_INFORMATION, this.identifier);
		const codeVerifierKey = getServerSpecificKey(SESSION_KEYS.CODE_VERIFIER, this.identifier);

		switch (scope) {
			case 'tokens':
				await this.context.secrets.delete(tokensKey);
				break;
			case 'client':
				await this.context.secrets.delete(clientInfoKey);
				break;
			case 'verifier':
				await this.context.globalState.update(codeVerifierKey, undefined);
				break;
			case 'all':
				await this.clear();
				break;
		}
	}
}